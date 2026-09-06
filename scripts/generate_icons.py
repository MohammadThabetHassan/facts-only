#!/usr/bin/env python3
"""Generate Facts Only extension icons (blue rounded square + white lens).

Pure standard library (struct/zlib) — no Pillow required.
Run from the repo root:  python scripts/generate_icons.py
"""

import math
import os
import struct
import zlib

SS = 4  # supersampling factor for anti-aliasing
SIZES = [16, 32, 48, 128]

BG = (29, 78, 216)      # #1D4ED8
FG = (255, 255, 255)    # white


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: str, size: int, rows):
    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += png_chunk(b"IDAT", zlib.compress(raw, 9))
    png += png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def seg_distance(px, py, x1, y1, x2, y2):
    """Distance from point to a line segment."""
    dx, dy = x2 - x1, y2 - y1
    length2 = dx * dx + dy * dy
    if length2 == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / length2))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def render(size: int):
    n = size * SS
    radius = 0.22 * size  # rounded-corner radius
    cx = cy = 0.42 * size  # lens center
    lens_r = 0.24 * size   # lens outer radius
    ring_w = 0.085 * size  # ring thickness
    h1 = (0.60 * size, 0.60 * size)
    h2 = (0.80 * size, 0.80 * size)
    handle_w = 0.105 * size

    rows = []
    for y in range(n):
        row = bytearray()
        for x in range(n):
            # supersample grid
            r_acc = g_acc = b_acc = a_acc = 0
            for sy in range(SS):
                for sx in range(SS):
                    # map the supersampled pixel back into shape units (0..size)
                    px = (x + (sx + 0.5) / SS) / SS
                    py = (y + (sy + 0.5) / SS) / SS
                    # rounded-square mask (anti-aliased via supersampling)
                    qx = max(radius - px, px - (size - radius), 0)
                    qy = max(radius - py, py - (size - radius), 0)
                    inside_rect = px >= 0 and px <= size and py >= 0 and py <= size
                    corner = math.hypot(qx, qy) > radius
                    alpha_rect = 255 if (inside_rect and not corner) else 0
                    if alpha_rect == 0:
                        continue
                    # lens ring or handle -> white
                    d_ring = abs(math.hypot(px - cx, py - cy) - lens_r)
                    d_handle = seg_distance(px, py, h1[0], h1[1], h2[0], h2[1])
                    if d_ring <= ring_w / 2 or d_handle <= handle_w / 2:
                        r, g, b = FG
                    else:
                        r, g, b = BG
                    # accumulate premultiplied by alpha so the unpremultiply
                    # step (divide by a_acc) stays correct on edges
                    r_acc += r * alpha_rect
                    g_acc += g * alpha_rect
                    b_acc += b * alpha_rect
                    a_acc += alpha_rect
            ss_total = SS * SS
            if a_acc == 0:
                row += bytes((0, 0, 0, 0))
            else:
                cov = a_acc / ss_total
                row += bytes(
                    (
                        int(r_acc / a_acc),
                        int(g_acc / a_acc),
                        int(b_acc / a_acc),
                        int(cov),
                    )
                )
        rows.append(row)
    return rows


def downsample(rows, size: int):
    """Box-average the SS×SS supersampled grid back to size×size, with
    premultiplied alpha so edge pixels don't get dark halos."""
    n = size * SS
    out = []
    for Y in range(size):
        row = bytearray()
        for X in range(size):
            r = g = b = a = 0
            for j in range(SS):
                src = rows[Y * SS + j]
                for i in range(SS):
                    o = (X * SS + i) * 4
                    pr, pg, pb, pa = src[o], src[o + 1], src[o + 2], src[o + 3]
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
            ss_total = SS * SS
            if a == 0:
                row += bytes((0, 0, 0, 0))
                continue
            out_a = a / ss_total
            row += bytes(
                (
                    int(r / a),
                    int(g / a),
                    int(b / a),
                    int(out_a),
                )
            )
        out.append(row)
    return out


def main():
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "extension", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in SIZES:
        path = os.path.join(out_dir, f"icon{size}.png")
        write_png(path, size, downsample(render(size), size))
        print(f"wrote {path} ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
