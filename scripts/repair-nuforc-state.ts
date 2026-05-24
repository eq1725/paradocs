#!/usr/bin/env tsx
/**
 * V11.17.22 — Repair NUFORC state file: reset shards that 503-bombed.
 *
 * After Cloudflare cascades, the orchestrator marked many shards as
 * status=completed but with scraped=0 inserted=0. Those are silently
 * lost months. This script:
 *
 *   1. Reads outputs/nuforc-mass-ingest-state.json
 *   2. Finds shards where status=completed AND scraped=0
 *   3. Resets them to status=pending
 *   4. Writes the repaired state back
 *
 * Run with --dry-run first to see what would change without writing.
 */
import * as fs from 'fs'
import * as path from 'path'

const STATE_FILE = path.resolve(process.cwd(), 'outputs/nuforc-mass-ingest-state.json')
const dryRun = process.argv.includes('--dry-run')

if (!fs.existsSync(STATE_FILE)) {
  console.error('State file not found: ' + STATE_FILE)
  process.exit(1)
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
const shards = state.shards as any[]
const before = {
  completed: shards.filter(s => s.status === 'completed').length,
  pending: shards.filter(s => s.status === 'pending').length,
  inProgress: shards.filter(s => s.status === 'in_progress').length,
  failed: shards.filter(s => s.status === 'failed').length,
}
const toReset = shards.filter(s => s.status === 'completed' && (s.scraped || 0) === 0)
console.log('BEFORE: completed=' + before.completed + ' pending=' + before.pending + ' in_progress=' + before.inProgress + ' failed=' + before.failed)
console.log('Shards to reset (completed + scraped=0): ' + toReset.length)
if (toReset.length > 0) {
  console.log('Sample of shards being reset:')
  toReset.slice(0, 10).forEach(s => console.log('  ' + s.monthId + ' (scraped=' + s.scraped + ', inserted=' + s.inserted + ', ms=' + s.ms + ')'))
}
// Also reset any in_progress (likely the one killed mid-run)
const inProg = shards.filter(s => s.status === 'in_progress')
console.log('In-progress shards (also reset): ' + inProg.length)
inProg.forEach(s => console.log('  ' + s.monthId))

if (dryRun) {
  console.log('\n--dry-run: no changes written.')
  process.exit(0)
}

let resetCount = 0
for (const s of shards) {
  if ((s.status === 'completed' && (s.scraped || 0) === 0) || s.status === 'in_progress') {
    s.status = 'pending'
    s.scraped = 0
    s.inserted = 0
    s.duplicates = 0
    s.filtered = 0
    s.errors = 0
    s.ms = 0
    resetCount++
  }
}
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
const after = {
  completed: shards.filter(s => s.status === 'completed').length,
  pending: shards.filter(s => s.status === 'pending').length,
}
console.log('\nAFTER: completed=' + after.completed + ' pending=' + after.pending)
console.log('Reset ' + resetCount + ' shards.')
