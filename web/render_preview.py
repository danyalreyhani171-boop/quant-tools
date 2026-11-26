#!/usr/bin/env python3
"""
Render the Python terminal into an Artifact-format page, so it can be previewed without
running a server.

    python3 web/render_preview.py --db drquant.db

Produces web/terminal-preview.html — the exact output of server/web.py, minus the document
skeleton that the Artifact viewer supplies itself. Regenerate it after the store changes;
the page is a snapshot, not a live view.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import web  # noqa: E402

OUT = Path(__file__).resolve().parent / "terminal-preview.html"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="drquant.db")
    ap.add_argument("--live", action="store_true")
    args = ap.parse_args()

    web.CONFIG["db"] = args.db
    web.CONFIG["live"] = args.live
    html, ms = web.page(args.db)

    title = re.search(r"<title>(.*?)</title>", html, re.S).group(1)
    style = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
    font = re.search(r'(<link rel="preconnect".*?display=swap">)', html, re.S).group(1)

    # the viewer pads :root for the safe area already; keeping ours would double it
    style = re.sub(r"\n\s*padding-(top|bottom): env\(safe-area-inset-\w+,0px\);", "", style)

    OUT.write_text(
        f"<title>{title}</title>\n"
        '<meta name="claude:viewport-fit-sides" content="cover">\n'
        f"{font}\n\n<style>{style}</style>\n{body.strip()}\n"
    )
    left = len(re.findall(r"__[A-Z_]+__", OUT.read_text()))
    print(f"rendered in {ms:.0f} ms -> {OUT}  ({OUT.stat().st_size // 1024} KB, "
          f"{left} placeholders left)")


if __name__ == "__main__":
    main()
