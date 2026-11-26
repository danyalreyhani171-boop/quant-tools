"""
Market data feeds.

One interface, so swapping provider is a single class. A synthetic feed ships so the whole
pipeline can be run end to end before any data contract is signed.

Standard library only.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path
from typing import Optional, Protocol

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.sd import Bar  # noqa: E402

HOUR = 3600

INSTRUMENTS = ["XAUUSD", "GBPUSD", "NAS100", "USOUSD"]


class Feed(Protocol):
    def bars(self, symbol: str, since: Optional[int] = None) -> list[Bar]:
        """1H bars, oldest first. Higher timeframes are resampled by the engine."""
        ...


class SyntheticFeed:
    """
    Deterministic fake bars for development.

    Shapes roughly match each instrument's real behaviour — gold's wide ATR, crude's chop —
    so the pipeline exercises realistic zone counts rather than degenerate ones.
    """

    SHAPE = {
        # symbol:   (start,    drift per bar, vol,      spike chance)
        "XAUUSD":   (3745.0,  -0.055,         2.6,      0.07),
        "GBPUSD":   (1.3505,  -0.00003,       0.00055,  0.06),
        "NAS100":     (27350.0, -1.1,           38.0,     0.08),
        "USOUSD":     (85.90,   -0.0015,        0.16,     0.07),
    }

    def __init__(self, n: int = 1400, seed: int = 11):
        self.n = n
        self.seed = seed

    def bars(self, symbol: str, since: Optional[int] = None) -> list[Bar]:
        start, drift, vol, spike = self.SHAPE[symbol]
        rng = random.Random(self.seed + sum(ord(c) for c in symbol))
        dp = 5 if start < 10 else 2
        px = start
        out: list[Bar] = []
        for i in range(self.n):
            v = vol * (2.6 if rng.random() < spike else 1.0)
            o = px
            c = o + drift + rng.gauss(0, v)
            hi = max(o, c) + abs(rng.gauss(0, v * 0.45))
            lo = min(o, c) - abs(rng.gauss(0, v * 0.45))
            t = i * HOUR
            if since is None or t > since:
                out.append(Bar(t, round(o, dp), round(hi, dp), round(lo, dp), round(c, dp)))
            px = c
        return out


class HttpFeed:
    """
    Skeleton for a real provider.

    Fill in `_fetch` for whichever of Databento / Polygon / Twelve Data / EODHD you settle on.
    The two CME symbols need continuous back-adjusted series — the same requirement the Pine
    script has on the chart, and the thing to confirm before signing.
    """

    SYMBOL_MAP = {
        "XAUUSD": "XAU/USD",
        "GBPUSD": "GBP/USD",
        "NAS100":   "NQ.c.0",   # continuous, back-adjusted
        "USOUSD":   "CL.c.0",
    }

    def __init__(self, api_key: str, base: str):
        self.api_key = api_key
        self.base = base.rstrip("/")

    def bars(self, symbol: str, since: Optional[int] = None) -> list[Bar]:
        raise NotImplementedError(
            "Wire up the chosen provider here. Return 1H bars oldest first; "
            "the engine resamples 4H, D and W itself."
        )
