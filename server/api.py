"""
Read-only JSON API over the zone store.

    python3 server/api.py --port 8787

    GET /api/signals     one entry per instrument — what a signal card renders
    GET /api/zones       live zones, ?instrument= to filter
    GET /api/events      the zone log
    GET /api/prices      last close per instrument
    GET /api/health

Standard library only. In production this sits behind the session check described in
docs/backend.md; everything here is read-only and has no auth yet.
"""

from __future__ import annotations

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import store  # noqa: E402
from server.feed import INSTRUMENTS  # noqa: E402

DB = "drquant.db"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, payload, code: int = 200) -> None:
        body = json.dumps(payload, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        q = parse_qs(u.query)
        conn = store.connect(DB)
        try:
            if u.path == "/api/health":
                n = conn.execute("SELECT COUNT(*) c FROM zones WHERE state='live'").fetchone()["c"]
                self._send({"ok": True, "live_zones": n})

            elif u.path == "/api/signals":
                self._send({"signals": store.signals(conn, INSTRUMENTS)})

            elif u.path == "/api/zones":
                inst = q.get("instrument", [None])[0]
                self._send({"zones": store.live_zones(conn, inst)})

            elif u.path == "/api/events":
                limit = min(int(q.get("limit", [50])[0]), 500)
                self._send({"events": store.recent_events(conn, limit)})

            elif u.path == "/api/prices":
                rows = conn.execute("SELECT * FROM prices").fetchall()
                self._send({"prices": {r["instrument"]: r["last"] for r in rows}})

            else:
                self._send({"error": "not found"}, 404)
        finally:
            conn.close()

    def log_message(self, fmt, *a):  # quieter
        pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--db", default="drquant.db")
    args = ap.parse_args()

    global DB
    DB = args.db

    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"API on http://127.0.0.1:{args.port}  —  /api/signals /api/zones /api/events")
    srv.serve_forever()


if __name__ == "__main__":
    main()
