# Offline packaging: zip the extension for store upload / manual distribution.
# Usage: python scripts/package-extension.py   ->  dist/facts-only-extension-vX.Y.Z.zip

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / "extension"
DIST = ROOT / "dist"


def main():
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    DIST.mkdir(exist_ok=True)
    out = DIST / f"facts-only-extension-v{version}.zip"
    # Deterministic: sorted entries and a fixed timestamp, so the same source
    # always produces a byte-identical archive. Without this the zip embeds file
    # mtimes and a published SHA-256 could not be reproduced by anyone else.
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(EXTENSION.rglob("*")):
            if p.is_file():
                info = zipfile.ZipInfo(p.relative_to(EXTENSION).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                # ZipInfo stamps create_system from the host OS: 0 on Windows,
                # 3 on Unix. One byte per entry, and it was the only thing
                # keeping a Windows build from matching the Linux release build
                # byte for byte. Pin it to Unix.
                info.create_system = 3
                z.writestr(info, p.read_bytes())
    names = zipfile.ZipFile(out).namelist()
    assert "manifest.json" in names, "manifest.json missing from package"
    print(f"packaged {len(names)} files -> {out}")


if __name__ == "__main__":
    main()
