#!/usr/bin/env python3
"""Regenerate the icon set in extension/images/.

The PNGs are committed, so you only need this when you want to change the
artwork. Requires Pillow:  pip install pillow
"""

import math
import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: pip install pillow")

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "extension", "images")

APP_SIZES = [48, 96, 128, 256, 512]
TOOLBAR_SIZES = [16, 19, 32, 38]

SUPERSAMPLE = 8
TOP = (86, 160, 255)
BOTTOM = (21, 84, 214)


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def restore_arrow(draw, cx, cy, radius, width, color):
    """A counter-clockwise arrow: the 'put it back' gesture.

    PIL measures angles clockwise from 3 o'clock, so the arc is drawn from
    `start` to `end` the long way round and the head sits at `start`, pointing
    along the counter-clockwise tangent into the gap.
    """
    start, end = 55.0, 335.0
    draw.arc([cx - radius, cy - radius, cx + radius, cy + radius],
             start=start, end=end, fill=color, width=width)

    theta = math.radians(start)
    px, py = cx + radius * math.cos(theta), cy + radius * math.sin(theta)
    tangent = theta - math.pi / 2
    perp = tangent + math.pi / 2
    head = width * 2.0
    draw.polygon(
        [
            (px + head * math.cos(tangent), py + head * math.sin(tangent)),
            (px + head * 0.62 * math.cos(perp), py + head * 0.62 * math.sin(perp)),
            (px - head * 0.62 * math.cos(perp), py - head * 0.62 * math.sin(perp)),
        ],
        fill=color,
    )


def draw_window(draw, box, radius, body, bar, tab):
    """A browser window: rounded body with a tab strip along the top."""
    left, top, right, bottom = box
    rounded(draw, box, radius, body)

    bar_h = (bottom - top) * 0.24
    draw.rounded_rectangle([left, top, right, top + bar_h * 1.6], radius=radius, fill=bar)
    draw.rectangle([left, top + bar_h, right, top + bar_h * 1.6], fill=bar)

    # Three tabs in the strip.
    pad = (right - left) * 0.07
    gap = (right - left) * 0.045
    usable = (right - left) - pad * 2 - gap * 2
    w = usable / 3
    ty0 = top + bar_h * 0.30
    ty1 = top + bar_h * 0.78
    for i in range(3):
        tx = left + pad + i * (w + gap)
        draw.rounded_rectangle([tx, ty0, tx + w, ty1], radius=(ty1 - ty0) / 2, fill=tab)


def app_icon(size):
    s = size * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    gradient = Image.new("RGBA", (1, s))
    for y in range(s):
        t = y / max(1, s - 1)
        gradient.putpixel((0, y), tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)) + (255,))
    gradient = gradient.resize((s, s))

    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.225, fill=255)
    img.paste(gradient, (0, 0), mask)

    draw = ImageDraw.Draw(img)
    m = s * 0.20
    draw_window(
        draw,
        [m, m * 1.12, s - m, s - m * 1.12],
        radius=s * 0.055,
        body=(255, 255, 255, 255),
        bar=(224, 233, 247, 255),
        tab=(255, 255, 255, 255),
    )
    restore_arrow(draw, s * 0.5, s * 0.607, s * 0.108, max(1, round(s * 0.046)), BOTTOM + (255,))

    return img.resize((size, size), Image.LANCZOS)


def toolbar_icon(size):
    """Monochrome glyph; Safari tints toolbar icons as template images."""
    s = size * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    black = (0, 0, 0, 255)
    clear = (0, 0, 0, 0)
    m = s * 0.09
    box = [m, m * 1.6, s - m, s - m * 1.6]
    stroke = max(1, round(s * 0.055))

    draw.rounded_rectangle(box, radius=s * 0.10, outline=black, width=stroke)
    bar_y = box[1] + (box[3] - box[1]) * 0.30
    draw.line([box[0], bar_y, box[2], bar_y], fill=black, width=stroke)

    inner = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(inner)
    restore_arrow(
        ImageDraw.Draw(inner),
        s * 0.5,
        bar_y + (box[3] - bar_y) * 0.52,
        (box[3] - bar_y) * 0.30,
        max(1, round(s * 0.05)),
        black,
    )
    img.alpha_composite(inner)
    _ = clear

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in APP_SIZES:
        app_icon(size).save(os.path.join(OUT, f"icon-{size}.png"))
    for size in TOOLBAR_SIZES:
        toolbar_icon(size).save(os.path.join(OUT, f"toolbar-{size}.png"))
    print(f"wrote {len(APP_SIZES) + len(TOOLBAR_SIZES)} icons to {OUT}")


if __name__ == "__main__":
    main()
