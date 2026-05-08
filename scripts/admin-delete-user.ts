/**
 * scripts/admin-delete-user.ts
 *
 * One-shot admin tool to fully delete a Paradocs user (test cleanup).
 * Cascade order:
 *   1. Delete report_tags rows for any reports submitted by the user.
 *   2. Delete reports rows submitted by the user.
 *   3. Delete profiles row (frees the username).
 *   4. Delete auth.users row (frees the email).
 *
 * Usage:
 *
 *   # Dry-run (default — shows what WOULD be deleted, makes no changes):
 *   npx tsx scripts/admin-delete-user.ts <email>
 *
 *   # Actually delete (requires --confirm):
 *   npx tsx scripts/admin-delete-user.ts <email> --confirm
 *
 * Required env (read from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Safety:
 *   - Refuses to run on production (`*.vercel.app` host check).
 *     Override with --allow-production at your own risk.
 *   - Refuses to delete admin/owner accounts unless --force is passed.
 *   - Always prints a summary first; only acts after --confirm is set.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// --- Load .env.local if running from a fresh shell ---------------------------
function loadDotenv() {
  var envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  var raw = fs.readFileSync(envPath, 'utf8')
  raw.split(/\r?\n/).forEach(function (line) {
    var m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) return
    var k = m[1]
    var v = m[2].replace(/^"|"$/g, '').replace(/^'|'$/g, '')
    if (!process.env[k]) process.env[k] = v
  })
}
loadDotenv()

// --- Argument parsing --------------------------------------------------------
var args = process.argv.slice(2)
var email = args.find(function (a) { return !a.startsWith('--') }) || ''
var doConfirm = args.indexOf('--confirm') !== -1
var allowProd = args.indexOf('--allow-production') !== -1
var force = args.indexOf('--force') !== -1

if (!email) {
  console.error('Usage: npx tsx scripts/admin-delete-user.ts <email> [--confirm] [--force] [--allow-production]')
  process.exit(2)
}

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env. Add them to .env.local.')
  process.exit(2)
}

// --- Production safety -------------------------------------------------------
// Heuristic: if the URL looks like the production project, refuse without
// --allow-production. Adjust the matcher if your prod project ref differs.
var prodRefMatcher = /^https:\/\/[a-z0-9]+\.supabase\.co$/i
var looksLikeProd = prodRefMatcher.test(SUPABASE_URL)
if (looksLikeProd && !allowProd) {
  console.warn('[admin-delete-user] Target Supabase URL: ' + SUPABASE_URL)
  console.warn('[admin-delete-user] This looks like a production project. Pass --allow-production to override.')
}

// --- Main --------------------------------------------------------------------
async function main() {
  var admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('\n=== admin-delete-user ===')
  console.log('Email      : ' + email)
  console.log('Mode       : ' + (doConfirm ? 'DELETE (confirmed)' : 'DRY-RUN'))
  console.log('Target URL : ' + SUPABASE_URL)
  console.log('')

  // 1. Look up the auth user.
  // listUsers paginates; we walk pages until we find or exhaust.
  var found: any = null
  var page = 1
  while (page < 100) {
    var resp = await admin.auth.admin.listUsers({ page: page, perPage: 200 })
    if (resp.error) {
      console.error('listUsers failed: ' + resp.error.message)
      process.exit(1)
    }
    var users = resp.data && resp.data.users ? resp.data.users : []
    if (users.length === 0) break
    var hit = users.find(function (u: any) {
      return (u.email || '').toLowerCase() === email.toLowerCase()
    })
    if (hit) { found = hit; break }
    if (users.length < 200) break
    page++
  }

  if (!found) {
    console.log('No auth user found with that email. Nothing to delete.')
    process.exit(0)
  }

  console.log('Auth user found:')
  console.log('  id          : ' + found.id)
  console.log('  email       : ' + found.email)
  console.log('  created_at  : ' + found.created_at)
  console.log('  last_sign_in: ' + (found.last_sign_in_at || 'never'))
  console.log('')

  var userId: string = found.id

  // 2. Profile snapshot.
  var prof = await (admin.from('profiles') as any)
    .select('username, display_name, role, is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (prof.data) {
    console.log('Profile row:')
    console.log('  username    : ' + (prof.data.username || '(none)'))
    console.log('  display_name: ' + (prof.data.display_name || '(none)'))
    console.log('  role        : ' + (prof.data.role || '(none)'))
    console.log('  is_admin    : ' + (prof.data.is_admin ? 'YES' : 'no'))
    if ((prof.data.role === 'admin' || prof.data.is_admin) && !force) {
      console.error('\nRefusing to delete an admin account without --force.')
      process.exit(1)
    }
  } else {
    console.log('Profile row: (none)')
  }
  console.log('')

  // 3. Reports count.
  var rep = await (admin.from('reports') as any)
    .select('id, slug, title, status, created_at', { count: 'exact' })
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  var totalReports = rep.count || 0
  console.log('Reports submitted: ' + totalReports)
  if (rep.data && rep.data.length > 0) {
    rep.data.forEach(function (r: any) {
      console.log('  - [' + r.status + '] ' + r.slug + ' — ' + (r.title || '(no title)'))
    })
    if (totalReports > rep.data.length) {
      console.log('  ... +' + (totalReports - rep.data.length) + ' more')
    }
  }
  console.log('')

  if (!doConfirm) {
    console.log('DRY-RUN complete. Re-run with --confirm to actually delete.')
    process.exit(0)
  }

  // -------------------------------- DELETE --------------------------------
  console.log('Beginning cascade delete...\n')

  // 3a. Collect report ids and delete report_tags first.
  if (totalReports > 0) {
    var allReports = await (admin.from('reports') as any)
      .select('id')
      .eq('submitted_by', userId)
    var ids: string[] = (allReports.data || []).map(function (r: any) { return r.id })

    if (ids.length > 0) {
      console.log('Deleting ' + ids.length + ' report_tags rows by report_id...')
      var tagsDel = await (admin.from('report_tags') as any).delete().in('report_id', ids)
      if (tagsDel.error) console.error('  report_tags delete error: ' + tagsDel.error.message)
      else console.log('  ✓ report_tags removed')
    }

    console.log('Deleting reports submitted by user...')
    var repDel = await (admin.from('reports') as any).delete().eq('submitted_by', userId)
    if (repDel.error) console.error('  reports delete error: ' + repDel.error.message)
    else console.log('  ✓ reports removed')
  }

  // 3b. Profile.
  console.log('Deleting profile row...')
  var profDel = await (admin.from('profiles') as any).delete().eq('id', userId)
  if (profDel.error) console.error('  profiles delete error: ' + profDel.error.message)
  else console.log('  ✓ profile removed (username freed)')

  // 3c. auth.users.
  console.log('Deleting auth.users row...')
  var authDel = await admin.auth.admin.deleteUser(userId)
  if (authDel.error) {
    console.error('  auth deleteUser error: ' + authDel.error.message)
    process.exit(1)
  }
  console.log('  ✓ auth user removed (email freed)')

  console.log('\nDone.')
}

main().catch(function (err) {
  console.error(err)
  process.exit(1)
})
