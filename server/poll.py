"""
The poller: pull bars, run the engine, reconcile, report what changed.

    python3 server/poll.py            # one cycle against the synthetic feed
    python3 server/poll.py --loop 300 # every 5 minutes

Standard library only.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.sd import Params, TF_SECONDS, resample  # noqa: E402
from server import store  # noqa: E402
from server.feed import INSTRUMENTS, SyntheticFeed  # noqa: E402

TFS = [("W", TF_SECONDS[0]), ("D", TF_SECONDS[1]), ("4H", TF_SECONDS[2])]


def cycle(conn, feed, instruments=None, params=None, quiet=False) -> list[dict]:
    out = []
    for inst in (instruments or INSTRUMENTS):
        since = store.last_bar_time(conn, inst)
        new = feed.bars(inst, since)
        if new:
            store.save_bars(conn, inst, new, "1H")
            # keep the resampled series stored too, so the API can read a 4H path cheaply
            all_1h = store.load_bars(conn, inst, "1H")
            for name, secs in TFS:
                store.save_bars(conn, inst, resample(all_1h, secs), name)

        summary = store.sync(conn, inst, params)
        out.append(summary)

        if not quiet:
            if "skipped" in summary:
                print(f"  {inst:<8} skipped — {summary['skipped']} ({summary['bars']} bars)")
            else:
                bits = []
                if summary["formed"]:
                    bits.append(f"+{len(summary['formed'])} formed")
                if summary["touched"]:
                    bits.append(f"{len(summary['touched'])} touched")
                if summary["invalidated"]:
                    bits.append(f"-{len(summary['invalidated'])} invalidated")
                print(f"  {inst:<8} {summary['bars']:>5} bars  {summary['live']:>2} live"
                      + (f"   {' · '.join(bits)}" if bits else ""))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="drquant.db")
    ap.add_argument("--loop", type=int, default=0, help="seconds between cycles; 0 = once")
    ap.add_argument("--bars", type=int, default=1400, help="synthetic feed length")
    args = ap.parse_args()

    conn = store.connect(args.db)
    feed = SyntheticFeed(n=args.bars)
    p = Params()

    while True:
        print(f"[{time.strftime('%H:%M:%S')}] cycle")
        cycle(conn, feed, params=p)
        if not args.loop:
            break
        time.sleep(args.loop)


if __name__ == "__main__":
    main()
