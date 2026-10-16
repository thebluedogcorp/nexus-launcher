#!/usr/bin/env python3
"""Generate the NEXUS minimal app icon.

A solid black rounded-square with a single accent "N" lettermark, drawn from
the same path as the in-app NexusMark SVG so the icon and the UI logo match
exactly. Produces:
  - resources/icon.png   (1024x1024, full alpha)
  - resources/icon.ico   (multi-resolution: 16/24/32/48/64/128/256)
"""
from PIL import Image, ImageDraw

ACCENT = (45, 212, 191)   # #2dd4bf — the default accent
BLACK = (0, 0, 0)
SIZE = 1024
CORNER = int(SIZE * 0.223)  # ~22% radius — soft but recognizably squarish


def rounded_mask(size: int, radius: int) -> Image.Image:
    """Return an L-mode mask: white rounded square on black (transparent corners)."""
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def n_polygon(size: int) -> list:
    """The NEXUS "N" lettermark, scaled from the 32x32 SVG path to `size`.

    Source path (viewBox 0 0 32 32):
      M8 25 L8 7 L11.6 7 L20.4 19.2 L20.4 7 L24 7 L24 25 L20.4 25 L11.6 12.8 L11.6 25 Z

    We scale by (size/32) and then center the glyph with ~18% optical padding
    on each side so the mark breathes inside the rounded square.
    """
    pad = size * 0.18  # optical padding
    inner = size - 2 * pad
    g = inner / 32.0  # glyph scale within the padded inner area
    pts = [
        (8.0, 25.0), (8.0, 7.0), (11.6, 7.0), (20.4, 19.2),
        (20.4, 7.0), (24.0, 7.0), (24.0, 25.0), (20.4, 25.0),
        (11.6, 12.8), (11.6, 25.0),
    ]
    return [(pad + x * g, pad + y * g) for (x, y) in pts]


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # 1) rounded black tile
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    td.rounded_rectangle((0, 0, size - 1, size - 1),
                         radius=int(size * 0.223), fill=(*BLACK, 255))
    img.paste(tile, (0, 0), rounded_mask(size, int(size * 0.223)))
    # 2) accent "N" on top
    d = ImageDraw.Draw(img)
    d.polygon(n_polygon(size), fill=(*ACCENT, 255))
    return img


def main() -> None:
    big = make_icon(SIZE)
    big.save("resources/icon.png", "PNG")
    # Multi-resolution ICO: render a crisp 256x256 master, then let Pillow
    # write all requested sub-sizes (it auto-downscales the master to each).
    # This is the documented canonical way to produce a multi-res .ico.
    master = make_icon(256)
    master.save(
        "resources/icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
               (64, 64), (128, 128), (256, 256)],
    )
    print("Wrote resources/icon.png (1024x1024) and resources/icon.ico "
          "(sizes=16,24,32,48,64,128,256)")


if __name__ == "__main__":
    main()
