# NDE Ingestion Pipeline - Setup & Resolution Guide

## Summary of What Was Done

### 1. Code Changes (Completed ✅)

**NDE Ingestion Endpoint Created:**
- File: `src/pages/api/admin/ingest-nde.ts`
- Dedicated endpoint for NDE content ingestion
- **Automatic phenomenon linking** - Every new NDE report is now automatically linked to the Near-Death Experience phenomenon (ID: `ed6ef301-77eb-43ce-aef3-43d9cc2cfa70`)
- Uses 0.9 confidence score for auto-linked reports
- Tracks linked count in ingestion summary

**NDERF Adapter Created:**
- File: `src/lib/ingestion/adapters/nderf.ts`
- Scrapes Near-Death Experience Research Foundation (nderf.org)
- Extracts NDE characteristics, credibility scoring, tags

**IANDS Adapter Created:**
- File: `src/lib/ingestion/adapters/iands.ts`
- Scrapes International Association for Near-Death Studies (iands.org)
- Similar structure to NDERF adapter

### 2. Current Status

**Working:**
- Standard Reddit ingestion via Admin panel (uses Reddit adapter)
- Found 7,782 reports with 'nde' tag in database
- New reports will be auto-linked when ingested through the NDE endpoint

**Blocked by Environment:**
- NDERF (nderf.org) - Blocked by proxy allowlist
- IANDS (iands.org) - Blocked by proxy allowlist
- Arctic Shift API (reddit archive) - Blocked by proxy allowlist

---

## How to Resolve NDERF/IANDS Access

The Cowork environment uses a proxy that blocks external web requests to domains not on its allowlist. This is a security feature, not a permission issue with the websites themselves.

### Option 1: Run Ingestion Locally (Recommended)

1. **Clone the repository locally:**
   ```bash
   git clone https://github.com/eq1725/paradocs.git
   cd paradocs
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env.local` file with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://bhkbctdmwnowfmqpksed.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   OPENAI_API_KEY=your-openai-key
   ```

3. **Create a local ingestion script:**
   ```bash
   # Create scripts/run-nde-ingestion.ts
   npx ts-node scripts/run-nde-ingestion.ts
   ```

4. **The adapters will work locally** since there's no proxy blocking external requests.

### Option 2: Use Vercel Cron Jobs

The production Vercel deployment doesn't have the same proxy restrictions:

1. **Add a cron job** in `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/cron/ingest-nde",
       "schedule": "0 0 * * *"
     }]
   }
   ```

2. **Create the cron endpoint** at `src/pages/api/cron/ingest-nde.ts`

### Option 3: Request Proxy Allowlist Update

If you need to run ingestion from Cowork specifically, contact Anthropic support to request adding these domains to the proxy allowlist:
- `nderf.org`
- `iands.org`
- `arctic-shift.photon-reddit.com`

---

## How to Link Existing 7,782 NDE Reports

The Supabase SQL Editor has a timeout limit that prevents bulk operations. Use one of these methods:

### Method 1: Direct Database Connection (Recommended)

1. **Get your database connection string** from Supabase Dashboard:
   - Go to Settings → Database → Connection string
   - Copy the URI format

2. **Run the SQL directly via psql:**
   ```bash
   psql "postgresql://postgres:[password]@db.bhkbctdmwnowfmqpksed.supabase.co:5432/postgres"
   ```

3. **Execute the linking query:**
   ```sql
   -- Set a long timeout
   SET statement_timeout = '600s';

   -- Link all NDE-tagged reports to the phenomenon
   INSERT INTO report_phenomena (report_id, phenomenon_id, confidence, tagged_by)
   SELECT id, 'ed6ef301-77eb-43ce-aef3-43d9cc2cfa70'::uuid, 0.85, 'auto-bulk'
   FROM reports
   WHERE 'nde' = ANY(tags)
   ON CONFLICT (report_id, phenomenon_id) DO NOTHING;
   ```

### Method 2: Batch Script

Create a script that runs the operation in batches:

```typescript
// scripts/link-nde-reports.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NDE_PHENOMENON_ID = 'ed6ef301-77eb-43ce-aef3-43d9cc2cfa70';
const BATCH_SIZE = 100;

async function linkNDEReports() {
  let offset = 0;
  let totalLinked = 0;

  while (true) {
    // Get batch of unlinked NDE reports
    const { data: reports, error } = await supabase
      .from('reports')
      .select('id')
      .contains('tags', ['nde'])
      .range(offset, offset + BATCH_SIZE - 1);

    if (error || !reports || reports.length === 0) break;

    // Link each report
    for (const report of reports) {
      const { error: linkError } = await supabase
        .from('report_phenomena')
        .upsert({
          report_id: report.id,
          phenomenon_id: NDE_PHENOMENON_ID,
          confidence: 0.85,
          tagged_by: 'auto-bulk'
        }, {
          onConflict: 'report_id,phenomenon_id',
          ignoreDuplicates: true
        });

      if (!linkError) totalLinked++;
    }

    console.log(`Linked ${totalLinked} reports...`);
    offset += BATCH_SIZE;

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`Done! Total linked: ${totalLinked}`);
}

linkNDEReports();
```

Run with: `npx ts-node scripts/link-nde-reports.ts`

---

## Viewing NDE Reports on the Site

After linking NDE reports to the phenomenon, you can view them in several ways:

### From the Explore Page

Navigate to the Explore page with the phenomenon filter:
```
/explore?phenomenon=near-death-experience
```

This will show all reports that are linked to the Near-Death Experience phenomenon via the `report_phenomena` junction table.

### From the Phenomena Encyclopedia

1. Go to `/phenomena` (the Phenomena Encyclopedia)
2. Find "Near-Death Experience" in the list
3. Click on it to view the phenomenon detail page
4. Click "View all in Explore" or the report count to see all linked reports

### Direct Link

The NDE phenomenon page should be at:
```
/phenomena/near-death-experience
```

---

## Verification

After linking, verify the results:

```sql
-- Count linked NDE reports
SELECT COUNT(*)
FROM report_phenomena
WHERE phenomenon_id = 'ed6ef301-77eb-43ce-aef3-43d9cc2cfa70';

-- Check NDE phenomenon stats are updated
SELECT name, report_count
FROM phenomena
WHERE id = 'ed6ef301-77eb-43ce-aef3-43d9cc2cfa70';
```

---

## Going Forward

All **new** NDE reports ingested through the `/api/admin/ingest-nde` endpoint will be automatically linked to the phenomenon. The ingestion code now includes:

1. `linkToNDEPhenomenon()` function that links reports with 0.9 confidence
2. Auto-linking on both INSERT and UPDATE operations
3. Tracking of linked count in the response summary

The existing 7,782 reports just need to be linked once using one of the methods above.
