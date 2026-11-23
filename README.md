# DRQuantMTF

**Direction & Resistance Quantitative Medium Frequency Trading**

Multi-timeframe supply and demand zones, scored and self-invalidating. Weekly, daily, 4H and 1H
zones built by one set of rules, graded out of ten, and marked where the timeframes agree.

Subscription: £21.99/month.

---

## Layout

```
indicators/
  mtf-supply-demand.pine   W/D/4H/1H supply & demand zones
web/
  index.html               Product site and member terminal
```

## The signal

A zone qualifies when an impulse candle with a body of at least one ATR leaves a tight base, and the
move away clears two tests: **≥1.5 ATR** and **≥2× the zone's own height**. The base is up to six
small-bodied candles (weekly uses two, daily three). Gap-driven moves are discarded so futures rolls
and weekend gaps don't manufacture zones.

### Scoring — 10 points

| Component | Points |
|---|---|
| Departure strength | ≥2.5 ATR = 3 · ≥2 ATR = 2 · else 1 |
| Base tightness | 3 candles or fewer = 2 · else 1 |
| Break of structure | +2 |
| Fair value gap in the leg | +1 |
| Freshness | untested +2 · one test +1 |

Freshness is live, so a 9/10 becomes an 8 on first test and a 7 on second. The label reads
`D demand 9/10 ★ in W` — timeframe, side, score, and the ★ marking a zone nested inside a
higher-timeframe zone of the same direction.

### Invalidation — four ways

1. **No follow-through** — close back against the zone within two bars of forming
2. **Age limit** — 52 weekly bars, 120 daily, 60 on 4H, 120 on 1H
3. **Close beyond the far edge** — plus the cascade: weekly zones break on a daily close, daily on a 4H close
4. **Test count** — three touches and the zone is removed

Zones per side are capped: three by default, two on weekly, four on 1H.

## Instruments

XAUUSD (gold) · GBPUSD · NQ1! (Nasdaq) · CL1! (WTI crude)

One metal, one FX major, one index future, one energy future — four different drivers, so a quiet
session in one is rarely a quiet session in all of them. The engine reads price, not asset class, so
the list is configuration, not architecture. Enable back-adjustment (B-ADJ) on NQ1! and CL1!.

## Timeframes

Zones are built on W/D/4H/1H. **Alerts fire on 1H and 4H only**; weekly and daily zones still draw on
the chart and still supply the ★ confluence marking.

## Installation

Pine Script v6. Paste into the TradingView Pine Editor and add to chart. For alerts, create one with
condition "MTF S&D" and *Any alert() function call*. Each timeframe draws only on charts at or below
it, so a 1H chart shows all four.

## No performance claims

No win rate, profit factor or expectancy figure appears in this repository or on the site, and none
will until it has been measured on logged out-of-sample zones with costs included. Any such figure
quoted for supply and demand trading elsewhere is unverified.

The product is the detection, the scoring and the invalidation — not a prediction.

## Risk

Analysis tooling, not investment advice. Nothing here is a personal recommendation. Trading leveraged
instruments carries a high risk of rapid loss. A zone is a level where price reacted before; it is not
a guarantee that price will react there again.

## Engine

`engine/` is a line-for-line Python port of the Pine indicator. Pine cannot be unit
tested; this can.

```
engine/sd.py         the port — detection, scoring, lifecycle, MTF driver
engine/tests.py      50 tests pinning each rule against hand-built bars
engine/diagnose.py   score distribution, death causes, lifetimes
```

```bash
python3 engine/tests.py                  # 50 passing
python3 engine/diagnose.py               # synthetic GBPUSD-shaped downtrend
python3 engine/diagnose.py export.csv    # a TradingView export
```

Pure standard library, no dependencies. Points where Pine's semantics are ambiguous are
marked `PINE-NOTE` in the source.
