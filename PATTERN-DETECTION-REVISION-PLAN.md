# Pattern Detection Revision Plan

**Created:** February 5, 2026
**Status:** Alpha - Phased Improvement
**Goal:** Make pattern detection useful for casual and academic users

---

## Current Problem

After bulk-ingesting test data, the pattern detection system is showing misleading results:

1. **Baseline pollution**: The historical baseline (mean: 1,524 reports/week) was calculated from bulk-imported test data
2. **False "Silence" pattern**: Current organic activity (3 reports) appears as a -6.1σ anomaly when compared against the inflated baseline
3. **Not useful for users**: The pattern shown doesn't represent a real phenomenon - it's an artifact of test data

### Root Cause
The `detectTemporalAnomaliesOptimized()` function in `pattern-analysis-v2.service.ts` (lines 284-309) calculates baseline statistics from ALL data, including bulk imports. While the code correctly filters out bulk-import SURGES (line 319-321), it doesn't account for how bulk imports inflate the baseline used to detect DROPS.

---

## Phase 1: Quick Fixes (Do Now)

### 1.1 Clear Existing Patterns and Reset Baseline

**SQL to run in Supabase:**
```sql
-- Archive all current patterns as "setup_artifact"
UPDATE detected_patterns
SET status = 'archived',
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{archived_reason}',
      '"baseline_reset_feb_2026"'
    )
WHERE status IN ('active', 'emerging');

-- Optional: Mark test data period in a new table
CREATE TABLE IF NOT EXISTS data_quality_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL, -- 'test_data', 'bulk_import', 'organic'
  description TEXT,
  exclude_from_baseline BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mark your test import period
INSERT INTO data_quality_periods (start_date, end_date, period_type, description, exclude_from_baseline)
VALUES (
  '2024-01-01'::timestamptz, -- adjust to your actual import dates
  '2026-02-01'::timestamptz,
  'bulk_import',
  'Initial test data ingestion',
  true
);
```

### 1.2 Add Minimum Threshold Before Showing Patterns

**Edit `src/pages/insights/index.tsx` (or wherever patterns are listed):**

Add a filter to hide low-confidence patterns:
```typescript
// Only show patterns that meet minimum quality thresholds
const displayablePatterns = patterns.filter(p =>
  p.confidence_score >= 0.3 && // Minimum 30% confidence
  p.report_count >= 10 &&      // At least 10 reports
  !p.metadata?.is_baseline_artifact // Not flagged as artifact
);
```

### 1.3 Fix the Baseline Calculation

**Edit `pattern-analysis-v2.service.ts`, function `detectTemporalAnomaliesOptimized()`:**

Replace lines 284-291 with:
```typescript
// Get weekly report counts for the past year - ORGANIC DATA ONLY
const { data: weeklyData, error } = await supabaseAdmin
  .from('reports')
  .select('created_at, category, source_type')
  .eq('status', 'approved')
  .in('source_type', ['user', null]) // Only organic/user-submitted reports
  .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
  .limit(50000)

if (error || !weeklyData || weeklyData.length < 50) {
  // Not enough organic data to establish baseline
  console.log('[Pattern Analysis] Insufficient organic data for temporal analysis')
  return { newPatterns: 0, updatedPatterns: 0 }
}
```

### 1.4 Fix UI Bugs

**Fix `[object Object]` in categories display:**

Find the component showing Technical Data and update:
```typescript
// Before
categories: pattern.metadata?.categories

// After
categories: Array.isArray(pattern.metadata?.categories)
  ? pattern.metadata.categories.join(', ')
  : JSON.stringify(pattern.metadata?.categories || [])
```

**Fix "Associated Reports (0)":**
The pattern-report linking logic needs to be checked - the 3 reports should be linked.

---

## Phase 2: Architectural Improvements (Next Sprint)

### 2.1 Data Provenance System

Create a system to track data sources and quality:

```typescript
// New table: ingestion_runs
interface IngestionRun {
  id: string;
  run_type: 'bulk_import' | 'user_submission' | 'api_sync';
  source_name: string; // 'nuforc', 'reddit', 'user', etc.
  started_at: Date;
  completed_at: Date;
  report_count: number;
  include_in_baseline: boolean;
}

// Add to reports table
ALTER TABLE reports ADD COLUMN ingestion_run_id UUID REFERENCES ingestion_runs(id);
```

### 2.2 Dual Baseline System

Maintain two baselines:
1. **Organic baseline**: Only user-submitted data (for detecting genuine anomalies)
2. **Total baseline**: All data (for understanding the full dataset)

```typescript
interface PatternBaseline {
  organic: {
    mean: number;
    stdDev: number;
    sampleSize: number;
    dateRange: { start: Date; end: Date };
  };
  total: {
    mean: number;
    stdDev: number;
    sampleSize: number;
    dateRange: { start: Date; end: Date };
  };
}
```

### 2.3 Minimum Observation Period

Don't show patterns until sufficient organic data exists:

```typescript
const MINIMUM_WEEKS_FOR_BASELINE = 4;
const MINIMUM_ORGANIC_REPORTS = 20;

function canShowPatterns(organicData: Report[]): boolean {
  const weeksCovered = getWeeksCovered(organicData);
  return weeksCovered >= MINIMUM_WEEKS_FOR_BASELINE &&
         organicData.length >= MINIMUM_ORGANIC_REPORTS;
}
```

### 2.4 Progressive Confidence Display

Show patterns differently based on confidence:

| Confidence | Display |
|------------|---------|
| < 30% | Hidden (admin only) |
| 30-50% | "Emerging signal (low confidence)" |
| 50-70% | "Potential pattern" |
| 70-90% | "Detected pattern" |
| > 90% | "Established pattern" |

### 2.5 Admin Controls

Build an admin panel to:
- Mark date ranges as "test data" (exclude from baseline)
- Reset baseline calculations
- View all patterns including hidden ones
- Manually archive/activate patterns
- Set global confidence thresholds

### 2.6 Empty State for New Platforms

When insufficient data exists, show an informative empty state:

```tsx
<EmptyState>
  <h3>Building Pattern Intelligence</h3>
  <p>
    We're collecting reports to establish baseline patterns.
    Pattern detection will activate once we have sufficient data
    to identify statistically significant anomalies.
  </p>
  <ProgressBar
    current={organicReportCount}
    target={MINIMUM_ORGANIC_REPORTS}
    label="Reports needed for pattern detection"
  />
</EmptyState>
```

---

## Phase 3: Academic User Features (Future)

### 3.1 Methodology Transparency
- Expandable methodology sections (already have this!)
- Downloadable statistical reports
- Citation generator (already have this!)

### 3.2 Skeptic Mode Enhancement
- Toggle between "anomaly-focused" and "skeptical" views
- Show mundane explanations prominently
- Link to related research

### 3.3 Data Quality Indicators
- Show data source composition
- Highlight potential biases
- Display confidence intervals prominently

---

## Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🔴 P0 | Clear existing patterns | 5 min | Immediate fix |
| 🔴 P0 | Filter organic-only baseline | 30 min | Correct detection |
| 🟡 P1 | Add minimum threshold filter | 15 min | Better UX |
| 🟡 P1 | Fix UI bugs | 30 min | Polish |
| 🟢 P2 | Data provenance system | 2-4 hrs | Long-term |
| 🟢 P2 | Admin controls | 4-8 hrs | Operational |
| 🔵 P3 | Empty state design | 1-2 hrs | UX |
| 🔵 P3 | Academic features | Ongoing | Differentiation |

---

## Questions for You

1. **Test data dates**: What date range covers your bulk import? Need this to mark it properly.

2. **Source types**: Are all your bulk imports marked with a non-'user' `source_type`? If not, we may need to mark them retroactively.

3. **Minimum thresholds**: What feels right for your alpha?
   - Minimum reports to show a pattern: 10? 20? 50?
   - Minimum confidence to show: 30%? 50%?

4. **Empty state preference**: When there's not enough data, should we:
   - Show nothing (clean slate)
   - Show a "building intelligence" message
   - Show historical patterns from your test data (labeled as such)

---

## Next Steps

Ready to implement Phase 1 now. Just confirm:
1. Should I run the SQL to clear existing patterns?
2. Should I modify the baseline calculation code?
3. What are your test data date ranges?
