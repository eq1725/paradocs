# source-images/

Operator staging area for phenomenon hero images.

## Workflow

1. Drop image files into the appropriate category subfolder.
2. Name each file with the phenomenon slug (kebab-case):
   `source-images/ghosts_hauntings/triggered-haunting.jpg`
3. Optionally drop a `<slug>.json` sidecar next to it for per-image
   attribution / alt-text overrides.
4. Run the batch adopter:

   ```bash
   set -a; source .env.local; set +a
   tsx scripts/adopt-phenomena-images.ts --batch --dry-run   # preview
   tsx scripts/adopt-phenomena-images.ts --batch             # commit
   ```

Full docs: `docs/IMAGE_ADOPTION_WORKFLOW.md`

## Categories

The subfolders here mirror the canonical category set from
`scripts/audit-category-counts.ts` + the active mood-image folders.

## What's in / out of git

The category folders + this README ship in the repo so the
scaffolding exists on a fresh clone. Image and sidecar files
(`.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.json`) are gitignored —
originals stay on your machine; the re-encoded webps that get
uploaded to Supabase Storage are the canonical copies.
