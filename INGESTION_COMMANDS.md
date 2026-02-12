# ParaDocs Bulk Ingestion Commands

This guide provides ready-to-run commands for bulk data ingestion using the existing ParaDocs infrastructure.

---

## Quick Start

The ParaDocs project already has a robust ingestion system with adapters for:
- **NUFORC** - UFO sightings (scrapes nuforc.org directly)
- **BFRO** - Bigfoot sightings (scrapes bfro.net)
- **NDERF** - Near-death experiences
- **Reddit** - Via Arctic Shift API
- **Ghosts of America**, **Shadowlands**, **IANDS**, **Wikipedia**

---

## Method 1: Admin Ingestion API (Production)

Trigger ingestion via the admin API endpoint (requires admin authentication):

```bash
# Trigger all sources (default 500 records each)
curl -X POST "https://discoverparadocs.com/api/admin/ingest" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Trigger specific source with custom limit
curl -X POST "https://discoverparadocs.com/api/admin/ingest?source=nuforc&limit=1000" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Available source IDs: nuforc, bfro, nderf, reddit, ghostsofamerica, shadowlands, iands
```

---

## Method 2: Arctic Shift Reddit Import (Recommended for Reddit)

The Arctic Shift download tool provides free access to Reddit archives. **Download BOTH submissions AND comments!**

### Step 1: Download archives from Arctic Shift
1. Go to: https://arctic-shift.photon-reddit.com/download-tool
2. For each target subreddit, download:
   - **Submissions** (the original posts)
   - **Comments** (valuable personal experiences shared in replies!)
3. Files will be `.zst` (zstd compressed NDJSON)

### Step 2: Run the batch importer
```bash
cd ~/paradocs

# Import submissions
npx ts-node scripts/batch-import-reddit.ts ./data/paranormal_submissions.zst

# Import comments (auto-detected, titles generated from content)
npx ts-node scripts/batch-import-reddit.ts ./data/paranormal_comments.zst
```

**Target Subreddits (already configured):**
- r/paranormal, r/ufos, r/ghosts, r/cryptids
- r/glitch_in_the_matrix, r/highstrangeness
- r/thetruthishere, r/bigfoot, r/aliens
- r/skinwalkers, r/humanoidencounters
- r/nde, r/astralprojection, r/tulpas

**Why include comments?**
Many experiencers share their stories as replies to others' posts. Comments with 200+ characters and good engagement often contain detailed personal accounts that would otherwise be missed.

---

## Method 3: NUFORC CSV Import

For historical NUFORC data (150K+ records), use the CSV importer:

### Step 1: Download the dataset

Choose one of these sources:
- **Hugging Face**: https://huggingface.co/datasets/kcimc/NUFORC
- **GitHub**: https://github.com/timothyrenner/nuforc_sightings_data
- **Kaggle**: https://www.kaggle.com/datasets/NUFORC/ufo-sightings

### Step 2: Place CSV in data folder

```bash
mkdir -p data
# Download/copy nuforc CSV to data/nuforc_sightings.csv
```

### Step 3: Run the import script

```bash
# Dry run first (validate data)
node scripts/import-nuforc.js --dry-run --limit=100

# Import with limit
node scripts/import-nuforc.js --limit=10000

# Import all
node scripts/import-nuforc.js

# Import with offset (for resuming)
node scripts/import-nuforc.js --offset=50000 --limit=10000
```

---

## Method 4: Direct Web Scraping (Production Server)

The ingestion engine runs server-side and scrapes directly from source sites.

### Configure sources in Supabase

The `sources` table controls which sources are active. Enable sources via SQL:

```sql
-- Enable NUFORC source
UPDATE sources SET is_active = true, config = '{
  "max_months": 12,
  "fetch_full_details": false,
  "rate_limit_ms": 100
}'::jsonb WHERE slug = 'nuforc';

-- Enable BFRO source
UPDATE sources SET is_active = true, config = '{
  "states": ["wa", "or", "ca", "oh", "fl", "tx", "pa", "ny", "mi", "il", "ga", "nc", "az", "co", "mo"],
  "rate_limit_ms": 500
}'::jsonb WHERE slug = 'bfro';
```

### Trigger via cron or manual API call

```bash
# Via cron endpoint (used by Vercel Cron)
curl -X POST "https://discoverparadocs.com/api/cron/ingest"

# Via admin endpoint (authenticated)
curl -X POST "https://discoverparadocs.com/api/admin/ingest?limit=500" \
  -H "Authorization: Bearer YOUR_JWT"
```

---

## Method 5: Batch Reddit Import via Direct API

For manually importing Reddit posts using the direct-import API:

```typescript
// Sample script to import Reddit data via Arctic Shift
const ARCTIC_SHIFT_API = 'https://arctic-shift.photon-reddit.com/api/posts/search';
const IMPORT_API = 'https://discoverparadocs.com/api/admin/direct-import';

async function importSubreddit(subreddit: string, limit: number = 1000) {
  // Fetch from Arctic Shift
  const response = await fetch(
    `${ARCTIC_SHIFT_API}?subreddit=${subreddit}&limit=${limit}&sort=created_utc:desc`
  );
  const { data: posts } = await response.json();

  // Import to ParaDocs
  const result = await fetch(IMPORT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ posts })
  });

  return result.json();
}

// Run for each subreddit
const subreddits = ['paranormal', 'ufos', 'ghosts', 'bigfoot', 'nde'];
for (const sub of subreddits) {
  console.log(`Importing r/${sub}...`);
  const result = await importSubreddit(sub, 2000);
  console.log(result);
}
```

---

## Estimated Data Volumes

| Source | Method | Est. Records | Time |
|--------|--------|--------------|------|
| NUFORC (historical) | CSV Import | 150,000+ | 30-60 min |
| NUFORC (recent) | Web Scrape | 500-2000/run | 5-10 min |
| BFRO | Web Scrape | 100-500/run | 5-10 min |
| Reddit (per sub) | Arctic Shift | 5,000-50,000 | 10-30 min |
| NDERF | Zenodo + Scrape | 5,000+ | 15 min |
| Phantoms & Monsters | Blogger API | 3,000-5,000 | 20 min |
| Paranormal DB UK | Web Scrape | 15,000 | 30 min |

---

## Adding New Sources

### 1. Create adapter file

```typescript
// src/lib/ingestion/adapters/newsource.ts
import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

export const newsourceAdapter: SourceAdapter = {
  name: 'newsource',

  async scrape(config: Record<string, any>, limit: number): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];

    // Your scraping logic here
    // Each report needs: title, summary, description, category, etc.

    return { success: true, reports };
  }
};
```

### 2. Register adapter

```typescript
// src/lib/ingestion/adapters/index.ts
import { newsourceAdapter } from './newsource';

export const adapters: Record<string, SourceAdapter> = {
  // ... existing adapters
  newsource: newsourceAdapter,
};
```

### 3. Add source to database

```sql
INSERT INTO sources (name, slug, source_type, is_active, config)
VALUES (
  'New Source Name',
  'newsource',
  'scrape',
  true,
  '{"rate_limit_ms": 500}'::jsonb
);
```

---

## Running Full Bulk Import

For a complete bulk ingestion run, execute in this order:

```bash
# 1. Import historical NUFORC (largest dataset)
node scripts/import-nuforc.js --file=data/nuforc_complete.csv

# 2. Run Arctic Shift for all Reddit subreddits
npx ts-node scripts/arctic-shift-bulk-import.ts

# 3. Trigger web scrapers for recent data
curl -X POST "https://discoverparadocs.com/api/admin/ingest?limit=500"

# 4. Run pattern analysis after ingestion
curl -X POST "https://discoverparadocs.com/api/admin/run-patterns"
```

---

## Environment Variables Required

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

---

## Monitoring & Logs

- Check ingestion logs in Vercel dashboard
- View `ingestion_jobs` table in Supabase for job history
- Monitor `reports` table for new record counts

```sql
-- Check recent ingestion stats
SELECT
  source_type,
  COUNT(*) as total,
  MAX(created_at) as latest
FROM reports
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY source_type
ORDER BY total DESC;
```

---

*Last Updated: February 2026*
