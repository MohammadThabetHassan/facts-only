# Builds a Firefox-ready add-on directory from extension/.
# Firefox MV3 differs from Chrome in two manifest areas:
#   - background: event page ("scripts") instead of "service_worker"
#   - sidebar:    "sidebar_action" instead of "side_panel"
# The engine/content/panel/popup sources are shared verbatim.
#
# Usage: python scripts/build-firefox.py   ->  firefox-build/  (load via about:debugging)

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / "extension"
OUT = ROOT / "firefox-build"

CHROME_ONLY_KEYS = {"side_panel"}
GECKO_ID = "touchstone@mohammadthabethassan.dev"


def firefoxify(manifest):
    m = json.loads(json.dumps(manifest))  # deep copy

    # background: service worker -> event page script
    bg = m.get("background", {})
    worker = bg.pop("service_worker", None)
    if worker:
        m["background"] = {"scripts": [worker]}  # classic event page in Firefox

    # side_panel -> sidebar_action
    if "side_panel" in m:
        panel = m.pop("side_panel")
        m["sidebar_action"] = {
            "default_title": "Touchstone",
            "default_panel": panel.get("default_path", "panel/panel.html")
        }

    # gecko id + minimum version (MV3 stable parts used by Touchstone)
    m.setdefault("browser_specific_settings", {})
    m["browser_specific_settings"]["gecko"] = {
        "id": GECKO_ID,
        "strict_min_version": "128.0"
    }

    # Chrome-only action key "default_icon" is fine; nothing else to change.
    return m


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(EXTENSION, OUT)

    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # Firefox reads permissions it knows; unknown Chrome-only permissions are
    # warnings, but drop "sidePanel" explicitly for cleanliness.
    if "permissions" in manifest:
        manifest["permissions"] = [p for p in manifest["permissions"] if p not in ("sidePanel",)]

    ff = firefoxify(manifest)
    manifest_path.write_text(json.dumps(ff, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    total = sum(1 for p in OUT.rglob("*") if p.is_file())
    print(f"built {OUT} ({total} files) — load via about:debugging → Load Temporary Add-on")


if __name__ == "__main__":
    main()
