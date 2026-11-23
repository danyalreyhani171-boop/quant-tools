"""
Tests for the supply & demand engine.

Each test pins one rule from the Pine source against hand-built bars where the
expected answer is known by construction. Run: python3 engine/tests.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.sd import (  # noqa: E402
    Bar, Params, ZoneBook, ZoneEvent, atr_series, detect,
    pivot_high, pivot_low, resample, run,
)

HOUR = 3600
FAILURES: list[str] = []
PASSES = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASSES
    if cond:
        PASSES += 1
        print(f"  pass  {name}")
    else:
        FAILURES.append(f"{name}{(' — ' + detail) if detail else ''}")
        print(f"  FAIL  {name}{(' — ' + detail) if detail else ''}")


def section(t: str) -> None:
    print(f"\n{t}\n" + "-" * len(t))


# ─────────────────── helpers to build series ───────────────────

def flat(n: int, start_t: int = 0, price: float = 100.0, rng: float = 1.0) -> list[Bar]:
    """Quiet bars with a known range, so ATR settles at `rng`."""
    out = []
    for i in range(n):
        o = price + (0.05 if i % 2 else -0.05)
        c = price - (0.05 if i % 2 else -0.05)
        out.append(Bar(start_t + i * HOUR, o, price + rng / 2, price - rng / 2, c))
    return out


def terminator(t: int) -> Bar:
    """
    A big-bodied candle that stops the base scan walking backwards.

    Needed because the scan accepts ANY candle whose body is under half its range,
    and quiet warmup bars qualify — so without a terminator the base swallows the
    whole lookback. That behaviour is the engine's, not the fixture's.
    """
    return Bar(t, 99.0, 100.2, 98.8, 100.0)


def demand_setup(n_base: int = 3, impulse_to: float = 104.0) -> list[Bar]:
    """Quiet warmup, a terminator, a tight base, then one impulse up."""
    bars = flat(20)
    t = 20 * HOUR
    bars.append(terminator(t))
    t += HOUR
    for i in range(n_base):
        bars.append(Bar(t + i * HOUR, 100.0, 100.5, 99.5, 100.1))
    t += n_base * HOUR
    bars.append(Bar(t, 100.1, impulse_to + 0.2, 100.0, impulse_to))
    return bars


def supply_setup(n_base: int = 3, impulse_to: float = 96.0) -> list[Bar]:
    bars = flat(20)
    t = 20 * HOUR
    bars.append(Bar(t, 101.0, 101.2, 99.8, 100.0))   # terminator
    t += HOUR
    for i in range(n_base):
        bars.append(Bar(t + i * HOUR, 100.0, 100.5, 99.5, 99.9))
    t += n_base * HOUR
    bars.append(Bar(t, 99.9, 100.0, impulse_to - 0.2, impulse_to))
    return bars


# ─────────────────────────── tests ───────────────────────────

section("Pine builtins")

b = flat(30)
a = atr_series(b, 14)
check("ATR converges on the bar range", abs(a[-1] - 1.0) < 1e-9, f"got {a[-1]:.6f}")
check("ATR is defined from bar 0 (nz fallback)", a[0] == a[0] and a[0] > 0)

piv = [Bar(i * HOUR, 100, 100 + h, 100 - h, 100) for i, h in
       enumerate([1, 2, 5, 2, 1, 1])]
check("pivot_high finds the peak two bars back", pivot_high(piv, 4) == 105.0,
      f"got {pivot_high(piv, 4)}")
check("pivot_high is None when not yet confirmed", pivot_high(piv, 3) is None)
check("pivot_low mirrors it", pivot_low(piv, 4) == 95.0, f"got {pivot_low(piv, 4)}")

section("Zone detection — demand")

p = Params()
bars = demand_setup()
evs = detect(bars, p.sd_base, p.sd_bh, p)
check("one demand zone detected", len(evs) == 1, f"got {len(evs)}")
if evs:
    e = evs[0]
    check("marked bullish", e.bull)
    check("top is the base body high (Wick-Body)", abs(e.top - 100.1) < 1e-9, f"top={e.top}")
    check("bottom is the base wick low (Wick-Body)", abs(e.bot - 99.5) < 1e-9, f"bot={e.bot}")
    check("counted 3 base candles", e.n_base == 3, f"n_base={e.n_base}")
    check("zone time is the oldest base candle", e.time == 21 * HOUR, f"t={e.time}")

# the base scan has no notion of "this candle belongs to a different move"
plain = flat(20)
plain.append(Bar(20 * HOUR, 100.1, 104.2, 100.0, 104.0))
greedy = detect(plain, p.sd_base, p.sd_bh, p)
check("ISSUE: with no large-bodied candle to stop it, the base swallows the whole "
      "lookback", greedy and greedy[0].n_base == p.sd_base,
      f"n_base={greedy[0].n_base if greedy else 'no zone'}")

section("Zone detection — supply")

bars = supply_setup()
evs = detect(bars, p.sd_base, p.sd_bh, p)
check("one supply zone detected", len(evs) == 1, f"got {len(evs)}")
if evs:
    e = evs[0]
    check("marked bearish", not e.bull)
    check("top is the base wick high (Wick-Body)", abs(e.top - 100.5) < 1e-9, f"top={e.top}")
    check("bottom is the base body low (Wick-Body)", abs(e.bot - 99.9) < 1e-9, f"bot={e.bot}")

section("Rejection rules")

# departure too small
bars = demand_setup(impulse_to=101.6)
check("rejects when the move away is too small", len(detect(bars, p.sd_base, p.sd_bh, p)) == 0)

# zone too tall: widen the base beyond the height cap
bars = flat(20)
for i in range(3):
    bars.append(Bar((20 + i) * HOUR, 100.0, 102.0, 98.0, 100.1))
bars.append(Bar(23 * HOUR, 100.1, 110.2, 100.0, 110.0))
tall = detect(bars, p.sd_base, p.sd_bh, p)
check("rejects a zone taller than the ATR cap", len(tall) == 0, f"got {len(tall)}")

# gap
bars = demand_setup()
imp = bars[-1]
bars[-1] = Bar(imp.time, 102.0, 106.2, 101.9, 106.0)   # opens far above the prior close
check("rejects a gap-driven impulse when noGap is on",
      len(detect(bars, p.sd_base, p.sd_bh, p)) == 0)
check("accepts the same bar when noGap is off",
      len(detect(bars, p.sd_base, p.sd_bh, Params(no_gap=False))) == 1)

section("Scoring")

bars = demand_setup()
e = detect(bars, p.sd_base, p.sd_bh, p)[0]
check("departure of 2.5+ ATR scores 3", e.dep_atr >= 2.5, f"dep={e.dep_atr:.2f} ATR")
check("score is within 1..8", 1 <= e.score <= 8, f"score={e.score}")

# base tightness is dead on W and D, because mb is clamped below the threshold
check("W clamps the base to 2 candles", p.mb_for(0) == 2)
check("D clamps the base to 3 candles", p.mb_for(1) == 3)
check("BUG: on W and D, nb can never exceed 3, so base tightness is always +2",
      p.mb_for(0) <= 3 and p.mb_for(1) <= 3)

section("Zone lifecycle")

AWAY = (102.0, 101.5, 101.8)      # a bar entirely above the zone
IN   = (100.8, 100.2, 100.5)      # a bar trading inside it


def mk_book(survive_grace: bool = True, **kw) -> ZoneBook:
    """A fresh 4H demand zone at 100.0–101.0, past its two grace bars by default."""
    bk = ZoneBook(Params(**kw))
    bk.add(2, ZoneEvent(top=101.0, bot=100.0, time=0, bull=True, score=6, bar_index=0), 0)
    if survive_grace:
        bk.update(2, *AWAY)
        bk.update(2, *AWAY)
    return bk


# the grace rule, exactly as written
bk = mk_book(survive_grace=False)
bk.update(2, *IN)
check("BUG: a fresh demand zone dies the moment price trades back into it, because "
      "the grace test is `close < top` rather than `close < bottom`",
      len(bk.live(2)) == 0 and bk.dead[-1].died_of == "no-follow-through",
      bk.dead[-1].died_of if bk.dead else "still alive")

bk = mk_book(survive_grace=False)
bk.update(2, *AWAY)
bk.update(2, *AWAY)
check("…but it survives if price holds above for two bars", len(bk.live(2)) == 1)

bk = mk_book()
bk.update(2, *IN)
bk.update(2, *IN)
check("a test is counted once while price stays inside",
      bk.zones[0].tests == 1, f"tests={bk.zones[0].tests}")

bk = mk_book()
bk.update(2, *IN)
bk.update(2, *AWAY)
bk.update(2, *IN)
check("leaving and re-entering counts a second test",
      bk.zones[0].tests == 2, f"tests={bk.zones[0].tests}")

bk = mk_book()
for _ in range(3):
    bk.update(2, *IN)
    bk.update(2, *AWAY)
check("three tests removes the zone", len(bk.live(2)) == 0)
check("…recorded as the test cap", bool(bk.dead) and bk.dead[-1].died_of == "test-cap",
      bk.dead[-1].died_of if bk.dead else "none")

bk = mk_book()
bk.update(2, 102.0, 99.0, 99.5)       # far-edge close, after the grace bars
check("a close beyond the far edge kills it", len(bk.live(2)) == 0)
check("…recorded as far-edge-close",
      bool(bk.dead) and bk.dead[-1].died_of == "far-edge-close",
      bk.dead[-1].died_of if bk.dead else "none")

bk = mk_book(age_4h=5)
for _ in range(6):
    bk.update(2, *AWAY)
check("the age limit kills it", len(bk.live(2)) == 0)
check("…recorded as age", bool(bk.dead) and bk.dead[-1].died_of == "age",
      bk.dead[-1].died_of if bk.dead else "none")

# the cascade
bk = mk_book()
bk.cascade(2, 99.0)
check("a lower-timeframe close through the zone cascades it away",
      len(bk.live(2)) == 0 and bk.dead[-1].died_of == "cascade",
      bk.dead[-1].died_of if bk.dead else "still alive")

section("Confluence and caps")

bk = ZoneBook(Params())
bk.add(1, ZoneEvent(top=102.0, bot=99.0, time=0, bull=True, score=6, bar_index=0), 0)
bk.add(2, ZoneEvent(top=101.0, bot=100.0, time=0, bull=True, score=6, bar_index=0), 0)
check("a 4H zone inside a D zone is starred", bk.zones[-1].star == "D",
      f"star={bk.zones[-1].star!r}")

bk = ZoneBook(Params())
bk.add(1, ZoneEvent(top=102.0, bot=100.0, time=0, bull=True, score=6, bar_index=0), 0)
bk.add(2, ZoneEvent(top=100.0, bot=98.0, time=0, bull=True, score=6, bar_index=0), 0)
check("ISSUE: zones touching at a single price still earn the star",
      bk.zones[-1].star == "D", f"star={bk.zones[-1].star!r}")

bk = ZoneBook(Params())
bk.add(1, ZoneEvent(top=102.0, bot=99.0, time=0, bull=False, score=6, bar_index=0), 0)
bk.add(2, ZoneEvent(top=101.0, bot=100.0, time=0, bull=True, score=6, bar_index=0), 0)
check("opposite sides are not starred", bk.zones[-1].star == "")

bk = ZoneBook(Params(z_max=3))
for i in range(5):
    bk.add(2, ZoneEvent(top=101.0 + i, bot=100.0 + i, time=i, bull=True, score=6, bar_index=i), i)
check("4H keeps at most 3 demand zones", len(bk.live(2)) == 3, f"got {len(bk.live(2))}")
bk2 = ZoneBook(Params(z_max=3))
for i in range(6):
    bk2.add(0, ZoneEvent(top=101.0 + i, bot=100.0 + i, time=i, bull=True, score=6, bar_index=i), i)
check("W keeps one fewer (2)", len(bk2.live(0)) == 2, f"got {len(bk2.live(0))}")
bk3 = ZoneBook(Params(z_max=3))
for i in range(6):
    bk3.add(3, ZoneEvent(top=101.0 + i, bot=100.0 + i, time=i, bull=True, score=6, bar_index=i), i)
check("1H keeps one more (4)", len(bk3.live(3)) == 4, f"got {len(bk3.live(3))}")

section("Display score")

bk = ZoneBook(Params())
z = bk.add(2, ZoneEvent(top=101.0, bot=100.0, time=0, bull=True, score=8, bar_index=0), 0)
check("untested 8 shows as 10/10", z.display_score == 10, f"{z.display_score}")
z.tests = 1
check("after one test it shows 9/10", z.display_score == 9, f"{z.display_score}")
z.tests = 2
check("after two tests it shows 8/10", z.display_score == 8, f"{z.display_score}")

section("Resampling")

h = [Bar(i * HOUR, 100 + i, 101 + i, 99 + i, 100.5 + i) for i in range(24)]
r4 = resample(h, 14400)
check("24 hourly bars make 6 four-hour bars", len(r4) == 6, f"got {len(r4)}")
check("the 4H open is the first hour's open", r4[0].open == h[0].open)
check("the 4H close is the last hour's close", r4[0].close == h[3].close)
check("the 4H high is the max of its hours", r4[0].high == max(x.high for x in h[:4]))

section("Toggling a timeframe off")

bars = flat(400, rng=1.0)
res_on = run(bars, Params(), enabled=(True, True, True, True))
res_off = run(bars, Params(), enabled=(True, True, False, True))
check("a disabled timeframe creates no zones",
      len(res_off.book.live(2)) == 0, f"got {len(res_off.book.live(2))}")

print()
print("=" * 60)
print(f"{PASSES} passed, {len(FAILURES)} failed")
if FAILURES:
    print()
    for f in FAILURES:
        print(f"  - {f}")
print("=" * 60)
sys.exit(1 if FAILURES else 0)
