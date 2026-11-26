"""
Zone storage and the diff that turns engine output into events.

The engine is deterministic, so each cycle re-runs it over the whole history and compares the
result with what is stored. Appeared, changed and vanished become formed, touched and
invalidated. Nothing is reconstructed from a stream, so nothing can drift.

Standard library only.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Iterable, Optional

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.sd import Bar, Params, TF_NAMES, run  # noqa: E402

SCHEMA = """
CREATE TABLE IF NOT EXISTS bars (
  instrument TEXT, tf TEXT, t INTEGER,
  o REAL, h REAL, l REAL, c REAL,
  PRIMARY KEY (instrument, tf, t)
);

CREATE TABLE IF NOT EXISTS zones (
  id          TEXT PRIMARY KEY,
  instrument  TEXT NOT NULL,
  tf          TEXT NOT NULL,
  side        TEXT NOT NULL,
  top         REAL NOT NULL,
  bottom      REAL NOT NULL,
  zone_time   INTEGER NOT NULL,
  score       INTEGER NOT NULL,
  tests       INTEGER NOT NULL DEFAULT 0,
  age         INTEGER NOT NULL DEFAULT 0,
  star        TEXT,
  state       TEXT NOT NULL,
  died_of     TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS zones_live ON zones (instrument, state);

CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id TEXT NOT NULL,
  kind    TEXT NOT NULL,
  at      INTEGER NOT NULL,
  detail  TEXT
);
CREATE INDEX IF NOT EXISTS events_recent ON events (at DESC);

CREATE TABLE IF NOT EXISTS prices (
  instrument TEXT PRIMARY KEY, last REAL NOT NULL, at INTEGER NOT NULL
);
"""


def connect(path: str = "drquant.db") -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def zone_id(instrument: str, tf: str, side: str, zone_time: int) -> str:
    return f"{instrument}|{tf}|{side}|{zone_time}"


# ───────────────────────────── bars ─────────────────────────────


def save_bars(conn: sqlite3.Connection, instrument: str, bars: Iterable[Bar],
              tf: str = "1H") -> int:
    rows = [(instrument, tf, b.time, b.open, b.high, b.low, b.close) for b in bars]
    conn.executemany(
        "INSERT OR REPLACE INTO bars (instrument, tf, t, o, h, l, c) VALUES (?,?,?,?,?,?,?)",
        rows,
    )
    conn.commit()
    return len(rows)


def load_bars(conn: sqlite3.Connection, instrument: str, tf: str = "1H") -> list[Bar]:
    cur = conn.execute(
        "SELECT t, o, h, l, c FROM bars WHERE instrument = ? AND tf = ? ORDER BY t",
        (instrument, tf),
    )
    return [Bar(r["t"], r["o"], r["h"], r["l"], r["c"]) for r in cur]


def last_bar_time(conn: sqlite3.Connection, instrument: str, tf: str = "1H") -> Optional[int]:
    row = conn.execute(
        "SELECT MAX(t) AS t FROM bars WHERE instrument = ? AND tf = ?", (instrument, tf)
    ).fetchone()
    return row["t"] if row and row["t"] is not None else None


# ───────────────────────────── sync ─────────────────────────────


def sync(conn: sqlite3.Connection, instrument: str, p: Optional[Params] = None) -> dict:
    """
    Re-run the engine over everything stored for this instrument and reconcile.

    Returns a summary of what changed, which is also what the alerting layer consumes.
    """
    bars = load_bars(conn, instrument)
    if len(bars) < 30:
        return {"instrument": instrument, "skipped": "not enough bars", "bars": len(bars)}

    res = run(bars, p or Params())
    now = int(time.time())

    # what the engine says is live right now
    fresh: dict[str, dict] = {}
    for z in res.book.zones:
        tf = TF_NAMES[z.tf]
        side = "bullish" if z.bull else "bearish"
        zid = zone_id(instrument, tf, side, z.time)
        fresh[zid] = {
            "id": zid, "instrument": instrument, "tf": tf, "side": side,
            "top": z.top, "bottom": z.bot, "zone_time": z.time,
            "score": z.score, "tests": z.tests, "age": z.age,
            "star": z.star or None,
        }

    stored = {
        r["id"]: r for r in conn.execute(
            "SELECT * FROM zones WHERE instrument = ? AND state = 'live'", (instrument,)
        )
    }

    formed, touched, invalidated = [], [], []

    for zid, z in fresh.items():
        prev = stored.get(zid)
        if prev is None:
            conn.execute(
                """INSERT OR REPLACE INTO zones
                   (id, instrument, tf, side, top, bottom, zone_time, score, tests, age,
                    star, state, died_of, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?, 'live', NULL, ?, ?)""",
                (z["id"], z["instrument"], z["tf"], z["side"], z["top"], z["bottom"],
                 z["zone_time"], z["score"], z["tests"], z["age"], z["star"], now, now),
            )
            formed.append(z)
            _event(conn, zid, "formed", now, z)
        else:
            if z["tests"] != prev["tests"]:
                touched.append(z)
                _event(conn, zid, "touched", now, {"tests": z["tests"]})
            conn.execute(
                "UPDATE zones SET tests = ?, age = ?, star = ?, updated_at = ? WHERE id = ?",
                (z["tests"], z["age"], z["star"], now, zid),
            )

    # anything the engine no longer lists has been invalidated
    dead_reason = {}
    for z in res.book.dead:
        tf = TF_NAMES[z.tf]
        side = "bullish" if z.bull else "bearish"
        dead_reason[zone_id(instrument, tf, side, z.time)] = z.died_of

    for zid in set(stored) - set(fresh):
        reason = dead_reason.get(zid, "unknown")
        conn.execute(
            "UPDATE zones SET state = 'dead', died_of = ?, updated_at = ? WHERE id = ?",
            (reason, now, zid),
        )
        invalidated.append({"id": zid, "died_of": reason})
        _event(conn, zid, "invalidated", now, {"died_of": reason})

    conn.execute(
        "INSERT OR REPLACE INTO prices (instrument, last, at) VALUES (?,?,?)",
        (instrument, bars[-1].close, bars[-1].time),
    )
    conn.commit()

    return {
        "instrument": instrument,
        "bars": len(bars),
        "live": len(fresh),
        "formed": formed,
        "touched": touched,
        "invalidated": invalidated,
    }


def _event(conn: sqlite3.Connection, zid: str, kind: str, at: int, detail) -> None:
    conn.execute(
        "INSERT INTO events (zone_id, kind, at, detail) VALUES (?,?,?,?)",
        (zid, kind, at, json.dumps(detail, default=str)),
    )


# ───────────────────────────── reads ─────────────────────────────

TF_RANK = {"W": 0, "D": 1, "4H": 2, "1H": 3}


def live_zones(conn: sqlite3.Connection, instrument: Optional[str] = None) -> list[dict]:
    q = "SELECT * FROM zones WHERE state = 'live'"
    args: tuple = ()
    if instrument:
        q += " AND instrument = ?"
        args = (instrument,)
    rows = [dict(r) for r in conn.execute(q, args)]
    for r in rows:
        r["display_score"] = r["score"] + (2 if r["tests"] == 0 else 1 if r["tests"] == 1 else 0)
    rows.sort(key=lambda r: (r["instrument"], TF_RANK.get(r["tf"], 9)))
    return rows


def last_price(conn: sqlite3.Connection, instrument: str) -> Optional[float]:
    row = conn.execute("SELECT last FROM prices WHERE instrument = ?", (instrument,)).fetchone()
    return row["last"] if row else None


def price_path(conn: sqlite3.Connection, instrument: str, n: int = 17,
               tf: str = "4H") -> list[float]:
    """The closes the signal diagram draws, oldest first."""
    rows = conn.execute(
        "SELECT c FROM bars WHERE instrument = ? AND tf = ? ORDER BY t DESC LIMIT ?",
        (instrument, tf, n),
    ).fetchall()
    return [r["c"] for r in reversed(rows)]


def signals(conn: sqlite3.Connection, instruments: list[str]) -> list[dict]:
    """One entry per instrument — exactly what a signal card renders."""
    out = []
    for inst in instruments:
        zones = live_zones(conn, inst)
        px = last_price(conn, inst)
        # An instrument with no live zones still appears, with active=None. Dropping it
        # silently made GBPUSD vanish from the terminal whenever the engine had nothing live.
        for z in zones:
            z["inside"] = px is not None and z["bottom"] <= px <= z["top"]
            if px is None:
                z["distance_pct"] = None
            elif z["inside"]:
                z["distance_pct"] = 0.0
            else:
                edge = z["bottom"] if px < z["bottom"] else z["top"]
                z["distance_pct"] = round(abs(edge - px) / px * 100, 2)

        inside = [z for z in zones if z["inside"]]
        if not zones:
            active = None
        elif inside:
            active = max(inside, key=lambda z: z["display_score"])
        else:
            active = min(zones, key=lambda z: z["distance_pct"] if z["distance_pct"] is not None else 1e9)
        out.append({
            "instrument": inst,
            "price": px,
            "path": price_path(conn, inst),
            "zones": zones,
            "active": active,
            "in_zone": bool(inside),
        })
    return out


def recent_events(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    cur = conn.execute(
        """SELECT e.id, e.kind, e.at, e.detail,
                  z.instrument, z.tf, z.side, z.score, z.tests, z.died_of
           FROM events e JOIN zones z ON z.id = e.zone_id
           ORDER BY e.at DESC, e.id DESC LIMIT ?""",
        (limit,),
    )
    out = []
    for r in cur:
        d = dict(r)
        try:
            d["detail"] = json.loads(d["detail"]) if d["detail"] else None
        except (ValueError, TypeError):
            d["detail"] = None
        out.append(d)
    return out
