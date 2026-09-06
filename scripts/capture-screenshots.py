#!/usr/bin/env python3
"""Regenerate the documentation screenshots in docs/screenshots/.

Screenshots in a README go stale silently: the UI moves on, the picture does
not, and a reader's first impression is of a product that no longer exists.
This script makes them a build artifact instead of a manual chore.

It drives headless Chrome/Edge against the local dev server, captures the
sample report at a real desktop width and at 2x device pixel ratio (so the
image stays crisp when GitHub scales it), then trims it to the report itself.

Usage:
    python scripts/dev-server.py          # in another terminal
    python scripts/capture-screenshots.py

Requires: Pillow, and Chrome or Edge installed.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "screenshots"
DEV_URL = "http://127.0.0.1:8123"

# Rendered at 2x so the PNG is crisp at the ~820px GitHub renders a README at.
SCALE = 2
CSS_WIDTH = 900
CSS_HEIGHT = 2200
# Seconds of virtual time the page gets to finish the pipeline before capture.
VIRTUAL_TIME_MS = 25000

BROWSER_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def find_browser() -> str:
    for candidate in BROWSER_CANDIDATES:
        if Path(candidate).exists():
            return candidate
    for name in ("google-chrome", "chromium", "chrome", "msedge"):
        found = shutil.which(name)
        if found:
            return found
    sys.exit("No Chrome or Edge found — install one, or add its path to BROWSER_CANDIDATES.")


def require_dev_server() -> None:
    try:
        urllib.request.urlopen(f"{DEV_URL}/webapp/index.html", timeout=3).read(1)
    except (urllib.error.URLError, OSError):
        sys.exit(f"Dev server is not answering on {DEV_URL} — run `python scripts/dev-server.py` first.")


def capture(browser: str, url: str, dest: Path) -> None:
    """Screenshot `url` into `dest` with headless Chrome."""
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run(
            [
                browser,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                f"--user-data-dir={profile}",
                f"--force-device-scale-factor={SCALE}",
                f"--window-size={CSS_WIDTH},{CSS_HEIGHT}",
                f"--virtual-time-budget={VIRTUAL_TIME_MS}",
                f"--screenshot={dest}",
                url,
            ],
            check=True,
            capture_output=True,
            timeout=180,
        )
    if not dest.exists():
        sys.exit(f"Browser produced no file for {url}")


def trim(path: Path, max_css_height: int = 900) -> None:
    """Crop the raw viewport grab down to the report, ending on a card boundary.

    The height cap keeps the README readable, and snapping the bottom edge to the
    nearest gap between cards avoids the classic "screenshot sliced through a
    sentence" look.
    """
    img = Image.open(path).convert("RGB")
    bg = img.getpixel((2, 2))

    def differs(pixel) -> bool:
        return sum(abs(a - b) for a, b in zip(pixel, bg)) > 24

    width, height = img.size
    cols = [x for x in range(width) if any(differs(img.getpixel((x, y))) for y in range(0, height, 12))]
    rows = [y for y in range(height) if any(differs(img.getpixel((x, y))) for x in range(0, width, 8))]
    if not cols or not rows:
        return

    pad = 10 * SCALE
    left = max(0, cols[0] - pad)
    right = min(width, cols[-1] + pad)
    top = max(0, rows[0] - pad)

    limit = min(rows[-1] + pad, top + max_css_height * SCALE)
    # Walk back to the last run of background-only rows (a gap between cards).
    content = set(rows)
    bottom = limit
    for y in range(limit, top + 200 * SCALE, -1):
        if all((y - k) not in content for k in range(0, 6 * SCALE)):
            bottom = y
            break

    img.crop((left, top, right, bottom)).save(path, optimize=True)
    print(f"  {path.name}: {right - left}x{bottom - top} px ({(right - left) // SCALE} css)")


def main() -> None:
    require_dev_server()
    browser = find_browser()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Using {browser}")

    targets = [
        (f"{DEV_URL}/webapp/index.html?demo=1&shot=1", OUT_DIR / "report.png", 900),
        (f"{DEV_URL}/webapp/index.html?demo=1", OUT_DIR / "webapp-full.png", 1400),
        (f"{DEV_URL}/webapp/index.html?demo=1&shot=1&lang=ar", OUT_DIR / "report-arabic-rtl.png", 700),
    ]
    for url, dest, max_h in targets:
        print(f"capturing {url}")
        capture(browser, url, dest)
        trim(dest, max_css_height=max_h)
    print("done")


if __name__ == "__main__":
    main()
