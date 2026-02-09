# Category Normalization Migration — Run Manually in Steps

Run each step **one at a time** in the Supabase SQL Editor.
Wait for each to succeed before running the next.

---

## Step 1: Check current category values (diagnostic)

```sql
SELECT category, COUNT(*) as cnt
FROM reports
GROUP BY category
ORDER BY cnt DESC;
```

## Step 2: Convert reports.category from ENUM to TEXT

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports'
    AND column_name = 'category'
    AND udt_name = 'phenomenon_category'
  ) THEN
    ALTER TABLE reports ALTER COLUMN category TYPE TEXT;
    RAISE NOTICE 'Changed reports.category from ENUM to TEXT';
  ELSE
    RAISE NOTICE 'reports.category is already TEXT';
  END IF;
END $$;
```

## Step 3: Normalize old enum values (run each UPDATE individually if timeouts occur)

```sql
UPDATE reports SET category = 'ufos_aliens' WHERE category = 'ufo_uap';
```

```sql
UPDATE reports SET category = 'cryptids' WHERE category = 'cryptid';
```

```sql
UPDATE reports SET category = 'ghosts_hauntings' WHERE category = 'ghost_haunting';
```

```sql
UPDATE reports SET category = 'psychic_phenomena' WHERE category IN ('unexplained_event', 'psychic_paranormal');
```

```sql
UPDATE reports SET category = 'esoteric_practices' WHERE category = 'mystery_location';
```

```sql
UPDATE reports SET category = 'combination' WHERE category = 'other';
```

## Step 4: Map orphan import categories

```sql
UPDATE reports SET category = 'psychic_phenomena' WHERE category = 'high_strangeness';
```

```sql
UPDATE reports SET category = 'consciousness_practices' WHERE category = 'nde_consciousness';
```

## Step 5: Convert phenomena + phenomenon_types tables (small tables, should be fast)

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phenomena'
    AND column_name = 'category'
    AND udt_name = 'phenomenon_category'
  ) THEN
    ALTER TABLE phenomena ALTER COLUMN category TYPE TEXT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phenomenon_types'
    AND column_name = 'category'
    AND udt_name = 'phenomenon_category'
  ) THEN
    ALTER TABLE phenomenon_types ALTER COLUMN category TYPE TEXT;
  END IF;
END $$;
```

```sql
UPDATE phenomenon_types SET category = 'ufos_aliens' WHERE category::TEXT = 'ufo_uap';
UPDATE phenomenon_types SET category = 'cryptids' WHERE category::TEXT = 'cryptid';
UPDATE phenomenon_types SET category = 'ghosts_hauntings' WHERE category::TEXT = 'ghost_haunting';
UPDATE phenomenon_types SET category = 'psychic_phenomena' WHERE category::TEXT IN ('unexplained_event', 'psychic_paranormal');
UPDATE phenomenon_types SET category = 'esoteric_practices' WHERE category::TEXT = 'mystery_location';
UPDATE phenomenon_types SET category = 'combination' WHERE category::TEXT = 'other';
```

```sql
UPDATE phenomena SET category = 'ufos_aliens' WHERE category::TEXT = 'ufo_uap';
UPDATE phenomena SET category = 'cryptids' WHERE category::TEXT = 'cryptid';
UPDATE phenomena SET category = 'ghosts_hauntings' WHERE category::TEXT = 'ghost_haunting';
UPDATE phenomena SET category = 'psychic_phenomena' WHERE category::TEXT IN ('unexplained_event', 'psychic_paranormal');
UPDATE phenomena SET category = 'esoteric_practices' WHERE category::TEXT = 'mystery_location';
UPDATE phenomena SET category = 'combination' WHERE category::TEXT = 'other';
```

## Step 5b: Backfill content_type for imported records (Reddit imports have NULL content_type)

```sql
UPDATE reports SET content_type = 'experiencer_report'
WHERE content_type IS NULL
AND source_type IN ('reddit-posts', 'reddit-comments');
```

If this times out, batch it:

```sql
UPDATE reports SET content_type = 'experiencer_report'
WHERE id IN (
  SELECT id FROM reports
  WHERE content_type IS NULL AND source_type IN ('reddit-posts', 'reddit-comments')
  LIMIT 50000
);
```

(Run the batched version repeatedly until 0 rows affected.)

## Step 6: Recreate indexes

```sql
DROP INDEX IF EXISTS idx_reports_category;
CREATE INDEX idx_reports_category ON reports(category);
```

```sql
DROP INDEX IF EXISTS idx_reports_status_category_created;
CREATE INDEX idx_reports_status_category_created ON reports(status, category, created_at DESC);
```

```sql
CREATE INDEX IF NOT EXISTS idx_reports_status_contenttype_created
ON reports(status, content_type, created_at DESC);
```

## Step 7: Verify (run Step 1 again to confirm all categories are normalized)

```sql
SELECT category, COUNT(*) as cnt
FROM reports
GROUP BY category
ORDER BY cnt DESC;
```

Expected categories: `ufos_aliens`, `cryptids`, `ghosts_hauntings`, `psychic_phenomena`,
`consciousness_practices`, `esoteric_practices`, `combination`
