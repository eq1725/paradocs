#!/usr/bin/env python3
"""
Build Paradocs PWA icons.

Renders a purple branded square with a Changa-ExtraBold "P" centered on it,
at every size needed by the manifest + iOS apple-touch + favicon.

Brand:
- Purple: #a855f7 (Tailwind purple-500 — matches RADAR user-dot color)
- Slightly darker stop for depth: #7c3aed (purple-600)
- Letter color: white #ffffff

Maskable icons need a "safe zone" — only the center 80% is guaranteed to
render on Android adaptive icons; the outer 10% margin can be clipped.
We use a single rounded-square design at 100% so it works for both
maskable (safe-zone fits in the 80% center) and non-maskable contexts.
"""

import os
from PIL import Image, ImageDraw, ImageFont

# Output folder — write to outputs/icons-out first, then we'll move to /public/icons/
OUT = '/sessions/beautiful-brave-planck/mnt/outputs/icons-out'
os.makedirs(OUT, exist_ok=True)

FONT_PATH = '/tmp/changa.ttf'

# Brand colors — V10.1 rebrand (post-splash)
# Black bg + purple P matches the splash screen aesthetic for visual
# coherence between the launch screen and the home-screen icon.
BG_TOP = (10, 10, 20)        # #0a0a14 (same as splash bg + theme_color)
BG_BOT = (10, 10, 20)        # flat — no gradient on the icon
LETTER = (168, 85, 247)      # #a855f7 (purple-500 — same as splash period accent)

SIZES = [16, 32, 72, 96, 128, 144, 152, 167, 180, 192, 384, 512]

def make_icon(size: int) -> Image.Image:
    """Render one icon at the given size."""
    img = Image.new('RGB', (size, size), BG_TOP)
    draw = ImageDraw.Draw(img)

    # Vertical gradient (top-left brighter, bottom-right darker)
    for y in range(size):
        t = y / (size - 1)
        r = int(BG_TOP[0] * (1 - t) + BG_BOT[0] * t)
        g = int(BG_TOP[1] * (1 - t) + BG_BOT[1] * t)
        b = int(BG_TOP[2] * (1 - t) + BG_BOT[2] * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b))

    # Load Changa at ExtraBold (weight axis 800). Letter height ~ 62% of icon.
    # We start with a generous font size and shrink to fit if necessary.
    target_letter_height = int(size * 0.62)
    font_size = int(size * 0.78)
    font = ImageFont.truetype(FONT_PATH, font_size)
    font.set_variation_by_axes([800])

    # Measure and adjust font size so the actual letter height matches our target.
    bbox = draw.textbbox((0, 0), "P", font=font, anchor="lt")
    actual_h = bbox[3] - bbox[1]
    if actual_h > 0:
        scale = target_letter_height / actual_h
        font_size = max(8, int(font_size * scale))
        font = ImageFont.truetype(FONT_PATH, font_size)
        font.set_variation_by_axes([800])
        bbox = draw.textbbox((0, 0), "P", font=font, anchor="lt")

    # Center the P. We use the actual ink-bbox (not the typographic em-box).
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    # The bbox's origin offset (bbox[0], bbox[1]) tells us where the ink
    # starts relative to the anchor — we subtract it to truly center.
    x = (size - text_w) / 2 - bbox[0]
    y = (size - text_h) / 2 - bbox[1]
    # Optical adjustment: P feels slightly bottom-heavy because of the bowl;
    # nudge up by ~1.5% of the icon size.
    y -= size * 0.015

    draw.text((x, y), "P", font=font, fill=LETTER, anchor="lt")
    return img


def make_apple_touch(size: int) -> Image.Image:
    """Apple-touch-icon: same design, no transparency. iOS auto-rounds."""
    return make_icon(size)


def main():
    for s in SIZES:
        img = make_icon(s)
        img.save(os.path.join(OUT, f'icon-{s}x{s}.png'), optimize=True)
        print(f'wrote icon-{s}x{s}.png')

    # apple-touch-icon (180 is standard; 152 is iPad legacy)
    make_apple_touch(180).save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)
    print('wrote apple-touch-icon.png')

    # favicon.ico — multi-resolution
    favicon_imgs = [make_icon(16), make_icon(32), make_icon(48)]
    favicon_imgs[0].save(
        os.path.join(OUT, 'favicon.ico'),
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=favicon_imgs[1:],
    )
    print('wrote favicon.ico')


if __name__ == '__main__':
    main()
