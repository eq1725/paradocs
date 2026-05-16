#!/usr/bin/env node
/**
 * typecheck-gate — V10.8.K build-time safety net.
 *
 * Why this exists, not bare `tsc --noEmit`:
 *
 * The codebase carries ~500 pre-existing TypeScript errors — mostly
 * TS2339 (Property does not exist) where Supabase generated types are
 * out of date, plus a long tail of TS2345 / TS2769 / TS18047 from
 * Recharts/lodash usage that's been working in production for months.
 * Running plain `tsc --noEmit` would fail the build immediately and
 * doesn't let us land any new code until that backlog is resolved
 * (it's a multi-day effort across the whole app).
 *
 * What actually bit us recently was *missing references*: the V10.8.J
 * push shipped `trim(value)` without defining `trim`, and the live
 * /explore page crashed with `ReferenceError: trim is not defined`.
 * Same bug class as `engine.ts`'s out-of-scope `titleResult` (now
 * fixed in V10.8.K). These are TypeScript error classes:
 *
 *   - TS2304: Cannot find name 'X'
 *   - TS2552: Cannot find name 'X'. Did you mean 'Y'?
 *   - TS2451: Cannot redeclare block-scoped variable 'X'
 *   - TS2454: Variable 'X' is used before being assigned
 *   - TS18046 / TS18047: 'X' is of type unknown / possibly null when
 *                        accessed outside a narrow guard
 *
 * This gate runs `tsc --noEmit` over the project, filters the output
 * to ONLY those error classes, prints them in a reviewable format,
 * and exits non-zero when any are found. Everything else is noise we
 * tolerate until the broader cleanup happens.
 *
 * Wired as `prebuild` in package.json, so Vercel runs it before
 * `next build`. Locally: `npm run typecheck`.
 *
 * To extend the gated set, add codes to GATED_CODES below.
 */

const { spawnSync } = require('child_process')
const path = require('path')

// Error codes that fail the build. Keep this list narrow — only
// classes where the runtime symptom is a reliably-thrown error
// (ReferenceError, TypeError) rather than a soft type drift.
const GATED_CODES = new Set([
  'TS2304', // Cannot find name
  'TS2552', // Cannot find name (with did-you-mean)
  'TS2451', // Cannot redeclare block-scoped variable
  'TS2454', // Variable used before assigned
])

// Files that contain known pre-existing gated errors we're tolerating
// while the broader cleanup is staged. Each entry must list the exact
// code → line numbers it covers so this list stays auditable.
//
// Format: { 'src/path/file.ts': { 'TS2304': new Set([12, 47]) } }
//
// Add an entry here only when you're explicitly accepting that the
// gated bug ships. Removing an entry should be the goal of a follow-
// up commit.
const KNOWN_TOLERATED = {}

const projectRoot = path.resolve(__dirname, '..')
const tscBin = path.join(projectRoot, 'node_modules', '.bin', 'tsc')

console.log('[typecheck-gate] Running tsc --noEmit against project tsconfig…')
const start = Date.now()
const result = spawnSync(tscBin, ['--noEmit', '-p', 'tsconfig.json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  // tsc writes diagnostics to stdout, not stderr.
  maxBuffer: 50 * 1024 * 1024,
})
const elapsed = ((Date.now() - start) / 1000).toFixed(1)

if (result.error) {
  console.error('[typecheck-gate] Failed to invoke tsc:', result.error.message)
  process.exit(2)
}

// Lines look like:
//   src/lib/format/location-label.ts(59,16): error TS2304: Cannot find name 'trim'.
const diagPattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/
const lines = (result.stdout || '').split('\n')

const gatedHits = []
let totalErrors = 0
const codeCounts = new Map()

for (const line of lines) {
  const m = diagPattern.exec(line)
  if (!m) continue
  totalErrors++
  const [, file, lineNum, , code, message] = m
  codeCounts.set(code, (codeCounts.get(code) || 0) + 1)

  if (!GATED_CODES.has(code)) continue

  // Tolerated?
  const tolFile = KNOWN_TOLERATED[file]
  if (tolFile && tolFile[code] && tolFile[code].has(parseInt(lineNum, 10))) {
    continue
  }

  gatedHits.push({ file, line: lineNum, code, message })
}

console.log(`[typecheck-gate] tsc finished in ${elapsed}s — ${totalErrors} total errors`)
const breakdown = Array.from(codeCounts.entries()).sort((a, b) => b[1] - a[1])
for (const [code, count] of breakdown.slice(0, 6)) {
  const gated = GATED_CODES.has(code) ? ' (GATED)' : ''
  console.log(`  ${code}: ${count}${gated}`)
}

if (gatedHits.length === 0) {
  console.log('[typecheck-gate] OK — no missing-reference errors.')
  process.exit(0)
}

console.error('')
console.error('[typecheck-gate] FAIL — the following errors block the build:')
console.error('')
for (const h of gatedHits) {
  console.error(`  ${h.file}:${h.line}  ${h.code}  ${h.message}`)
}
console.error('')
console.error(`[typecheck-gate] ${gatedHits.length} blocking error(s). Fix or add to KNOWN_TOLERATED in scripts/typecheck-gate.js.`)
process.exit(1)
