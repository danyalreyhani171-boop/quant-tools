"""
MetaTrader 5 feed.

Pulls H1 bars straight from a running MT5 terminal. Free, full broker history, no exchange
licensing, and because it pulls rather than waiting for pushes there are no missed bars.

REQUIREMENTS
    pip install MetaTrader5
    A running MT5 terminal, logged in, on the SAME machine. The package is Windows-only, so
    the poller needs a Windows VPS or MT5 under Wine. A demo account is enough — the price
    feed is the same.

SYMBOL NAMES ARE BROKER-SPECIFIC. NAS100 is USTEC, US100, NDX100 or NAS100.cash depending on
who you are with, and crude is USOIL, WTI, CRUDE or XTIUSD. Run `print_symbols()` once against
your broker and fill in SYMBOLS below.

SERVER TIME MATTERS. The broker's server timezone decides when the daily and weekly candle
opens, which decides where the D and W zones sit. `detect_session_offset()` reads it from the
terminal; feed the result into Params(session_offset=...) or the D/W zones will not match
your chart.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.sd import Bar  # noqa: E402

# our name -> the broker's name. Check these against print_symbols() before relying on them.
SYMBOLS = {
    "XAUUSD": "XAUUSD",
    "GBPUSD": "GBPUSD",
    "NQ1!":   "NAS100",   # CFD — no expiry, no rolls, no CME licence
    "CL1!":   "USOIL",    # CFD
}


def _mt5():
    try:
        import MetaTrader5 as mt5  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on the host
        raise RuntimeError(
            "MetaTrader5 is not installed, or this is not Windows. "
            "pip install MetaTrader5, and run the poller on a machine with the terminal open."
        ) from exc
    return mt5


class MT5Feed:
    """Implements the same Feed interface as SyntheticFeed and HttpFeed."""

    def __init__(self, symbols: Optional[dict[str, str]] = None,
                 login: Optional[int] = None, password: str = "", server: str = ""):
        self.symbols = symbols or SYMBOLS
        self._mt5 = _mt5()
        ok = (self._mt5.initialize(login=login, password=password, server=server)
              if login else self._mt5.initialize())
        if not ok:
            raise RuntimeError(f"MT5 initialize failed: {self._mt5.last_error()}")

    def close(self) -> None:
        self._mt5.shutdown()

    def print_symbols(self, needle: str = "") -> None:
        """Run once to find what your broker calls things."""
        for s in self._mt5.symbols_get():
            if needle.upper() in s.name.upper():
                print(f"  {s.name:<24} {s.description}")

    def detect_session_offset(self) -> int:
        """
        Seconds to pass as Params(session_offset=...).

        The terminal reports server time; the gap to UTC is the broker's offset, and the daily
        candle opens at midnight *server* time. Negating it moves the bucket boundary to match.
        Re-check after a DST change — most brokers shift.
        """
        tick = self._mt5.symbol_info_tick(next(iter(self.symbols.values())))
        if tick is None:
            return 0
        server_now = datetime.fromtimestamp(tick.time, tz=timezone.utc)
        true_now = datetime.now(timezone.utc)
        hours = round((server_now - true_now).total_seconds() / 3600)
        return -hours * 3600

    def bars(self, symbol: str, since: Optional[int] = None, count: int = 5000) -> list[Bar]:
        mt5 = self._mt5
        broker_symbol = self.symbols.get(symbol, symbol)

        if not mt5.symbol_select(broker_symbol, True):
            raise RuntimeError(
                f"{broker_symbol!r} is not available on this account. "
                f"Run print_symbols() to find the broker's name for {symbol}."
            )

        if since is None:
            rates = mt5.copy_rates_from_pos(broker_symbol, mt5.TIMEFRAME_H1, 0, count)
        else:
            rates = mt5.copy_rates_range(
                broker_symbol, mt5.TIMEFRAME_H1,
                datetime.fromtimestamp(since + 1, tz=timezone.utc),
                datetime.now(timezone.utc),
            )

        if rates is None or len(rates) == 0:
            return []

        out = [Bar(int(r["time"]), float(r["open"]), float(r["high"]),
                   float(r["low"]), float(r["close"])) for r in rates]

        # the most recent bar is still forming — the engine is closed-bar only
        now = datetime.now(timezone.utc).timestamp()
        if out and out[-1].time + 3600 > now:
            out.pop()
        return out


if __name__ == "__main__":
    # python3 server/feed_mt5.py            list every symbol
    # python3 server/feed_mt5.py NAS         filter
    feed = MT5Feed()
    try:
        needle = sys.argv[1] if len(sys.argv) > 1 else ""
        print(f"symbols matching {needle!r}:")
        feed.print_symbols(needle)
        off = feed.detect_session_offset()
        print(f"\nsession offset: {off} s  ({off // 3600:+d}h)")
        print(f"pass this as Params(session_offset={off})")
        for name in SYMBOLS:
            try:
                b = feed.bars(name, count=200)
                print(f"  {name:<8} {len(b):>4} H1 bars, last close {b[-1].close}" if b
                      else f"  {name:<8} no bars")
            except RuntimeError as e:
                print(f"  {name:<8} {e}")
    finally:
        feed.close()
