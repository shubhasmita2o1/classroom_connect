/**
 * Classroom Connect — Safe Draft Attendance Session Deletion Verification Suite
 *
 * Part A (Always runs): Static Migration 14, FK/audit safety, RLS, trigger, and UI checks.
 * Part B (Always runs if URL + anon key exist): Live unauthenticated security probe.
 * Part C (Opt-in live E2E via RUN_LIVE_TESTS=true + SUPABASE_SERVICE_ROLE_KEY):
 *   Tests scenarios 1-9 against live Supabase without modifying existing accounts
 *   or finalized attendance records.
 *
 * Usage:
 *   node scripts/test-session-deletion.js
 *   RUN_LIVE_TESTS=true SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-session-deletion.js
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

function loadEnv() {
  for (const envFile of ['.env', '.env.local']) {
    const fullPath = path.join(ROOT, envFile)
    if (!fs.existsSync(fullPath)) continue
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  }
}

loadEnv()

let passed = 0
let failed = 0

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  [PASS] ${label}`)
  } else {
    failed += 1
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function readProjectFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function runStaticVerification() {
  console.log('\n=== Part A: Safe Draft Session Deletion Static & Security Checks ===\n')

  const migrationPath = 'supabase/migrations/20261112193000_safe_draft_session_deletion.sql'
  assert(fs.existsSync(path.join(ROOT, migrationPath)), 'Migration 14 timestamped file exists')

  const sql = readProjectFile(migrationPath)

  assert(
    sql.includes('ALTER COLUMN session_id DROP NOT NULL') &&
      sql.includes('ON DELETE SET NULL') &&
      sql.includes("'draft_session_deleted'"),
    'Migration 14 preserves audit history via nullable session_id FK (ON DELETE SET NULL) and audit action'
  )
  assert(
    sql.includes('CREATE POLICY faculty_delete_draft_sessions') &&
      sql.includes("status = 'draft'") &&
      sql.includes('public.is_faculty()') &&
      sql.includes('public.current_faculty_id()') &&
      sql.includes('public.faculty_can_access_subject(subject_id)'),
    'Migration 14 limits faculty RLS DELETE strictly to owned draft sessions on allocated subjects'
  )
  assert(
    sql.includes('enforce_draft_only_session_delete') &&
      sql.includes("IF OLD.status = 'finalized'") &&
      sql.includes("IF OLD.status <> 'draft'"),
    'Migration 14 enforces draft-only deletion at BEFORE DELETE trigger level'
  )
  assert(
    sql.includes('prevent_finalized_attendance_changes') &&
      sql.includes("RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END"),
    'Migration 14 corrects prevent_finalized_attendance_changes to return OLD on DELETE'
  )
  assert(
    sql.includes('CREATE OR REPLACE FUNCTION public.delete_draft_attendance_session') &&
      sql.includes('SECURITY DEFINER') &&
      sql.includes("SET search_path = ''") &&
      sql.includes('FOR UPDATE') &&
      sql.includes('REVOKE ALL ON FUNCTION public.delete_draft_attendance_session(UUID) FROM PUBLIC, anon'),
    'Migration 14 provides locked SECURITY DEFINER delete_draft_attendance_session RPC restricted from anon'
  )
  assert(
    !sql.includes('GRANT DELETE ON public.attendance_records') &&
      !/DISABLE ROW LEVEL SECURITY/i.test(sql) &&
      !/USING\s*\(\s*true\s*\)/i.test(sql),
    'Migration 14 does not grant DELETE on attendance_records or weaken RLS'
  )

  // Modal UI checks
  const modalPath = 'src/components/DeleteDraftSessionModal.jsx'
  assert(fs.existsSync(path.join(ROOT, modalPath)), 'DeleteDraftSessionModal component exists')
  const modalJsx = readProjectFile(modalPath)

  assert(
    modalJsx.includes('session.session_number') &&
      modalJsx.includes('session.session_date') &&
      modalJsx.includes('subjectCode') &&
      modalJsx.includes('draft attendance data'),
    'DeleteDraftSessionModal displays subject code, session number, date, and permanent removal warning'
  )
  assert(
    modalJsx.includes('disabled={deleting}') &&
      modalJsx.includes('bg-rose-600') &&
      modalJsx.includes('Deleting Draft...'),
    'DeleteDraftSessionModal applies destructive styling and prevents double-click during loading'
  )

  // FacultyDashboard UI checks
  const facultyJsx = readProjectFile('src/pages/faculty/FacultyDashboard.jsx')
  assert(
    facultyJsx.includes("sess.status === 'draft'") &&
      facultyJsx.includes('handleRequestDeleteDraft(e, sess)') &&
      facultyJsx.includes('<Trash2'),
    'FacultyDashboard shows delete icon button strictly when sess.status === draft'
  )
  assert(
    facultyJsx.includes("supabase.rpc('delete_draft_attendance_session'") &&
      facultyJsx.includes('e.stopPropagation()') &&
      facultyJsx.includes('await loadFacultyData(false)'),
    'FacultyDashboard invokes transactional RPC, prevents card click propagation, and refreshes list'
  )
}

async function runLiveAnonymousProbe() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.log('\n[SKIP] Anonymous live probe skipped (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY).')
    return
  }

  console.log('\n=== Part B: Live Anonymous Session Deletion Security Probe ===\n')
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: delErr } = await anonClient
    .from('attendance_sessions')
    .delete()
    .eq('id', '00000000-0000-0000-0000-000000000000')
  assert(Boolean(delErr), 'Unauthenticated client is denied DELETE on attendance_sessions')

  const { error: rpcErr } = await anonClient.rpc('delete_draft_attendance_session', {
    target_session_id: '00000000-0000-0000-0000-000000000000',
  })
  assert(Boolean(rpcErr), 'Unauthenticated client cannot invoke delete_draft_attendance_session RPC')
}

async function signInAsExistingUser(adminClient, url, anonKey, email) {
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkErr) throw linkErr

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: verifyErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })
  if (verifyErr) throw verifyErr
  return client
}

async function runLiveAuthenticatedE2E() {
  const runLive = process.argv.includes('--live') || process.env.RUN_LIVE_TESTS === 'true'
  if (!runLive) {
    console.log(
      '\n[INFO] Authenticated live E2E skipped (run with RUN_LIVE_TESTS=true and SUPABASE_SERVICE_ROLE_KEY after applying Migration 14).'
    )
    return
  }

  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    console.log('\n[SKIP] Live E2E requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.')
    return
  }

  console.log('\n=== Part C: Live Authenticated Draft Session Deletion E2E (Scenarios 1-9) ===\n')

  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: facProfile } = await adminClient
    .from('profiles')
    .select('id, email')
    .eq('login_id', 'FAC001')
    .single()
  const { data: facRow } = await adminClient
    .from('faculty')
    .select('id')
    .eq('profile_id', facProfile.id)
    .single()
  const { data: stuProfile } = await adminClient
    .from('profiles')
    .select('id, email')
    .eq('login_id', '2026STU001')
    .single()
  const { data: adminProfile } = await adminClient
    .from('profiles')
    .select('id, email')
    .eq('login_id', 'ADMIN001')
    .single()
  const { data: allocRow } = await adminClient
    .from('faculty_subjects')
    .select('subject_id')
    .eq('faculty_id', facRow.id)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!facProfile || !facRow || !stuProfile || !adminProfile || !allocRow) {
    assert(false, 'Locate FAC001, 2026STU001, ADMIN001, and active subject allocation')
    return
  }

  const facClient = await signInAsExistingUser(adminClient, url, anonKey, facProfile.email)
  const stuClient = await signInAsExistingUser(adminClient, url, anonKey, stuProfile.email)
  const adminUserClient = await signInAsExistingUser(adminClient, url, anonKey, adminProfile.email)

  const ts = Date.now()
  const otherEmail = `qa_other_fac_${ts}@classroom.local`
  let otherUser = null
  const testDate = '1999-01-02'
  const createdSessionIds = []

  try {
    const { data: prev } = await adminClient
      .from('attendance_sessions')
      .select('session_number')
      .eq('subject_id', allocRow.subject_id)
      .eq('session_date', testDate)
      .order('session_number', { ascending: false })
      .limit(1)
    let nextNum = prev?.length ? prev[0].session_number + 1 : 1

    // Create 3 isolated sessions: draft1 (for FAC001 delete), draft2 (for admin delete & status tests), inProg (started)
    const { data: draft1 } = await facClient
      .from('attendance_sessions')
      .insert({
        faculty_id: facRow.id,
        subject_id: allocRow.subject_id,
        session_date: testDate,
        session_number: nextNum++,
        status: 'draft',
      })
      .select()
      .single()
    if (draft1) createdSessionIds.push(draft1.id)

    const { data: draft2 } = await facClient
      .from('attendance_sessions')
      .insert({
        faculty_id: facRow.id,
        subject_id: allocRow.subject_id,
        session_date: testDate,
        session_number: nextNum++,
        status: 'draft',
      })
      .select()
      .single()
    if (draft2) createdSessionIds.push(draft2.id)

    const { data: inProg } = await facClient
      .from('attendance_sessions')
      .insert({
        faculty_id: facRow.id,
        subject_id: allocRow.subject_id,
        session_date: testDate,
        session_number: nextNum++,
        status: 'draft',
      })
      .select()
      .single()
    if (inProg) createdSessionIds.push(inProg.id)

    await facClient.rpc('start_attendance_session', { target_session_id: inProg.id })

    // Scenario 6: Student cannot delete any session
    const { error: stuDelErr } = await stuClient.rpc('delete_draft_attendance_session', {
      target_session_id: draft1.id,
    })
    assert(Boolean(stuDelErr), 'Scenario 6: Student cannot delete draft session')

    // Scenario 5: Another faculty cannot delete FAC001's draft session
    const { data: uOther } = await adminClient.auth.admin.createUser({
      email: otherEmail,
      password: `QaOther#${ts}!`,
      email_confirm: true,
      user_metadata: {
        role: 'faculty',
        login_id: `QAOT${ts.toString().slice(-5)}`,
        employee_id: `QAOT${ts.toString().slice(-5)}`,
        full_name: 'QA Other Faculty',
        admin_provisioned: true,
      },
    })
    otherUser = uOther?.user
    if (otherUser) {
      const otherClient = await signInAsExistingUser(adminClient, url, anonKey, otherEmail)
      const { error: otherErr } = await otherClient.rpc('delete_draft_attendance_session', {
        target_session_id: draft1.id,
      })
      assert(Boolean(otherErr), 'Scenario 5: Other faculty cannot delete another faculty member draft session')
    }

    // Scenario 3: Faculty cannot delete in_progress session
    const { error: inProgErr } = await facClient.rpc('delete_draft_attendance_session', {
      target_session_id: inProg.id,
    })
    assert(Boolean(inProgErr), 'Scenario 3: Faculty cannot delete an in_progress session')

    // Scenario 7: Admin also cannot delete in_progress session, but CAN delete draft session
    const { error: adminInProgErr } = await adminUserClient.rpc('delete_draft_attendance_session', {
      target_session_id: inProg.id,
    })
    assert(Boolean(adminInProgErr), 'Scenario 7a: Admin is blocked from deleting an in_progress session')

    const { error: adminDraftErr } = await adminUserClient.rpc('delete_draft_attendance_session', {
      target_session_id: draft2.id,
    })
    assert(!adminDraftErr, 'Scenario 7b: Authorized admin can delete a draft session', adminDraftErr?.message)

    // Scenarios 1 & 2: FAC001 deletes owned draft1 and confirms it disappears
    const { error: facDelErr } = await facClient.rpc('delete_draft_attendance_session', {
      target_session_id: draft1.id,
    })
    assert(!facDelErr, 'Scenario 1: FAC001 can delete owned draft session', facDelErr?.message)

    const { data: checkGone } = await adminClient
      .from('attendance_sessions')
      .select('id')
      .eq('id', draft1.id)
      .maybeSingle()
    assert(!checkGone, 'Scenario 2: Deleted draft session disappears from attendance_sessions')

    // Scenario 8: Audit log entry recorded for draft deletion
    const { data: delLogs } = await adminClient
      .from('attendance_audit_logs')
      .select('id, action')
      .eq('action', 'draft_session_deleted')
      .contains('details', { deleted_session_id: draft1.id })
    assert(Array.isArray(delLogs) && delLogs.length === 1, 'Scenario 8: draft_session_deleted audit entry recorded')

    // Scenario 4: Finalized session cannot be deleted (check against an existing finalized session or inProg if finalized)
    const { data: existingFinalized } = await adminClient
      .from('attendance_sessions')
      .select('id')
      .eq('status', 'finalized')
      .limit(1)
      .maybeSingle()

    if (existingFinalized) {
      const { error: finErr } = await facClient.rpc('delete_draft_attendance_session', {
        target_session_id: existingFinalized.id,
      })
      assert(Boolean(finErr), 'Scenario 4: Finalized session cannot be deleted')
    } else {
      console.log('  [INFO] No pre-existing finalized session present to probe for Scenario 4.')
    }
  } finally {
    // Cleanup temporary test rows only
    for (const sid of createdSessionIds) {
      await adminClient.from('attendance_audit_logs').delete().eq('session_id', sid)
      await adminClient.from('attendance_records').delete().eq('session_id', sid)
      await adminClient.from('attendance_sessions').delete().eq('id', sid)
    }
    await adminClient
      .from('attendance_audit_logs')
      .delete()
      .eq('action', 'draft_session_deleted')
      .eq('details->>session_date', testDate)

    if (otherUser) {
      await adminClient.from('faculty').delete().eq('profile_id', otherUser.id)
      await adminClient.from('profiles').delete().eq('id', otherUser.id)
      await adminClient.auth.admin.deleteUser(otherUser.id)
    }
  }
}

async function main() {
  runStaticVerification()
  await runLiveAnonymousProbe()
  await runLiveAuthenticatedE2E()

  console.log(`\nSummary: ${passed} passed, ${failed} failed.`)
  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
