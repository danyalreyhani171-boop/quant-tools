# DRQuantMTF — backend scope

How the site stops being a mockup and starts serving real zones.

---

## 1. The architectural fork

There are two ways to get zones into a database. They are not equal.

### Option A — TradingView as the engine, webhooks as the feed

Your Pine script fires alerts; a webhook endpoint catches them and writes to a database.

**Against it:**

- **State is reconstructed from an event stream.** The backend never sees the whole picture,
  only "a zone formed", "a zone was touched". Miss one alert and the database is wrong, with
  nothing to detect that it is wrong.
- **Alert quotas.** 4 instruments × 4 timeframes needs a lot of concurrent alerts, and
  TradingView caps them by plan tier.
- **No history.** Alerts only fire going forward. You cannot backfill, so you cannot build the
  track record that lets you raise the price.
- **An outage is permanent data loss.** No replay.

### Option B — run the engine server-side ← recommended

Pull OHLC bars, run the zone engine yourself, write zones to a database.

**For it:**

- **You already have the engine.** `engine/sd.py` is a faithful, tested port of your Pine
  script: same detection, same scoring, same four invalidation rules, same cascade, same caps.
  55 tests pin the behaviour. It is not a prototype, it is the production engine.
- **State is derived, never reconstructed.** The engine is deterministic, so you re-run it over
  history and get the same answer every time. Nothing to drift.
- **Backfill.** Run it over two years of bars and you have a zone log from day one — which is
  the thing standing between you and a published hit rate.
- **No TradingView dependency.** No alert caps, no plan tier, no silent failures.
- **The Pine script stays** as the member-facing chart overlay, if you ever hand it out. It just
  stops being load-bearing.

**Against it:** you pay for market data, and futures data carries licensing cost.

**Decision: Option B.** The only real cost is the data feed, and Option A's failure mode —
a database that is quietly wrong — is fatal for a paid product.

---

## 2. Shape

```
  data provider  ──▶  poller  ──▶  engine (engine/sd.py)  ──▶  SQLite/Postgres
   (OHLC bars)        every          detect + lifecycle          zones, events,
                      5 min          diff vs stored state        bars, prices
                                              │
                                              ├──▶ alerts  (email / Telegram / webhook)
                                              │
                                              └──▶ HTTP API ──▶ the site
```

The poller runs on a schedule, pulls any new 1H bars, re-runs the engine over the full history
for that instrument, diffs the result against what is stored, and writes the difference. Zones
that appeared are `formed` events, zones that vanished are `invalidated`, changed test counts
are `touched`. Alerts fire off those events.

Re-running everything each cycle sounds wasteful. It is not: four instruments at a few thousand
bars each is well under a second, and it removes every class of drift bug.

---

## 3. Data — MetaTrader 5

Four instruments, H1 bars. 4H, D and W are resampled by the engine, so the feed only needs one
granularity.

**Decision: pull from a running MT5 terminal, using CFDs for the index and the oil.**

| Our name | Broker symbol | Why |
|---|---|---|
| XAUUSD | XAUUSD | Spot |
| GBPUSD | GBPUSD | Spot |
| NQ1! | NAS100 / USTEC | **CFD** — no expiry, no rolls, no CME licence |
| CL1! | USOIL / WTI | **CFD** — same |

Why this over a paid data API or TradingView webhooks:

| | TradingView webhooks | Paid data API | **MT5** |
|---|---|---|---|
| Cost | Free | £20-100/mo, more for CME | **Free** |
| Backfill | None | Yes | **Yes, broker history** |
| Missed bars | Lost for good | No | **No — it pulls** |
| CME licence | Applies to the futures | Applies to the futures | **Not needed, CFDs** |
| Contract rolls | Yes | Yes | **None** |

Three things this costs:

- **Windows.** The `MetaTrader5` package needs the terminal running on the same machine, and
  is Windows-only. The poller wants a Windows VPS, or MT5 under Wine.
- **Broker-specific prices.** CFD quotes differ slightly between brokers, so a member on
  another broker sees levels a few points off. Immaterial for a zone band; say so in the copy.
- **Server time decides the D and W candles.** See below.

### Session offset

The broker's server timezone sets when the daily and weekly candle opens, and that moves where
the D and W zones sit. Brokers usually run GMT+2/+3 with DST, not UTC.

`resample()` takes an `offset`, and `Params(session_offset=...)` carries it through. Read it
from the terminal with `MT5Feed.detect_session_offset()` — for a GMT+3 broker that is
`-10800`, putting the day break at 21:00 UTC exactly as the chart shows it. **Re-check after
each DST change**, or the D and W zones will quietly drift by an hour.

The 4H buckets stay aligned to the hour and are unaffected.

### Swapping provider later

Everything sits behind one interface, so moving to a paid feed is one file:

```python
class Feed(Protocol):
    def bars(self, symbol: str, since: int) -> list[Bar]: ...
```

Worth doing when broker-specific pricing or the Windows requirement starts to hurt. Providers
to price then: EODHD, Twelve Data, fastFOREX, Polygon, Databento.

---

## 4. Schema

```sql
CREATE TABLE bars (
  instrument TEXT, tf TEXT, t INTEGER,
  o REAL, h REAL, l REAL, c REAL,
  PRIMARY KEY (instrument, tf, t)
);

CREATE TABLE zones (
  id          TEXT PRIMARY KEY,   -- instrument|tf|side|zone_time
  instrument  TEXT NOT NULL,
  tf          TEXT NOT NULL,      -- W D 4H 1H
  side        TEXT NOT NULL,      -- demand supply
  top         REAL NOT NULL,
  bottom      REAL NOT NULL,
  zone_time   INTEGER NOT NULL,   -- open of the oldest base candle
  score       INTEGER NOT NULL,   -- the 8-point part, before freshness
  tests       INTEGER NOT NULL DEFAULT 0,
  age         INTEGER NOT NULL DEFAULT 0,
  star        TEXT,               -- confluence timeframe, or NULL
  state       TEXT NOT NULL,      -- live | dead
  died_of     TEXT,               -- no-follow-through | age | far-edge-close | test-cap | cascade | cap
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX zones_live ON zones (instrument, state);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id TEXT NOT NULL REFERENCES zones(id),
  kind    TEXT NOT NULL,          -- formed | touched | invalidated
  at      INTEGER NOT NULL,
  detail  TEXT
);
CREATE INDEX events_recent ON events (at DESC);

CREATE TABLE prices (instrument TEXT PRIMARY KEY, last REAL NOT NULL, at INTEGER NOT NULL);
```

`zone_time` as part of the key is what makes the diff stable — it is the zone's identity in the
engine too, so the same zone keeps the same row across re-runs.

The `events` table is the zone log on the site, and it is the raw material for the performance
statistics you are not yet publishing.

---

## 5. API

| Endpoint | Returns |
|---|---|
| `GET /api/signals` | One entry per instrument: the zone in play, its score breakdown, the full zone stack and the recent price path — everything a signal card needs |
| `GET /api/zones` | All live zones, optionally filtered by instrument |
| `GET /api/events` | The zone log, paginated |
| `GET /api/prices` | Last close per instrument |
| `POST /api/alerts/prefs` | A member's alert settings |

All member endpoints behind a session check. Public gets the marketing page only.

---

## 6. Subscriptions

**Paddle, not raw Stripe.** Paddle acts as merchant of record and handles EU VAT, which you owe
from the first euro of a digital sale to a consumer with no threshold. For a solo operator the
extra percent is cheaper than the compliance.

Flow: Paddle checkout → webhook sets `subscription_active` → session cookie gates the API.
Cancellation and failed payment webhooks flip it back.

---

## 7. Hosting

Low traffic, one scheduled job, a small database. Any of Railway, Render or Fly.io will do it
for single-digit pounds a month. Postgres when you outgrow SQLite, which will not be soon —
four instruments produce a few thousand rows a year.

The site becomes static files served from the same host, fetching the API. That also removes
the artifact sandbox limitation, which is what blocks live data today.

---

## 8. Build order

1. **Feed + poller + engine + SQLite.** No web layer. Prove zones land correctly and match the
   chart. This is the whole product; everything else is delivery.
2. **Backfill.** Run the engine over all available history and populate `events`. You now have a
   zone log, and the beginnings of a measurable hit rate.
3. **Read-only API**, and point the existing frontend at it instead of its hardcoded arrays.
4. **Auth + Paddle.**
5. **Alerts** — email first, Telegram second, webhook third.

Step 1 is the only one with real unknowns. Steps 3 to 5 are plumbing.

---

## 9. Open questions

- Cost and licensing for NQ1! and CL1! bars, and whether the provider back-adjusts continuous
  contracts.
- How far back history goes — this sets how quickly you can publish a measured hit rate.
- Whether the Pine script is ever handed to members as a chart overlay, or stays internal.
