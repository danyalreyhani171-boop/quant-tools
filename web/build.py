#!/usr/bin/env python3
"""
Build the hostable site.

`web/index.html` is written for the Artifact viewer, which wraps it in a document skeleton
at publish time. A real host does not, so this wraps it: doctype, head, meta, reset, and the
social cards. One source, two outputs.

    python3 web/build.py            -> web/dist/index.html
    python3 web/build.py --serve    -> and serve it on :8000 to check
"""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "index.html"
DIST = ROOT / "dist"

SITE_URL = "https://drquantmtf.com"        # change when the domain is settled
DESCRIPTION = (
    "Multi-timeframe supply and demand zones on gold, GBP/USD, Nasdaq and crude. "
    "Scored out of ten, marked where the timeframes agree, and removed when they stop "
    "mattering."
)

# The Artifact viewer supplies this; a plain host does not.
SKELETON = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{description}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{site}/">

<meta property="og:type" content="website">
<meta property="og:site_name" content="DRQuantMTF">
<meta property="og:title" content="DRQuantMTF">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{site}/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="DRQuantMTF">
<meta name="twitter:description" content="{description}">

<link rel="icon" href="data:image/svg+xml,\
%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E\
%3Crect width='32' height='32' rx='6' fill='%23070b11'/%3E\
%3Crect x='6' y='12' width='20' height='5' fill='%23bc524d' opacity='.85'/%3E\
%3Crect x='6' y='20' width='20' height='5' fill='%232f8a7e' opacity='.85'/%3E\
%3C/svg%3E">

<style>
:root {{
  color-scheme: dark;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}}
body {{ margin: 0; font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
img {{ max-width: 100%; }}
[hidden] {{ display: none !important; }}
</style>
</head>
<body>
{body}
</body>
</html>
"""


def build() -> Path:
    src = SRC.read_text()

    # the source carries its own <title>; lift it into the head rather than leaving it in body
    m = re.search(r"<title>(.*?)</title>\s*", src, re.S)
    title = m.group(1).strip() if m else "DRQuantMTF"
    body = src[: m.start()] + src[m.end():] if m else src

    # the viewport-fit meta is an Artifact-only hint; the real head declares it properly
    body = re.sub(r'<meta name="claude:viewport-fit-sides"[^>]*>\s*', "", body)

    page = SKELETON.format(description=DESCRIPTION, site=SITE_URL, body=body.strip())
    page = page.replace("<head>\n<meta charset=\"utf-8\">",
                        f"<head>\n<meta charset=\"utf-8\">\n<title>{title}</title>")

    DIST.mkdir(exist_ok=True)
    out = DIST / "index.html"
    out.write_text(page)

    # the privacy policy is a standalone page already, so it is copied as-is
    priv = ROOT / "privacy.html"
    if priv.exists():
        (DIST / "privacy.html").write_text(priv.read_text())
        left = [x for x in ("[YOUR FULL NAME OR BUSINESS NAME]", "[YOUR CONTACT EMAIL]")
                if x in priv.read_text()]
        if left:
            print("  WARNING privacy.html still has placeholders: " + ", ".join(left))

    # a 404 that is not the host's default
    (DIST / "404.html").write_text(page)

    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n"
    )
    (DIST / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{SITE_URL}/</loc><changefreq>weekly</changefreq></url>\n"
        f"  <url><loc>{SITE_URL}/privacy.html</loc><changefreq>yearly</changefreq></url>\n"
        "</urlset>\n"
    )
    # security headers, honoured by Netlify and Cloudflare Pages
    (DIST / "_headers").write_text(
        "/*\n"
        "  X-Frame-Options: DENY\n"
        "  X-Content-Type-Options: nosniff\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: geolocation=(), microphone=(), camera=()\n"
    )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--serve", action="store_true")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    out = build()
    kb = out.stat().st_size / 1024
    print(f"built {out}  ({kb:.0f} KB)")
    for f in sorted(DIST.iterdir()):
        if f.name != "index.html":
            print(f"      {f.name}")

    if args.serve:
        import functools
        from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
        h = functools.partial(SimpleHTTPRequestHandler, directory=str(DIST))
        print(f"\nserving http://127.0.0.1:{args.port}  (ctrl-c to stop)")
        ThreadingHTTPServer(("127.0.0.1", args.port), h).serve_forever()


if __name__ == "__main__":
    main()
