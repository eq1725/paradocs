# Daily Classifier Catch-Up - Setup Guide

**V11.17.93** - daily cron for `scripts/classify-phenomena-batch.ts --all`.

## What this does

The Reddit-tail and NUFORC ingestion pipelines continuously land newly-approved reports into Supabase. The classifier (Haiku 4.5 via Anthropic Batch API) is a one-shot script that processes everything currently unclassified, then exits. Without a cron, new reports pile up between manual runs.

This setup wires a daily catch-up that:

- Fires once per day at 04:00 local (off-peak for batch turnaround).
- Runs `classify-phenomena-batch.ts --all` against the current backlog.
- Exits cleanly when the queue is empty (no daemon, no resource hold).
- Logs to `outputs/classifier-cron-YYYYMMDD-HHMM.log`.

**Expected daily volume:** ~2-3k newly-approved NUFORC reports.
**Expected runtime:** 10-30 min depending on backlog.
**Expected cost:** ~$3-5/run at V11.17.92's $0.00145/row.

---

## Two install options

Pick ONE. Running both works but doubles prompt-cache fragmentation.

| Option | Pros | Cons |
|---|---|---|
| **launchd (laptop)** | No GitHub Secrets to manage. Easy to inspect logs locally. | Skipped if laptop is asleep / lid closed at 04:00. |
| **GitHub Actions (cloud)** | Guaranteed daily run. Survives travel days. | Requires 3 GitHub Secrets. Logs live in Actions UI. |

Recommendation: **launchd as primary, GitHub Actions as backup if you travel often.** If you go with both, the second to run will find an empty queue and finish in seconds — wasted CI minutes are cheap.

---

## Option A: launchd (macOS LaunchAgent)

1. **Render the plist with your home dir baked in:**

   ```bash
   sed "s|USER_HOME|$HOME|g" \
     ~/paradocs/scripts/com.paradocs.classifier-daily.plist \
     > ~/Library/LaunchAgents/com.paradocs.classifier-daily.plist
   ```

   (launchd does not expand `$HOME` from inside a plist, so the template's `USER_HOME` placeholder must be replaced at install time.)

2. **Load it:**

   ```bash
   launchctl load ~/Library/LaunchAgents/com.paradocs.classifier-daily.plist
   ```

3. **Verify it's registered:**

   ```bash
   launchctl list | grep paradocs
   # Expect: -    0    com.paradocs.classifier-daily
   ```

4. **First run** happens at the next 04:00 local time. To test immediately without waiting:

   ```bash
   launchctl start com.paradocs.classifier-daily
   tail -f ~/paradocs/outputs/launchd-classifier.log
   ```

### Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.paradocs.classifier-daily.plist
rm ~/Library/LaunchAgents/com.paradocs.classifier-daily.plist
```

### Temporary disable (keep installed)

```bash
launchctl unload ~/Library/LaunchAgents/com.paradocs.classifier-daily.plist
# ... later, to re-enable:
launchctl load ~/Library/LaunchAgents/com.paradocs.classifier-daily.plist
```

---

## Option B: GitHub Actions

1. **Add three repo Secrets** at
   `https://github.com/eq1725/paradocs/settings/secrets/actions`:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`

   (Values mirror `~/paradocs/.env.local`.)

2. **Commit the workflow** (already in `.github/workflows/classifier-daily.yml`). Once on `main`, GitHub will register the schedule automatically.

3. **First run** happens at 09:00 UTC tomorrow. To test immediately:
   - Actions tab → "Daily Classifier Catch-Up" → "Run workflow"
   - Or from CLI: `gh workflow run classifier-daily.yml`

### Disable temporarily

Actions tab → "Daily Classifier Catch-Up" → top-right "..." → "Disable workflow". Re-enable from the same menu.

---

## Monitoring

### Where logs live

| Source | Path |
|---|---|
| launchd dated log (per run) | `~/paradocs/outputs/classifier-cron-YYYYMMDD-HHMM.log` |
| launchd stdout (latest only) | `~/paradocs/outputs/launchd-classifier.log` |
| launchd stderr (latest only) | `~/paradocs/outputs/launchd-classifier.err` |
| GitHub Actions | Actions tab → run → "Run classifier catch-up" step + downloadable `classifier-cron-log-*` artifact |

### Quick health check

```bash
# Most recent run summary:
tail -5 ~/paradocs/outputs/classifier-cron-*.log | tail -10

# Did it exit clean?
grep "exited with code" ~/paradocs/outputs/classifier-cron-*.log | tail -5
```

### Cost surveillance

The classifier already logs to `paradocs_narrative_cost_log` via the unified `ai-cost-logger` (V11.17.x). The admin cost panel at `/admin` surfaces daily Haiku spend — if a catch-up run cost spikes 2-3x without a matching volume spike, prompt-cache hit rate likely regressed (see `CLASSIFIER_COST_OPT_NOTES.md`).

---

## Troubleshooting

**launchd job never fires.**
- macOS suppresses LaunchAgents while the user is logged out. The user must be logged in at 04:00 (lid closed is fine on Apple Silicon if `pmset` allows wake-for-network).
- Check with `launchctl print gui/$(id -u)/com.paradocs.classifier-daily | grep -E '(state|last exit)'`.

**`npx tsx` not found in launchd context.**
- The plist sets `PATH` to include `/opt/homebrew/bin` and `/usr/local/bin`. If you use a different Node manager (nvm, asdf, volta), edit the plist's `EnvironmentVariables` block to point at its shim dir.

**Run takes longer than 30 min.**
- Normal during backlog spikes. The launchd job has no internal timeout; GitHub Actions caps at 5h.

**Two runs overlap (launchd + GitHub Actions both fire).**
- Harmless. The second sees an empty queue and exits in seconds. If you want hard exclusion, pick one option only.
