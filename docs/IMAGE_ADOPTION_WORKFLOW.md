# Phenomenon Image Adoption — Operator Workflow

**Version:** V11.17.43
**Script:** `scripts/adopt-phenomena-images.ts`
**Source:** `/source-images/<category>/<slug>.{jpg,jpeg,png,webp,avif}` (gitignored)
**Destination:** Supabase Storage bucket `phenomena-images`
**Default license:** `envato_elements`

## File naming convention

Each image's **filename must be the phenomenon slug** (kebab-case). The
parent folder must be the **phenomenon's category** (snake_case).

```
source-images/
  ghosts_hauntings/
    triggered-haunting.jpg
    residual-haunting.png
    poltergeist-activity.jpg
  cryptids/
    mothman.jpg
    fresno-nightcrawler.webp
  ufos_aliens/
    pascagoula-abduction.png
```

To find a slug: go to `paradocs.world/phenomena/<slug>` for any
phenomenon, or grep `src/lib/ingestion/utils/auto-targets.json` for
the human-readable name.

## Default metadata (Envato Elements path)

When you drop a file with no sidecar, the batch script writes:

- `image_license`: `envato_elements`
- `image_attribution`: `Paradocs editorial.`
- `image_alt_text`: `<phenomenon name> — image`
- `image_source`: `manual`
- `image_review_score`: `100` (operator-curated)
- `image_adopted_at`: now

## Optional per-image overrides (sidecar JSON)

Drop a `.json` file with the same basename next to the image when you
want to credit a specific creator or write better alt text. Any
omitted field falls back to the Envato defaults above.

`source-images/ghosts_hauntings/triggered-haunting.json`:

```json
{
  "author": "Jane Doe",
  "item_url": "https://elements.envato.com/photos/abc123",
  "alt": "A 17th-century parlor with a chair mid-air and a fallen vase, lit by a single candle."
}
```

If you provide `author` or `item_url`, the script synthesizes a clean
attribution line: `Image by Jane Doe · <source link> (Envato Elements license).`

You can also override raw fields directly:

```json
{
  "attribution": "Custom HTML credit line",
  "license": "cc_by",
  "alt": "Custom alt text"
}
```

## Running the batch

Always dry-run first:

```bash
set -a; source .env.local; set +a

# Preview every image in source-images/ without writing anything
tsx scripts/adopt-phenomena-images.ts --batch --dry-run

# Adopt everything for real
tsx scripts/adopt-phenomena-images.ts --batch

# Scope to one category
tsx scripts/adopt-phenomena-images.ts --batch --category ghosts_hauntings

# Adopt just one slug (useful for iterating on a single image)
tsx scripts/adopt-phenomena-images.ts --batch --slug triggered-haunting
```

## What the script does per file

1. Reads the local file.
2. Sharps it into three webp variants:
   - `hero/<slug>.webp` — 1200×1200 cover
   - `card/<slug>.webp` — 600×450 cover
   - `thumb/<slug>.webp` — 120×90 cover
3. Uploads all three to the `phenomena-images` Supabase Storage bucket (upsert).
4. Reads the optional `<slug>.json` sidecar; otherwise uses Envato defaults.
5. Updates the `phenomena` row's `primary_image_url` to the hero URL plus all metadata fields.
6. Skips and reports if the slug doesn't exist or if the folder name disagrees with the DB's category for that slug.

## Validation guarantees

- **Missing slug** → skipped with `✗ no phenomenon with slug "X"` (typo check).
- **Category mismatch** → skipped with `✗ folder=X but DB says category=Y` so a wrong folder name doesn't silently miscategorize an image. Fix the folder name (or fix the DB row) and re-run.
- **Already adopted** → re-runs are safe; uploads use `upsert: true` and overwrite the DB row.

## One-off / single-image commands

The original CLI flags still work for one-shot adoption outside the
batch flow (e.g. an image you don't want to stage):

```bash
# Adopt from a URL (no local file needed)
tsx scripts/adopt-phenomena-images.ts \
  --slug triggered-haunting \
  --url https://example.com/source.jpg \
  --attribution 'Image: Envato Elements' \
  --license envato_elements \
  --alt 'Custom alt text'

# Adopt from a local file path (skips the source-images folder convention)
tsx scripts/adopt-phenomena-images.ts \
  --slug triggered-haunting \
  --file ~/Downloads/some-image.jpg \
  --attribution 'Image: Envato Elements' \
  --license envato_elements \
  --alt 'Custom alt text'
```

## License values

Recognized: `cc0`, `cc_by`, `cc_by_sa`, `pd_age`, `fair_use_educational`,
`proprietary`, `envato_elements`, `manual`. (The column is free-text, so
the script just records whatever you pass.)

## After adoption

The image appears on the phenomenon's pages within ~30s (Vercel
revalidation). No deploy required — Supabase Storage URLs are public
and the `phenomena` table read is live.
