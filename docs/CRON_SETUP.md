# Daily Pattern Analysis - Cron Setup Guide

The pattern analysis system needs to run daily to detect new patterns and update existing ones. This document explains how to set up reliable daily execution.

## Option 1: Vercel Cron (Requires Pro Plan)

Vercel Cron is already configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/analyze-patterns-v2",
      "schedule": "0 7 * * *"
    }
  ]
}
```

**Requirements:**
- Vercel Pro or Enterprise plan
- `CRON_SECRET` environment variable set in Vercel dashboard

To enable:
1. Upgrade to Vercel Pro
2. Add `CRON_SECRET` to Environment Variables (generate a random string)
3. Cron will run automatically at 7 AM UTC daily

---

## Option 2: cron-job.org (Free)

[cron-job.org](https://cron-job.org) is a free, reliable external cron service.

### Setup Steps:

1. **Create Account**: Sign up at https://cron-job.org

2. **Create New Cron Job**:
   - Title: `Paradocs Pattern Analysis`
   - URL: `https://beta.discoverparadocs.com/api/cron/analyze-patterns-v2`
   - Schedule: Daily at 7:00 AM UTC
   - Request Method: `GET` or `POST`
   - Headers (if CRON_SECRET is set):
     ```
     X-Cron-Secret: YOUR_CRON_SECRET_HERE
     ```

3. **Test**: Click "Test Run" to verify it works

4. **Enable**: Activate the cron job

---

## Option 3: GitHub Actions (Free)

Create `.github/workflows/daily-pattern-analysis.yml`:

```yaml
name: Daily Pattern Analysis

on:
  schedule:
    - cron: '0 7 * * *'  # 7 AM UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  analyze-patterns:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Pattern Analysis
        run: |
          curl -X POST \
            -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}" \
            "https://beta.discoverparadocs.com/api/cron/analyze-patterns-v2"
```

**Setup:**
1. Add `CRON_SECRET` to GitHub repository secrets
2. Push the workflow file to `.github/workflows/`
3. GitHub will run it daily at 7 AM UTC

---

## Option 4: Manual Trigger (Admin Panel)

For testing or one-off runs, use the admin endpoint:

```bash
curl -X POST https://beta.discoverparadocs.com/api/admin/trigger-pattern-analysis
```

Or visit `/api/admin/trigger-pattern-analysis` in browser (POST request).

---

## Verification

After any cron runs, check:

1. **Pattern Analysis Runs Table**: Query `pattern_analysis_runs` for recent runs
2. **Homepage**: Check "Emerging Patterns" section for updated dates
3. **API**: Call `/api/patterns/trending` to see latest patterns

---

## Environment Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `CRON_SECRET` | Authentication secret for cron endpoints | Vercel Cron, External Cron |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access | All pattern analysis |

---

## Troubleshooting

**Patterns not updating:**
1. Check `pattern_analysis_runs` table for errors
2. Verify CRON_SECRET matches
3. Check Vercel function logs

**Timeout errors:**
- Analysis should complete in <60 seconds
- If timing out, check Supabase for slow queries

**No new patterns detected:**
- Check if reports have categories set
- Verify reports have `status = 'approved'`
