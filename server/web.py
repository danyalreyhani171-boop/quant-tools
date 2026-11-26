"""
The terminal page, served by Python.

The marketing site is static and can sit on free hosting. The terminal cannot: it needs the
zone store, which needs the engine, which needs bars. So it is a server-rendered page — this
module reads the store, injects the real zones as JSON, and serves it.

    python3 server/web.py --db drquant.db --port 8080

        /                 -> /terminal
        /terminal         the page
        /api/signals      the same data as JSON
        /api/zones
        /api/events
        /api/health

Standard library only. Put a real server in front of it for production — this is the
reference implementation, not a hardened one.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import store  # noqa: E402
from server.feed import INSTRUMENTS  # noqa: E402

TEMPLATE = Path(__file__).resolve().parent / "templates" / "terminal.html"

CONFIG = {
    "db": "drquant.db",
    "live": False,          # --live says the store is fed by MT5 rather than the synthetic feed
    "account": "Preview · not live yet",
}


def engine_version() -> str:
    """Read it off the Pine header so the page cannot claim a version the code is not."""
    pine = Path(__file__).resolve().parent.parent / "indicators" / "mtf-supply-demand.pine"
    try:
        for line in pine.read_text().splitlines()[:40]:
            if line.strip().startswith("// v"):
                return line.strip().split()[1]
    except OSError:
        pass
    return "v2"


def page(db: str) -> tuple[str, float]:
    """Render the terminal. Returns the HTML and how long the data took to assemble."""
    t0 = time.perf_counter()
    conn = store.connect(db)
    try:
        payload = {
            "signals": store.signals(conn, INSTRUMENTS),
            "events": store.recent_events(conn, 40),
            "tick_note": "live feed" if CONFIG["live"] else "simulated ticks",
        }
    finally:
        conn.close()
    ms = (time.perf_counter() - t0) * 1000

    live = CONFIG["live"]
    html = TEMPLATE.read_text()
    subs = {
        "__DATA__": json.dumps(payload, default=str, separators=(",", ":")),
        "__ENGINE__": engine_version(),
        "__DBNAME__": Path(db).name,
        "__RENDERED__": datetime.now(timezone.utc).strftime("%H:%M:%S UTC"),
        "__MS__": f"{ms:.0f}",
        "__N_INSTRUMENTS__": str(len(payload["signals"])),
        "__ACCOUNT__": CONFIG["account"],
        "__SOURCE_LABEL__": "LIVE" if live else "DEMO",
        "__SOURCE_NOTE__": (
            "zones are computed by the engine from the MetaTrader 5 feed."
            if live else
            "the store is filled from the synthetic feed, and the candles move on a "
            "simulated tick. The zones below are real engine output over that data — the "
            "detection, scoring and invalidation are the production code."
        ),
    }
    for k, v in subs.items():
        html = html.replace(k, v)
    return html, ms


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "DRQuantMTF"

    def _send(self, body: bytes, ctype: str, code: int = 200) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200) -> None:
        self._send(json.dumps(obj, default=str).encode(), "application/json", code)

    def do_GET(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        q = parse_qs(u.query)

        if u.path in ("/", ""):
            self.send_response(302)
            self.send_header("Location", "/terminal")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if u.path == "/terminal":
            try:
                html, _ = page(CONFIG["db"])
            except Exception as exc:  # a broken store should say so, not 500 blankly
                self._send(
                    f"<pre>terminal failed to render: {exc}</pre>".encode(),
                    "text/html; charset=utf-8", 500,
                )
                return
            self._send(html.encode(), "text/html; charset=utf-8")
            return

        if u.path.startswith("/api/"):
            conn = store.connect(CONFIG["db"])
            try:
                if u.path == "/api/health":
                    n = conn.execute(
                        "SELECT COUNT(*) c FROM zones WHERE state='live'"
                    ).fetchone()["c"]
                    self._json({"ok": True, "live_zones": n, "live_feed": CONFIG["live"]})
                elif u.path == "/api/signals":
                    self._json({"signals": store.signals(conn, INSTRUMENTS)})
                elif u.path == "/api/zones":
                    self._json({"zones": store.live_zones(conn, q.get("instrument", [None])[0])})
                elif u.path == "/api/events":
                    self._json({"events": store.recent_events(
                        conn, min(int(q.get("limit", [50])[0]), 500))})
                else:
                    self._json({"error": "not found"}, 404)
            finally:
                conn.close()
            return

        self._send(b"not found", "text/plain", 404)

    def log_message(self, fmt, *a):
        sys.stderr.write("  %s %s\n" % (self.address_string(), fmt % a))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="drquant.db")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--live", action="store_true",
                    help="the store is fed by MT5, not the synthetic feed")
    ap.add_argument("--account", default=CONFIG["account"])
    args = ap.parse_args()

    CONFIG["db"] = args.db
    CONFIG["live"] = args.live
    CONFIG["account"] = args.account

    if not Path(args.db).exists():
        print(f"no store at {args.db} — run:  python3 server/poll.py --db {args.db}")

    print(f"terminal  http://{args.host}:{args.port}/terminal")
    print(f"store     {args.db}   feed: {'MT5' if args.live else 'synthetic'}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
