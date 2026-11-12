/**
 * Classroom Connect — Attendance Recording & Authorization Verification Suite
 *
 * Part A (Always runs): Migration 13 grants, triggers, RLS hardening, and FacultyDashboard checks.
 * Part B (Always runs if URL + anon key exist): Live unauthenticated security probe.
 * Part C (Opt-in live E2E via RUN_LIVE_TESTS=true + SUPABASE_SERVICE_ROLE_KEY):
 *   Tests scenarios 1-8 against live Supabase without modifying existing student/faculty accounts
 *   or leaving behind test attendance data.
 *
 * Usage:
 *   node scripts/test-attendance-authorization.js
 *   RUN_LIVE_TESTS=true SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-attendance-authorization.js
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
  console.log('\n=== Part A: Attendance Grants, Triggers, RLS & Frontend Error-Handling Checks ===\n')

  const migrationPath =
    'supabase/migrations/20261112190000_fix_attendance_records_upsert_grants_and_rls.sql'
  assert(fs.existsSync(path.join(ROOT, migrationPath)), 'Migration 13 timestamped file exists')

  const sql = readProjectFile(migrationPath)

  assert(
    sql.includes('REVOKE DELETE ON public.attendance_records FROM authenticated'),
    'Migration 13 revokes unnecessary DELETE privilege on attendance_records from authenticated'
  )
  assert(
    sql.includes('GRANT UPDATE (session_id, student_id, status, marked_by, updated_at)') &&
      sql.includes('ON public.attendance_records') &&
      sql.includes('TO authenticated'),
    'Migration 13 grants column-level UPDATE required for PostgREST ON CONFLICT UPSERT'
  )
  assert(
    sql.includes('guard_attendance_record_identity') &&
      sql.includes('NEW.session_id IS DISTINCT FROM OLD.session_id') &&
      sql.includes('NEW.student_id IS DISTINCT FROM OLD.student_id'),
    'Migration 13 locks session_id and student_id against reassignment during updates'
  )
  assert(
    sql.includes('CREATE OR REPLACE FUNCTION public.current_faculty_id()') &&
      sql.includes("p.role = 'faculty'") &&
      sql.includes('f.is_archived = FALSE'),
    'Migration 13 hardens current_faculty_id() against inactive/archived/non-faculty accounts'
  )
  assert(
    sql.includes('CREATE POLICY faculty_create_attendance_records') &&
      sql.includes('public.is_faculty()') &&
      sql.includes('st.is_archived = FALSE') &&
      sql.includes("s.status = 'in_progress'") &&
      sql.includes('public.faculty_can_access_subject(s.subject_id)'),
    'Migration 13 enforces full authorization checks on faculty_create_attendance_records'
  )
  assert(
    sql.includes('CREATE POLICY faculty_update_attendance_records') &&
      (sql.match(/s\.status = 'in_progress'/g) || []).length >= 3,
    'Migration 13 restricts attendance record updates strictly to editable in_progress sessions'
  )
  assert(
    !/DISABLE ROW LEVEL SECURITY/i.test(sql) &&
      !/USING\s*\(\s*true\s*\)/i.test(sql) &&
      !/WITH CHECK\s*\(\s*true\s*\)/i.test(sql),
    'Migration 13 does not weaken or bypass RLS'
  )

  // Audit trigger & finalization protection remain intact in earlier migrations
  const auditSql = readProjectFile('supabase/migrations/20261105104104_attendance_workflow_and_audit.sql')
  assert(
    auditSql.includes('CREATE TRIGGER attendance_record_audit') &&
      auditSql.includes('CREATE TRIGGER protect_finalized_records'),
    'Audit logging and finalized-record protection triggers remain intact'
  )

  // Frontend FacultyDashboard checks
  const facultyJsx = readProjectFile('src/pages/faculty/FacultyDashboard.jsx')
  assert(
    facultyJsx.includes("activeSession.status !== 'in_progress'") &&
      !facultyJsx.includes("activeSession.status === 'finalized' || !user"),
    'FacultyDashboard guards single and bulk attendance writes strictly to in_progress sessions'
  )
  assert(
    facultyJsx.includes("onConflict: 'session_id,student_id'") &&
      facultyJsx.includes('await loadSessionRecords(activeSession.id)'),
    'FacultyDashboard refreshes persisted attendance counts from Supabase after successful writes'
  )
  assert(
    (facultyJsx.match(/catch \(err\) \{\s*setStatusMessage\(null\)/g) || []).length >= 5,
    'FacultyDashboard clears stale info/progress statusMessage in error handlers'
  )
  assert(
    facultyJsx.includes(".eq('is_archived', false)"),
    'FacultyDashboard excludes archived students when loading classroom roster'
  )
  assert(
    !/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(facultyJsx),
    'FacultyDashboard exposes zero service-role credentials'
  )
}

async function runLiveAnonymousProbe() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.log('\n[SKIP] Anonymous live probe skipped (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY).')
    return
  }

  console.log('\n=== Part B: Live Anonymous Attendance Security Probe ===\n')
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: anonRead, error: anonReadErr } = await anonClient
    .from('attendance_records')
    .select('id')
    .limit(1)
  assert(
    Boolean(anonReadErr) || (Array.isArray(anonRead) && anonRead.length === 0),
    'Unauthenticated client cannot read attendance_records'
  )

  const { error: anonInsertErr } = await anonClient.from('attendance_records').insert({
    session_id: '00000000-0000-0000-0000-000000000000',
    student_id: '00000000-0000-0000-0000-000000000000',
    status: 'present',
  })
  assert(Boolean(anonInsertErr), 'Unauthenticated client is denied INSERT on attendance_records')

  const { data: auditRead, error: auditReadErr } = await anonClient
    .from('attendance_audit_logs')
    .select('id')
    .limit(1)
  assert(
    Boolean(auditReadErr) || (Array.isArray(auditRead) && auditRead.length === 0),
    'Unauthenticated client cannot read attendance_audit_logs'
  )
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
  const { data: verified, error: verifyErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })
  if (verifyErr) throw verifyErr
  return { client, user: verified.user }
}

async function runLiveAuthenticatedE2E() {
  const runLive = process.argv.includes('--live') || process.env.RUN_LIVE_TESTS === 'true'
  if (!runLive) {
    console.log(
      '\n[INFO] Authenticated live attendance E2E skipped (run with RUN_LIVE_TESTS=true and SUPABASE_SERVICE_ROLE_KEY after applying Migration 13).'
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

  console.log('\n=== Part C: Live Authenticated Attendance Authorization E2E (Scenarios 1-8) ===\n')

  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: facProfile } = await adminClient
    .from('profiles')
    .select('id, email, login_id')
    .eq('login_id', 'FAC001')
    .single()
  const { data: facRow } = await adminClient
    .from('faculty')
    .select('id')
    .eq('profile_id', facProfile.id)
    .single()
  const { data: stuProfile } = await adminClient
    .from('profiles')
    .select('id, email, login_id')
    .eq('login_id', '2026STU001')
    .single()
  const { data: stuRow } = await adminClient
    .from('students')
    .select('id')
    .eq('profile_id', stuProfile.id)
    .single()
  const { data: allocRow } = await adminClient
    .from('faculty_subjects')
    .select('subject_id, subjects(id, subject_code, is_active)')
    .eq('faculty_id', facRow.id)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!facProfile || !facRow || !stuProfile || !stuRow || !allocRow) {
    assert(false, 'Locate existing FAC001, 2026STU001, and active subject allocation')
    return
  }

  const { client: facClient } = await signInAsExistingUser(adminClient, url, anonKey, facProfile.email)
  const { client: stuClient } = await signInAsExistingUser(adminClient, url, anonKey, stuProfile.email)

  // Disposable unassigned & inactive faculty users created strictly for temporary security tests
  const ts = Date.now()
  const tempEmailA = `qa_unassigned_${ts}@classroom.local`
  const tempEmailB = `qa_inactive_${ts}@classroom.local`
  let tempUserA = null
  let tempUserB = null
  let testSessionId = null

  try {
    // Find an unused future-safe session number on a test date far in the past (1999-01-01)
    const testDate = '1999-01-01'
    const { data: prevSess } = await adminClient
      .from('attendance_sessions')
      .select('session_number')
      .eq('subject_id', allocRow.subject_id)
      .eq('session_date', testDate)
      .order('session_number', { ascending: false })
      .limit(1)
    const nextNum = prevSess?.length ? prevSess[0].session_number + 1 : 1

    const { data: createdSess, error: sessErr } = await facClient
      .from('attendance_sessions')
      .insert({
        faculty_id: facRow.id,
        subject_id: allocRow.subject_id,
        session_date: testDate,
        session_number: nextNum,
        status: 'draft',
      })
      .select()
      .single()

    if (sessErr || !createdSess) {
      assert(false, 'FAC001 creates temporary draft session for test', sessErr?.message)
      return
    }
    testSessionId = createdSess.id

    // Draft session should reject direct attendance insert before start_attendance_session()
    const { error: draftErr } = await facClient.from('attendance_records').upsert(
      {
        session_id: testSessionId,
        student_id: stuRow.id,
        status: 'present',
        marked_by: facProfile.id,
      },
      { onConflict: 'session_id,student_id' }
    )
    assert(Boolean(draftErr), 'Draft session blocks attendance marking before start_attendance_session()')

    // Start session -> in_progress
    const { error: startErr } = await facClient.rpc('start_attendance_session', {
      target_session_id: testSessionId,
    })
    assert(!startErr, 'FAC001 transitions session to in_progress')

    // Scenario 1: FAC001 records Present for 2026STU001
    const { error: presentErr } = await facClient.from('attendance_records').upsert(
      {
        session_id: testSessionId,
        student_id: stuRow.id,
        status: 'present',
        marked_by: facProfile.id,
      },
      { onConflict: 'session_id,student_id' }
    )
    assert(!presentErr, 'Scenario 1: FAC001 can record Present for 2026STU001', presentErr?.message)

    // Scenario 2 & 3: FAC001 updates attendance to Absent while session is editable
    const { error: absentErr } = await facClient.from('attendance_records').upsert(
      {
        session_id: testSessionId,
        student_id: stuRow.id,
        status: 'absent',
        marked_by: facProfile.id,
      },
      { onConflict: 'session_id,student_id' }
    )
    assert(!absentErr, 'Scenarios 2 & 3: FAC001 can update attendance to Absent while in_progress', absentErr?.message)

    // Scenario 5: Student cannot record or modify attendance
    const { error: stuErr } = await stuClient.from('attendance_records').upsert(
      {
        session_id: testSessionId,
        student_id: stuRow.id,
        status: 'present',
        marked_by: stuProfile.id,
      },
      { onConflict: 'session_id,student_id' }
    )
    assert(Boolean(stuErr), 'Scenario 5: Student 2026STU001 cannot record or modify attendance')

    // Scenario 4: Unassigned faculty cannot record attendance
    const { data: uA } = await adminClient.auth.admin.createUser({
      email: tempEmailA,
      password: `QaTemp#${ts}A!`,
      email_confirm: true,
      user_metadata: {
        role: 'faculty',
        login_id: `QAUN${ts.toString().slice(-5)}`,
        employee_id: `QAUN${ts.toString().slice(-5)}`,
        full_name: 'QA Unassigned Faculty',
        admin_provisioned: true,
      },
    })
    tempUserA = uA?.user
    if (tempUserA) {
      const { client: unClient } = await signInAsExistingUser(adminClient, url, anonKey, tempEmailA)
      const { error: unErr } = await unClient.from('attendance_records').upsert(
        {
          session_id: testSessionId,
          student_id: stuRow.id,
          status: 'present',
          marked_by: tempUserA.id,
        },
        { onConflict: 'session_id,student_id' }
      )
      assert(Boolean(unErr), 'Scenario 4: Unassigned faculty cannot record attendance')
    }

    // Scenario 6: Inactive faculty cannot record attendance (assigned to subject, then deactivated)
    const { data: uB } = await adminClient.auth.admin.createUser({
      email: tempEmailB,
      password: `QaTemp#${ts}B!`,
      email_confirm: true,
      user_metadata: {
        role: 'faculty',
        login_id: `QAIN${ts.toString().slice(-5)}`,
        employee_id: `QAIN${ts.toString().slice(-5)}`,
        full_name: 'QA Inactive Faculty',
        admin_provisioned: true,
      },
    })
    tempUserB = uB?.user
    if (tempUserB) {
      const { data: facB } = await adminClient
        .from('faculty')
        .select('id')
        .eq('profile_id', tempUserB.id)
        .single()
      await adminClient.from('faculty_subjects').insert({
        faculty_id: facB.id,
        subject_id: allocRow.subject_id,
        is_active: true,
      })
      const { client: inClient } = await signInAsExistingUser(adminClient, url, anonKey, tempEmailB)
      await adminClient.from('profiles').update({ is_active: false }).eq('id', tempUserB.id)
      await adminClient.from('faculty').update({ is_active: false }).eq('id', facB.id)

      const { error: inErr } = await inClient.from('attendance_records').upsert(
        {
          session_id: testSessionId,
          student_id: stuRow.id,
          status: 'present',
          marked_by: tempUserB.id,
        },
        { onConflict: 'session_id,student_id' }
      )
      assert(Boolean(inErr), 'Scenario 6: Inactive faculty cannot record attendance')
    }

    // Scenario 8: Verify audit logs generated for insert + update
    const { data: auditRows } = await adminClient
      .from('attendance_audit_logs')
      .select('action, old_status, new_status')
      .eq('session_id', testSessionId)
      .order('created_at', { ascending: true })

    const actions = (auditRows || []).map((a) => a.action)
    assert(
      actions.includes('attendance_marked') && actions.includes('attendance_updated'),
      'Scenario 8: Attendance audit logs recorded both insert and status update'
    )

    // Scenario 7: Finalized session cannot be modified (using service_role to mark session finalized for isolated test)
    await adminClient
      .from('attendance_sessions')
      .update({ status: 'finalized', finalized_at: new Date().toISOString() })
      .eq('id', testSessionId)

    const { error: finErr } = await facClient.from('attendance_records').upsert(
      {
        session_id: testSessionId,
        student_id: stuRow.id,
        status: 'present',
        marked_by: facProfile.id,
      },
      { onConflict: 'session_id,student_id' }
    )
    assert(Boolean(finErr), 'Scenario 7: Finalized session blocks attendance modification')
  } finally {
    // Cleanup temporary QA test rows only
    if (testSessionId) {
      await adminClient.from('attendance_audit_logs').delete().eq('session_id', testSessionId)
      await adminClient.from('attendance_records').delete().eq('session_id', testSessionId)
      await adminClient.from('attendance_sessions').delete().eq('id', testSessionId)
    }
    for (const u of [tempUserA, tempUserB]) {
      if (!u) continue
      const { data: f } = await adminClient.from('faculty').select('id').eq('profile_id', u.id).maybeSingle()
      if (f) {
        await adminClient.from('faculty_subjects').delete().eq('faculty_id', f.id)
        await adminClient.from('faculty').delete().eq('id', f.id)
      }
      await adminClient.from('profiles').delete().eq('id', u.id)
      await adminClient.auth.admin.deleteUser(u.id)
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
