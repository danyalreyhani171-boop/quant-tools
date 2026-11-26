"""
Diagnostics for the bearish & bullish engine.

Runs the engine over a series and reports what it actually produced: how many zones,
how they scored, what killed them and how long they lived. Built to answer the question
the chart raised — why is every zone 10/10.

    python3 engine/diagnose.py                 # synthetic downtrend, GBPUSD-shaped
    python3 engine/diagnose.py path/to.csv     # a TradingView export
"""

from __future__ import annotations

import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.sd import (  # noqa: E402
    Bar, Params, TF_NAMES, detect, load_csv, resample, run,
)

HOUR = 3600


def synth_downtrend(n: int = 520, seed: int = 7, start: float = 1.3480,
                    end: float = 1.3016) -> list[Bar]:
    """
    A GBPUSD-shaped 1H series: steady downward drift with realistic noise and the
    occasional sharp leg. Shaped to match the chart in question, not fitted to it.
    """
    rng = random.Random(seed)
    drift = (end - start) / n
    px = start
    bars: list[Bar] = []
    for i in range(n):
        vol = 0.00055 * (2.6 if rng.random() < 0.06 else 1.0)   # occasional impulse
        o = px
        step = drift + rng.gauss(0, vol)
        c = o + step
        hi = max(o, c) + abs(rng.gauss(0, vol * 0.45))
        lo = min(o, c) - abs(rng.gauss(0, vol * 0.45))
        bars.append(Bar(i * HOUR, round(o, 5), round(hi, 5), round(lo, 5), round(c, 5)))
        px = c
    return bars


def bar_chart(counts: Counter, keys, width: int = 34) -> list[str]:
    top = max(counts.values()) if counts else 0
    out = []
    for k in keys:
        v = counts.get(k, 0)
        fill = 0 if top == 0 else round(width * v / top)
        out.append(f"  {str(k):>5} │{'█' * fill}{'·' * (width - fill)} {v}")
    return out


def main() -> None:
    if len(sys.argv) > 1:
        bars = load_csv(sys.argv[1])
        label = f"{sys.argv[1]} — {len(bars)} bars"
    else:
        bars = synth_downtrend()
        label = f"synthetic GBPUSD-shaped downtrend — {len(bars)} 1H bars"

    p = Params()
    res = run(bars, p)
    every = res.all_zones()

    print("=" * 66)
    print(f"  {label}")
    print(f"  {bars[0].close:.5f} → {bars[-1].close:.5f}")
    print("=" * 66)

    # ── what got created, per timeframe ──
    print("\nZONES CREATED, per timeframe and side")
    print(f"  {'tf':<4} {'bars':>6} {'bullish':>8} {'bearish':>8} {'total':>7}")
    series = {0: resample(bars, 604800), 1: resample(bars, 86400),
              2: resample(bars, 14400), 3: bars}
    for tf in range(4):
        evs = res.events[tf]
        d = sum(1 for e in evs if e.bull)
        s = sum(1 for e in evs if not e.bull)
        print(f"  {TF_NAMES[tf]:<4} {len(series[tf]):>6} {d:>8} {s:>8} {len(evs):>7}")

    total_d = sum(1 for tf in range(4) for e in res.events[tf] if e.bull)
    total_s = sum(1 for tf in range(4) for e in res.events[tf] if not e.bull)
    print(f"\n  bullish {total_d} · bearish {total_s}", end="")
    if total_d + total_s:
        print(f"  →  {100 * total_s / (total_d + total_s):.0f}% of zones are bearish")
    else:
        print()

    # ── the score distribution: the question the chart raised ──
    print("\nDISPLAY SCORE at creation (score + freshness, untested = +2)")
    disp = Counter(e.score + 2 for tf in range(4) for e in res.events[tf])
    for line in bar_chart(disp, range(3, 11)):
        print(line)
    n_all = sum(disp.values())
    if n_all:
        tens = disp.get(10, 0)
        print(f"\n  {tens}/{n_all} zones ({100 * tens / n_all:.0f}%) are born 10/10")
        print(f"  distinct scores seen: {sorted(disp)}")

    # ── which component is responsible ──
    print("\nSCORE COMPONENTS — how often each one maxes out")
    evs_all = [e for tf in range(4) for e in res.events[tf]]
    if evs_all:
        n = len(evs_all)
        dep3 = sum(1 for e in evs_all if e.dep_atr >= 2.5)
        base2 = sum(1 for e in evs_all if e.n_base <= 3)
        bos = sum(1 for e in evs_all if e.bos)
        fvg = sum(1 for e in evs_all if e.fvg)
        rows = [
            ("departure ≥ 2.5 ATR → 3/3", dep3),
            ("base ≤ 3 candles → 2/2", base2),
            ("break of structure → +2", bos),
            ("fair value gap → +1", fvg),
        ]
        for name, v in rows:
            pct = 100 * v / n
            flag = "   ← never discriminates" if pct >= 99 else ""
            print(f"  {name:<30} {v:>4}/{n}  {pct:>5.1f}%{flag}")

        deps = sorted(e.dep_atr for e in evs_all)
        print(f"\n  departure in ATR: min {deps[0]:.2f} · "
              f"median {deps[len(deps) // 2]:.2f} · max {deps[-1]:.2f}")
        hts = sorted(e.height_atr for e in evs_all)
        print(f"  zone height in ATR: min {hts[0]:.2f} · "
              f"median {hts[len(hts) // 2]:.2f} · max {hts[-1]:.2f}")

    # ── what killed them ──
    print("\nHOW ZONES ENDED")
    causes = Counter(z.died_of for z in res.book.dead)
    causes["still live"] = len(res.book.zones)
    for k, v in causes.most_common():
        print(f"  {k:<22} {v:>4}")

    # ── lifetimes, in their own bars ──
    print("\nLIFETIME, in the zone's own bars")
    for tf in range(4):
        ages = [z.age for z in every if z.tf == tf]
        if not ages:
            continue
        ages.sort()
        cap = p.max_age(tf)
        over = sum(1 for a in ages if a > cap)
        print(f"  {TF_NAMES[tf]:<4} n={len(ages):<4} median {ages[len(ages) // 2]:>4} "
              f"max {ages[-1]:>4}   (cap {cap})" +
              (f"   ← {over} EXCEEDED THE CAP" if over else ""))

    # ── what is on the chart right now ──
    print("\nLIVE AT THE END")
    live = sorted(res.book.zones, key=lambda z: (z.tf, -z.display_score))
    if not live:
        print("  nothing")
    for z in live:
        print(f"  {z.label():<28} {z.bot:.5f} – {z.top:.5f}   "
              f"tests {z.tests}/{p.sd_tests}  age {z.age}")

    print()


if __name__ == "__main__":
    main()
