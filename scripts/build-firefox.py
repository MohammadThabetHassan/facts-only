# Builds a Firefox-ready add-on directory from extension/.
# Firefox MV3 differs from Chrome in two manifest areas:
#   - background: event page ("scripts") instead of "service_worker"
#   - sidebar:    "sidebar_action" instead of "side_panel"
# The engine/content/panel/popup sources are shared verbatim.
#
# Usage: python scripts/build-firefox.py   ->  firefox-build/  (load via about:debugging)

import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / "extension"
OUT = ROOT / "firefox-build"
DIST = ROOT / "dist"

CHROME_ONLY_KEYS = {"side_panel"}
GECKO_ID = "facts-only@mohammadthabethassan.dev"


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
            "default_title": "Facts Only",
            "default_panel": panel.get("default_path", "panel/panel.html")
        }

    # gecko id + minimum version (MV3 stable parts used by Facts Only)
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
    # ASCII only: the Windows console defaults to cp1252 and an em dash or arrow
    # here raises UnicodeEncodeError, which killed the build before it packaged
    # anything.
    print(f"built {OUT} ({total} files) - load via about:debugging > Load Temporary Add-on")

    # Also emit the distributable archive, so a release carries a Firefox build
    # and not only a directory a maintainer has to zip by hand. Deterministic:
    # sorted entries and a fixed timestamp, so rebuilding the same source gives
    # a byte-identical archive and the published checksum stays meaningful.
    DIST.mkdir(exist_ok=True)
    out_zip = DIST / f"facts-only-firefox-v{ff['version']}.zip"
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(OUT.rglob("*")):
            if p.is_file():
                info = zipfile.ZipInfo(p.relative_to(OUT).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                z.writestr(info, p.read_bytes())
    names = zipfile.ZipFile(out_zip).namelist()
    assert "manifest.json" in names, "manifest.json missing from the Firefox package"
    print(f"packaged {len(names)} files -> {out_zip}")


if __name__ == "__main__":
    main()
