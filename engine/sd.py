"""
Supply & demand engine — a faithful port of mtf-supply-demand.pine (Pine v6).

The point of this module is that Pine cannot be unit tested. Every rule here is a
line-for-line translation of the Pine source so the logic can be run, tested and
measured off-chart. Where Pine semantics are ambiguous the choice is marked PINE-NOTE.

Pure standard library. No dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Optional

# ───────────────────────────── data ─────────────────────────────


@dataclass(frozen=True)
class Bar:
    time: int          # epoch seconds, bar open
    open: float
    high: float
    low: float
    close: float

    @property
    def body(self) -> float:
        return abs(self.close - self.open)

    @property
    def range(self) -> float:
        return self.high - self.low

    @property
    def up(self) -> bool:
        # Pine: close > open. A doji is NOT up.
        return self.close > self.open


@dataclass
class Params:
    """Mirrors the indicator inputs, same defaults."""
    sd_base: int = 6            # sdBase  — max base candles
    sd_body: float = 50.0       # sdBody  — base body <= % of its range
    sd_bh: float = 1.5          # sdBH    — zone height <= x ATR
    sd_dep: float = 1.5         # sdDep   — move away >= x ATR
    sd_edge: str = "Wick-Body"  # sdEdge
    sd_tests: int = 3           # sdTests — remove after N tests
    no_gap: bool = True         # noGap
    z_max: int = 3              # zMax    — zones per side
    fixed: bool = True          # the v2 corrections; set False to reproduce v1 behaviour
    session_offset: int = 0     # seconds to shift the D/W candle boundary off UTC midnight
    age_w: int = 52
    age_d: int = 120
    age_4h: int = 60
    age_1h: int = 120

    def max_age(self, tf: int) -> int:
        return (self.age_w, self.age_d, self.age_4h, self.age_1h)[tf]

    def cap_for_side(self, tf: int) -> int:
        # Pine: math.max(1, zMax + (i == 0 ? -1 : i == 3 ? 1 : 0))
        bump = -1 if tf == 0 else (1 if tf == 3 else 0)
        return max(1, self.z_max + bump)

    def mb_for(self, tf: int) -> int:
        # Pine clamps the base length on the two highest timeframes.
        if tf == 0:
            return min(self.sd_base, 2)
        if tf == 1:
            return min(self.sd_base, 3)
        return self.sd_base

    def cap_for(self, tf: int) -> float:
        # Pine clamps the height cap on W and D to 1.0 ATR.
        return min(self.sd_bh, 1.0) if tf in (0, 1) else self.sd_bh


TF_NAMES = ("W", "D", "4H", "1H")
TF_SECONDS = (604800, 86400, 14400, 3600)


# ─────────────────────── Pine builtins, ported ───────────────────────


def true_range(bars: list[Bar], i: int) -> float:
    """ta.tr(true) — the handle_na=true form uses high-low on the first bar."""
    b = bars[i]
    if i == 0:
        return b.high - b.low
    pc = bars[i - 1].close
    return max(b.high - b.low, abs(b.high - pc), abs(b.low - pc))


def atr_series(bars: list[Bar], length: int = 14) -> list[float]:
    """
    ta.atr(length) == ta.rma(ta.tr(true), length).

    ta.rma is Wilder's smoothing, seeded with the SMA of the first `length` values.
    Before the seed is available Pine returns na; the indicator falls back to a
    cumulative mean, which is reproduced here so the two agree bar for bar.
    """
    n = len(bars)
    tr = [true_range(bars, i) for i in range(n)]
    out: list[float] = [float("nan")] * n
    if n == 0:
        return out

    running = 0.0
    rma: Optional[float] = None
    for i in range(n):
        running += tr[i]
        if i < length - 1:
            # Pine's atr is na here; the script's nz() fallback is the cumulative mean.
            out[i] = running / (i + 1)
            continue
        if rma is None:
            rma = sum(tr[: length]) / length
        else:
            rma = (rma * (length - 1) + tr[i]) / length
        out[i] = rma
    return out


def pivot_high(bars: list[Bar], i: int, left: int = 2, right: int = 2) -> Optional[float]:
    """
    ta.pivothigh(high, left, right) evaluated at bar i: returns the pivot value if
    bar (i - right) is a pivot high, else None.

    PINE-NOTE: Pine requires the candidate to be strictly greater than the bars on
    both sides. Ties therefore produce no pivot. Matched here.
    """
    c = i - right
    if c - left < 0 or i >= len(bars):
        return None
    v = bars[c].high
    for k in range(c - left, c):
        if bars[k].high >= v:
            return None
    for k in range(c + 1, i + 1):
        if bars[k].high >= v:
            return None
    return v


def pivot_low(bars: list[Bar], i: int, left: int = 2, right: int = 2) -> Optional[float]:
    c = i - right
    if c - left < 0 or i >= len(bars):
        return None
    v = bars[c].low
    for k in range(c - left, c):
        if bars[k].low <= v:
            return None
    for k in range(c + 1, i + 1):
        if bars[k].low <= v:
            return None
    return v


# ───────────────────────── zone detection (f_sd) ─────────────────────────


@dataclass
class ZoneEvent:
    """One zone as f_sd would emit it."""
    top: float
    bot: float
    time: int        # time of the oldest base candle
    bull: bool       # bullish when True
    score: int       # zs — the 8-point part, before freshness
    bar_index: int   # index of the bar that confirmed it
    # diagnostics, not part of the Pine port
    dep_atr: float = 0.0
    height_atr: float = 0.0
    n_base: int = 0
    bos: bool = False
    fvg: bool = False


def detect(bars: list[Bar], mb: int, cap: float, p: Params) -> list[ZoneEvent]:
    """
    f_sd(mb, cap) run across a whole series.

    Returns the zones in the order the script would have created them. The caller is
    responsible for the [1] shift the Pine version applies on return; here the event
    carries the index of the bar that confirmed it, which is equivalent and clearer.
    """
    n = len(bars)
    out: list[ZoneEvent] = []
    if n == 0:
        return out

    atr = atr_series(bars, 14)
    sh: Optional[float] = None   # last confirmed pivot high
    sl: Optional[float] = None   # last confirmed pivot low
    sh_i: int = -1               # the bar it sits on (fixed mode only)
    sl_i: int = -1
    last_zone_time: Optional[int] = None

    def at(k: int, i: int) -> Optional[Bar]:
        """bars[i - k], i.e. Pine's source[k] evaluated at bar i."""
        j = i - k
        return bars[j] if j >= 0 else None

    for i in range(n):
        b = bars[i]
        a = atr[i]
        if a <= 0:
            continue

        ph = pivot_high(bars, i)
        pl = pivot_low(bars, i)
        if ph is not None:
            sh, sh_i = ph, i - 2
        if pl is not None:
            sl, sl_i = pl, i - 2

        up = b.up
        prev = at(1, i)
        if prev is None:
            continue

        # impulse candle: body >= 1 ATR, and not a gap if noGap
        if not (b.body >= a and (not p.no_gap or abs(b.open - prev.close) <= 0.5 * a)):
            continue

        # walk back up to two further legs in the same direction
        leg = 1
        for k in (1, 2):
            bk = at(k, i)
            bk1 = at(k + 1, i)
            if bk is None or bk1 is None:
                break
            same = (bk.close > bk.open) if up else (bk.close < bk.open)
            if same and bk.body > 0.5 * bk.range and (
                not p.no_gap or abs(bk.open - bk1.close) <= 0.5 * a
            ):
                leg += 1
            else:
                break

        # the base: small-bodied candles immediately behind the leg
        #
        # The original expands across every qualifying candle up to mb and only checks the
        # height cap once, at the end. A base that was valid at two candles is therefore
        # thrown away because the scan kept going and blew the cap. In fixed mode the scan
        # stops at the last candle that still fits, keeping the tight zone.
        nb = 0
        hi = lo = bh = bl = 0.0
        for k in range(leg, leg + mb):
            bk = at(k, i)
            if bk is None:
                break
            if not (bk.body <= p.sd_body / 100.0 * bk.range or bk.body <= 0.25 * a):
                break
            n_hi = bk.high if nb == 0 else max(hi, bk.high)
            n_lo = bk.low if nb == 0 else min(lo, bk.low)
            if p.fixed and nb > 0 and (n_hi - n_lo) > cap * a:
                break
            nb += 1
            hi, lo = n_hi, n_lo
            if nb == 1:
                bh, bl = max(bk.open, bk.close), min(bk.open, bk.close)
            else:
                bh = max(bh, bk.open, bk.close)
                bl = min(bl, bk.open, bk.close)

        # fallback: no small base, but the candle behind the leg is opposite-coloured
        if nb == 0:
            bl_ = at(leg, i)
            if bl_ is not None and (
                (bl_.close < bl_.open) if up else (bl_.close > bl_.open)
            ):
                nb = 1
                hi, lo = bl_.high, bl_.low
                bh, bl = max(bl_.open, bl_.close), min(bl_.open, bl_.close)

        if nb == 0:
            continue

        dep = (b.close - hi) if up else (lo - b.close)
        oldest = at(leg + nb - 1, i)
        if oldest is None:
            continue
        t_b = oldest.time

        height = hi - lo
        if not (height <= cap * a
                and dep >= max(2.0 * height, p.sd_dep * a)
                and t_b != (last_zone_time if last_zone_time is not None else 0)):
            continue

        # break of structure against the last confirmed pivot
        # PINE-NOTE: `close > na` is falsey in Pine, so no pivot means no BOS point.
        #
        # Pivots confirm two bars late, so the "prior swing" can be one the impulse leg
        # made itself — the leg then scores for breaking structure it just created. In
        # fixed mode the pivot has to predate the base.
        oldest_i = i - (leg + nb - 1)
        if up:
            bos = sh is not None and b.close > sh and (not p.fixed or sh_i < oldest_i)
        else:
            bos = sl is not None and b.close < sl and (not p.fixed or sl_i < oldest_i)

        # fair value gap anywhere inside the departure leg
        fvg = False
        for k in range(0, leg):
            bk = at(k, i)
            bk2 = at(k + 2, i)
            if bk is None or bk2 is None:
                continue
            if (bk.low > bk2.high) if up else (bk.high < bk2.low):
                fvg = True

        if p.fixed:
            # Score against the gate this zone actually had to clear, so the bands keep
            # discriminating when sdDep is changed, and scale the base threshold to the
            # timeframe's own cap, so W and D can't collect a free +2.
            gate = max(2.0 * height, p.sd_dep * a)
            dep_pts = 3 if dep >= 1.667 * gate else (2 if dep >= 1.333 * gate else 1)
            base_pts = 2 if nb <= max(1, (mb + 1) // 2) else 1   # W→1, D→2, 4H/1H→3
        else:
            dep_pts = 3 if dep >= 2.5 * a else (2 if dep >= 2.0 * a else 1)
            base_pts = 2 if nb <= 3 else 1
        score = dep_pts + base_pts + (2 if bos else 0) + (1 if fvg else 0)

        wick_body = p.sd_edge == "Wick-Body"
        top = bh if (up and wick_body) else hi
        bot = bl if ((not up) and wick_body) else lo

        last_zone_time = t_b
        out.append(ZoneEvent(
            top=top, bot=bot, time=t_b, bull=up, score=score, bar_index=i,
            dep_atr=dep / a, height_atr=height / a, n_base=nb, bos=bos, fvg=fvg,
        ))

    return out


# ───────────────────────── zone lifecycle ─────────────────────────


@dataclass
class Zone:
    top: float
    bot: float
    time: int
    bull: bool
    score: int          # the 8-point part
    tf: int
    star: str = ""
    tests: int = 0
    age: int = 0
    inside: bool = False
    alive: bool = True
    died_of: str = ""
    born_at: int = 0    # index in the driving series, for diagnostics

    @property
    def display_score(self) -> int:
        """f_txt: the live score shown on the chart, freshness included."""
        fresh = 2 if self.tests == 0 else (1 if self.tests == 1 else 0)
        return self.score + fresh

    def label(self) -> str:
        side = "bullish" if self.bull else "bearish"
        star = f" ★ in {self.star}" if self.star else ""
        return f"{TF_NAMES[self.tf]} {side} {self.display_score}/10{star}"


class ZoneBook:
    """f_add / f_upd / f_kill / f_brk, holding every live zone across all timeframes."""

    def __init__(self, p: Params):
        self.p = p
        self.zones: list[Zone] = []
        self.dead: list[Zone] = []
        self.alerts: list[str] = []

    # f_kill
    def _kill(self, idx: int, reason: str) -> None:
        z = self.zones.pop(idx)
        z.alive = False
        z.died_of = reason
        self.dead.append(z)

    # f_add
    def add(self, tf: int, ev: ZoneEvent, at_index: int) -> Zone:
        z = Zone(top=ev.top, bot=ev.bot, time=ev.time, bull=ev.bull,
                 score=ev.score, tf=tf, born_at=at_index)

        # confluence: the highest timeframe whose same-side zone overlaps this one
        # PINE-NOTE: the test is overlap, not containment.
        hi = 9
        for q in self.zones:
            if q.tf < min(tf, hi) and q.bull == ev.bull and q.top >= ev.bot and q.bot <= ev.top:
                hi = q.tf
        if hi < 9:
            z.star = TF_NAMES[hi]

        self.zones.append(z)

        # cap per timeframe and side — oldest goes first
        same = [k for k, q in enumerate(self.zones) if q.tf == tf and q.bull == ev.bull]
        if len(same) > self.p.cap_for_side(tf):
            self._kill(same[0], "cap")

        if z.star:
            self.alerts.append(f"new {z.label()}")
        return z

    # f_upd
    def update(self, tf: int, high: float, low: float, close: float) -> None:
        for k in range(len(self.zones) - 1, -1, -1):
            z = self.zones[k]
            if z.tf != tf:
                continue

            in_now = high >= z.bot and low <= z.top
            if in_now and not z.inside:
                z.tests += 1
                if z.tests == 1:
                    self.alerts.append(f"price reached a fresh {z.label()}")
            z.inside = in_now
            z.age += 1

            reason = ""
            if z.age <= 2 and (close < z.top if z.bull else close > z.bot):
                reason = "no-follow-through"
            elif z.age > self.p.max_age(tf) - (1 if self.p.fixed else 0):
                # the original dies at cap + 1, so a zone outlives its setting by a bar
                reason = "age"
            elif (close < z.bot) if z.bull else (close > z.top):
                reason = "far-edge-close"
            elif z.tests >= self.p.sd_tests:
                reason = "test-cap"

            if reason:
                self._kill(k, reason)

    # f_brk — a higher timeframe's zones broken by a lower timeframe's close
    def cascade(self, tf: int, close: float) -> None:
        for k in range(len(self.zones) - 1, -1, -1):
            z = self.zones[k]
            if z.tf == tf and ((close < z.bot) if z.bull else (close > z.top)):
                self._kill(k, "cascade")

    def live(self, tf: Optional[int] = None) -> list[Zone]:
        return [z for z in self.zones if tf is None or z.tf == tf]


# ───────────────────────── multi-timeframe driver ─────────────────────────


def resample(bars: list[Bar], seconds: int, offset: int = 0) -> list[Bar]:
    """
    Aggregate 1H bars into a higher timeframe.

    `offset` shifts the bucket boundary off UTC midnight. It matters because the broker's
    server timezone decides when the daily and weekly candle opens, and that changes where
    the D and W zones sit. An MT5 broker on GMT+3 wants offset = -3 * 3600, so the day
    breaks at 21:00 UTC exactly as it does on the chart. Leave it at 0 for UTC-aligned data.
    """
    out: list[Bar] = []
    cur: Optional[list] = None
    for b in bars:
        bucket = ((b.time - offset) // seconds) * seconds + offset
        if cur is None or cur[0] != bucket:
            if cur is not None:
                out.append(Bar(cur[0], cur[1], cur[2], cur[3], cur[4]))
            cur = [bucket, b.open, b.high, b.low, b.close]
        else:
            cur[2] = max(cur[2], b.high)
            cur[3] = min(cur[3], b.low)
            cur[4] = b.close
    if cur is not None:
        out.append(Bar(cur[0], cur[1], cur[2], cur[3], cur[4]))
    return out


@dataclass
class RunResult:
    book: ZoneBook
    events: dict[int, list[ZoneEvent]] = field(default_factory=dict)

    def all_zones(self) -> list[Zone]:
        return self.book.zones + self.book.dead


def run(
    bars_1h: list[Bar],
    p: Optional[Params] = None,
    enabled: tuple[bool, bool, bool, bool] = (True, True, True, True),
) -> RunResult:
    """
    f_step for all four timeframes, stepped in chart order.

    `bars_1h` is the chart series. Higher timeframes are derived from it, which is what
    request.security does on a 1H chart.
    """
    p = p or Params()
    book = ZoneBook(p)

    # the session offset only moves the D and W boundaries; 4H buckets stay aligned to the hour
    series = {
        0: resample(bars_1h, TF_SECONDS[0], p.session_offset),
        1: resample(bars_1h, TF_SECONDS[1], p.session_offset),
        2: resample(bars_1h, TF_SECONDS[2]),
        3: bars_1h,
    }

    events: dict[int, list[ZoneEvent]] = {}
    by_time: dict[int, dict[int, ZoneEvent]] = {}
    for tf in range(4):
        evs = detect(series[tf], p.mb_for(tf), p.cap_for(tf), p)
        events[tf] = evs
        # key each event by the time of the bar that confirmed it
        by_time[tf] = {series[tf][e.bar_index].time: e for e in evs}

    # walk the chart, firing each timeframe as its bar closes
    cursor = {tf: -1 for tf in range(4)}
    for i, cb in enumerate(bars_1h):
        for tf in range(4):
            s = series[tf]
            # the index of the bar of this timeframe that closed at or before cb
            nxt = cursor[tf] + 1
            if nxt >= len(s):
                continue
            # Pine reads time[1]: a timeframe steps once its *previous* bar is complete
            if nxt + 1 < len(s) and s[nxt + 1].time <= cb.time:
                cursor[tf] = nxt
                closed = s[nxt]

                if tf in (1, 2):
                    book.cascade(tf - 1, closed.close)

                # Maintenance runs whether or not the timeframe is switched on. The
                # original has it inside the toggle, so turning a timeframe off mid-session
                # freezes its zones: they stop ageing, stop counting tests and never die.
                if enabled[tf] or p.fixed:
                    book.update(tf, closed.high, closed.low, closed.close)
                if enabled[tf]:
                    ev = by_time[tf].get(closed.time)
                    if ev is not None:
                        book.add(tf, ev, i)

    return RunResult(book=book, events=events)


# ───────────────────────── csv loading ─────────────────────────


def load_csv(path: str) -> list[Bar]:
    """
    Load OHLC from a TradingView export.

    Accepts a header with time/open/high/low/close in any order. `time` may be epoch
    seconds or an ISO timestamp.
    """
    import csv
    from datetime import datetime, timezone

    bars: list[Bar] = []
    with open(path, newline="") as fh:
        for row in csv.DictReader(fh):
            keys = {k.strip().lower(): k for k in row}
            t_raw = row[keys.get("time") or keys.get("date") or keys.get("timestamp")]
            try:
                t = int(float(t_raw))
            except ValueError:
                t = int(datetime.fromisoformat(
                    t_raw.replace("Z", "+00:00")
                ).replace(tzinfo=timezone.utc).timestamp())
            bars.append(Bar(
                time=t,
                open=float(row[keys["open"]]),
                high=float(row[keys["high"]]),
                low=float(row[keys["low"]]),
                close=float(row[keys["close"]]),
            ))
    bars.sort(key=lambda b: b.time)
    return bars
