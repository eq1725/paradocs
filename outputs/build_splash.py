#!/usr/bin/env python3
"""
Build Paradocs iOS apple-touch-startup-image splash screens.

Design (panel-driven):
- Background: #0a0a14 (matches theme_color in manifest)
- Wordmark: "Paradocs." in Changa ExtraBold (weight axis 800), white
- The period in "Paradocs." renders in #a855f7 (purple-500) — the same
  brand accent used on the home-screen icon. Tiny dot, big brand recall.

iOS picks the matching splash image via the resolution + orientation
specified in the <link rel="apple-touch-startup-image" media="..."> tags
in _app.tsx. We cover the most-common device sizes from iPhone SE
through iPhone 15 Pro Max, plus iPad Pro 11"/12.9" and iPad 10".
Older / less-common devices fall back to the apple-touch-icon centered
on a black screen (iOS's default).

Naming convention: splash-{WIDTH}x{HEIGHT}.png — width is always the
shorter dimension for portrait, longer for landscape. iOS matches by
exact pixel resolution.
"""

import os
from PIL import Image, ImageDraw, ImageFont

OUT = '/sessions/beautiful-brave-planck/mnt/outputs/splash-out'
os.makedirs(OUT, exist_ok=True)

FONT_PATH = '/tmp/changa.ttf'

BG = (10, 10, 20)          # #0a0a14
WORDMARK = (255, 255, 255) # white
ACCENT = (168, 85, 247)    # #a855f7 purple-500

# (width, height) — both portrait and landscape variants for each device.
# Covers ~95% of in-use iOS devices as of 2026.
SIZES = [
    # iPhone 16 Pro Max / 15 Pro Max / 14 Pro Max
    (1290, 2796), (2796, 1290),
    # iPhone 16 Pro / 15 Pro / 14 Pro
    (1179, 2556), (2556, 1179),
    # iPhone 16 / 15 / 14 / 13 / 12
    (1170, 2532), (2532, 1170),
    # iPhone 14 Plus / 13 Pro Max / 12 Pro Max / 11 Pro Max / XS Max
    (1284, 2778), (2778, 1284),
    # iPhone 11 Pro / XS / X
    (1125, 2436), (2436, 1125),
    # iPhone 11 / XR
    (828, 1792), (1792, 828),
    # iPhone 13 mini / 12 mini
    (1080, 2340), (2340, 1080),
    # iPhone SE 3rd / 2nd / 8 / 7 / 6s
    (750, 1334), (1334, 750),
    # iPad Pro 12.9"
    (2048, 2732), (2732, 2048),
    # iPad Pro 11" / Air 10.9" (close enough — same density)
    (1668, 2388), (2388, 1668),
    # iPad 10.2"
    (1620, 2160), (2160, 1620),
]


def draw_wordmark(img: Image.Image):
    """Render 'Paradocs.' centered, with the period in purple."""
    draw = ImageDraw.Draw(img)
    w, h = img.size

    # Wordmark height = ~7% of the SHORTER dimension (so the wordmark
    # feels right whether portrait or landscape).
    short = min(w, h)
    target_letter_height = int(short * 0.07)

    # Start with a generous font size and shrink to fit the actual ink
    # height to the target.
    font_size = int(short * 0.09)
    font = ImageFont.truetype(FONT_PATH, font_size)
    font.set_variation_by_axes([800])

    # Measure the cap-height with a representative glyph (use "P").
    bbox_p = draw.textbbox((0, 0), "P", font=font, anchor="lt")
    cap_h = bbox_p[3] - bbox_p[1]
    if cap_h > 0:
        scale = target_letter_height / cap_h
        font_size = max(12, int(font_size * scale))
        font = ImageFont.truetype(FONT_PATH, font_size)
        font.set_variation_by_axes([800])

    # We render the "Paradocs" part in white and the "." in purple as a
    # second draw pass right after, so the kerning stays accurate.
    text = "Paradocs"
    period = "."

    bbox_t = draw.textbbox((0, 0), text, font=font, anchor="lt")
    bbox_full = draw.textbbox((0, 0), text + period, font=font, anchor="lt")
    text_w = bbox_t[2] - bbox_t[0]
    full_w = bbox_full[2] - bbox_full[0]
    full_h = bbox_full[3] - bbox_full[1]

    x = (w - full_w) / 2 - bbox_full[0]
    y = (h - full_h) / 2 - bbox_full[1]
    # Optical center adjustment — descender of "." sits slightly low,
    # nudge the wordmark up by 0.5% of the screen height.
    y -= h * 0.005

    draw.text((x, y), text, font=font, fill=WORDMARK, anchor="lt")
    # Render the period at the same baseline, immediately after.
    draw.text((x + text_w, y), period, font=font, fill=ACCENT, anchor="lt")


def make(w: int, h: int) -> Image.Image:
    img = Image.new('RGB', (w, h), BG)
    draw_wordmark(img)
    return img


def main():
    for (w, h) in SIZES:
        out = os.path.join(OUT, f'splash-{w}x{h}.png')
        make(w, h).save(out, optimize=True)
        print(f'wrote splash-{w}x{h}.png')


if __name__ == '__main__':
    main()
