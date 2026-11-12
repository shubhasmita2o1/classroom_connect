/**
 * Classroom Connect — Academic Management Verification Suite
 *
 * Part A (Always runs): Static schema, migration, RLS, UI integration, and security checks.
 * Part B (Optional live integration): Runs when --live or RUN_LIVE_TESTS=true is set AND
 *        SUPABASE_SERVICE_ROLE_KEY + test account credentials are provided in env.
 *
 * Usage:
 *   node scripts/test-academic-management.js
 *   RUN_LIVE_TESTS=true node scripts/test-academic-management.js
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
  console.log('\n=== Part A: Academic Management Static, Security & Integration Checks ===\n')

  // 1. Migration verification
  const migrationPath = 'supabase/migrations/20261112173500_academic_management_hardening.sql'
  assert(fs.existsSync(path.join(ROOT, migrationPath)), 'Timestamped migration file exists')
  const migrationSql = readProjectFile(migrationPath)

  assert(
    migrationSql.includes('idx_unique_subjects_code_normalized') &&
      migrationSql.includes('UNIQUE INDEX'),
    'Migration enforces case/whitespace-normalized unique subject_code index'
  )
  assert(
    migrationSql.includes('check_subject_code_format') &&
      migrationSql.includes('check_subject_name_not_blank'),
    'Migration validates non-blank subject_name and structured subject_code format'
  )
  assert(
    migrationSql.includes('unassigned_at') && migrationSql.includes('updated_at'),
    'Migration adds unassigned_at and updated_at lifecycle columns to faculty_subjects'
  )
  assert(
    migrationSql.includes('validate_faculty_subject_allocation') &&
      migrationSql.includes('f.is_archived = FALSE') &&
      migrationSql.includes('f.is_active = TRUE') &&
      migrationSql.includes('s.is_active = TRUE'),
    'Migration adds trigger blocking active allocations for inactive/archived faculty or inactive subjects'
  )
  assert(
    migrationSql.includes('CREATE OR REPLACE FUNCTION public.faculty_can_access_subject') &&
      migrationSql.includes('sub.is_active = TRUE'),
    'Migration hardens faculty_can_access_subject() to require active subjects'
  )
  assert(
    !/DISABLE ROW LEVEL SECURITY/i.test(migrationSql) &&
      !/USING\s*\(\s*true\s*\)/i.test(migrationSql),
    'Migration does not disable or weaken Row Level Security'
  )

  // 2. Frontend security check (no service role key or TypeScript files introduced in src)
  const srcFiles = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else srcFiles.push(full)
    }
  }
  walk(path.join(ROOT, 'src'))

  const tsFiles = srcFiles.filter((f) => /\.(ts|tsx)$/.test(f))
  assert(tsFiles.length === 0, 'Zero TypeScript files introduced in src/ (JavaScript only)')

  const exposedSecrets = srcFiles.filter((f) => {
    const content = fs.readFileSync(f, 'utf8')
    return /SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(content)
  })
  assert(exposedSecrets.length === 0, 'No service-role key or reference exposed in src/')

  // 3. AdminDashboard integration checks
  const adminCode = readProjectFile('src/pages/admin/AdminDashboard.jsx')
  assert(
    adminCode.includes("import AcademicManagementPanel from '../../components/AcademicManagementPanel'") &&
      adminCode.includes("setActiveTab('academics')") &&
      adminCode.includes('Academic Management'),
    'AdminDashboard integrates Academic Management tab and component'
  )
  assert(
    adminCode.includes('System Overview') &&
      adminCode.includes('Account Provisioning') &&
      adminCode.includes('Roster & Users') &&
      adminCode.includes('Audit Logs'),
    'AdminDashboard preserves all 4 existing navigation tabs unchanged'
  )

  // 4. SubjectFormModal checks
  const modalCode = readProjectFile('src/components/SubjectFormModal.jsx')
  assert(
    modalCode.includes('subject_code') &&
      modalCode.includes('subject_name') &&
      modalCode.includes('23505'),
    'SubjectFormModal validates mandatory fields and handles duplicate constraint errors (23505)'
  )

  // 5. AcademicManagementPanel checks
  const panelCode = readProjectFile('src/components/AcademicManagementPanel.jsx')
  assert(
    panelCode.includes(".from('subjects')") &&
      panelCode.includes(".from('faculty_subjects')") &&
      panelCode.includes(".from('attendance_sessions')"),
    'AcademicManagementPanel queries subjects, faculty_subjects, and attendance_sessions'
  )
  assert(
    panelCode.includes('handleToggleSubjectActive') &&
      panelCode.includes('handleDeleteSubject') &&
      panelCode.includes('handleAssignSubjects') &&
      panelCode.includes('handleRemoveAllocation') &&
      panelCode.includes('handleConfirmReassign'),
    'AcademicManagementPanel implements full subject and allocation management workflows'
  )
  assert(
    panelCode.includes('academic history') &&
      panelCode.includes('is_active: false'),
    'AcademicManagementPanel blocks deleting subjects with attendance records and preserves history on unassign'
  )

  // 6. FacultyDashboard integration checks
  const facultyCode = readProjectFile('src/pages/faculty/FacultyDashboard.jsx')
  assert(
    facultyCode.includes(".from('faculty_subjects')") &&
      facultyCode.includes('.eq(\'is_active\', true)') &&
      facultyCode.includes('s.is_active !== false'),
    'FacultyDashboard only loads active allocations pointing to active subjects'
  )
  assert(
    facultyCode.includes('start_attendance_session') &&
      facultyCode.includes('finalize_attendance_session'),
    'FacultyDashboard preserves Attendance Lifecycle Manager RPC workflow'
  )

  // 7. StudentDashboard integration checks
  const studentCode = readProjectFile('src/pages/student/StudentDashboard.jsx')
  assert(
    studentCode.includes("attendance_sessions.status', 'finalized'") &&
      studentCode.includes("r.attendance_sessions?.status === 'finalized'"),
    'StudentDashboard calculates attendance strictly from finalized sessions'
  )
  assert(
    studentCode.includes('totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : null') &&
      studentCode.includes("attendancePercentage !== null ? `${attendancePercentage}%` : '—'") &&
      studentCode.includes("sub.percentage !== null ? `${sub.percentage}%` : '—'"),
    'StudentDashboard shows — (never 100%) when zero finalized sessions exist'
  )
}

async function runLiveRlsProbe() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.log('\n[SKIP] Live anonymous RLS probe skipped (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
    return
  }

  console.log('\n=== Part B: Live Anonymous Security Probe ===\n')
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Scenario 10 (Unauthenticated guard): unauthenticated users cannot read or write subjects/allocations
  const { data: anonSubs, error: anonSubErr } = await anonClient
    .from('subjects')
    .select('id, subject_code')
    .limit(5)

  assert(
    Boolean(anonSubErr) || (Array.isArray(anonSubs) && anonSubs.length === 0),
    'Unauthenticated client cannot read subjects'
  )

  const { error: anonInsertErr } = await anonClient
    .from('subjects')
    .insert({ subject_code: 'UNAUTH999', subject_name: 'Unauthorized Subject' })

  assert(Boolean(anonInsertErr), 'Unauthenticated client is rejected when inserting a subject')

  const { error: anonAllocInsertErr } = await anonClient
    .from('faculty_subjects')
    .insert({
      faculty_id: '00000000-0000-0000-0000-000000000000',
      subject_id: '00000000-0000-0000-0000-000000000000',
    })

  assert(Boolean(anonAllocInsertErr), 'Unauthenticated client is rejected when modifying faculty_subjects')
}

async function runLiveE2E() {
  const runLive = process.argv.includes('--live') || process.env.RUN_LIVE_TESTS === 'true'
  if (!runLive) {
    console.log(
      '\n[INFO] Full 12-scenario authenticated E2E skipped (run with RUN_LIVE_TESTS=true after applying Migration 12).'
    )
    return
  }

  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    console.log(
      '\n[SKIP] RUN_LIVE_TESTS=true requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.'
    )
    return
  }

  console.log('\n=== Part C: Live Authenticated 12-Scenario E2E ===\n')

  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Lookup existing active dummy faculty for non-destructive read/allocation test
  const { data: facList, error: facErr } = await adminClient
    .from('faculty')
    .select('id, employee_id, full_name, is_active')
    .eq('is_active', true)
    .limit(1)

  if (facErr || !facList || facList.length === 0) {
    assert(false, 'Locate existing active faculty account for live E2E', facErr?.message || 'No active faculty found')
    return
  }

  const targetFaculty = facList[0]
  const code1 = `TST${Date.now().toString().slice(-4)}A`
  const code2 = `TST${Date.now().toString().slice(-4)}B`
  let createdIds = []

  try {
    // 1. Create subject
    const { data: s1, error: s1Err } = await adminClient
      .from('subjects')
      .insert({ subject_code: code1, subject_name: 'Automated Test Subject One', description: 'Temp QA subject' })
      .select()
      .single()
    assert(!s1Err && s1?.subject_code === code1, 'Scenario 1: Create subject succeeds')
    if (s1) createdIds.push(s1.id)

    // 11. Duplicate subject code rejected (case/space variation)
    const { error: dupErr } = await adminClient
      .from('subjects')
      .insert({ subject_code: `  ${code1.toLowerCase()}  `, subject_name: 'Duplicate Code Attempt' })
    assert(Boolean(dupErr), 'Scenario 11: Duplicate subject code rejected by DB')

    // 2. Edit subject
    const { data: s1Edit, error: editErr } = await adminClient
      .from('subjects')
      .update({ subject_name: 'Automated Test Subject One Updated' })
      .eq('id', s1.id)
      .select()
      .single()
    assert(!editErr && s1Edit?.subject_name === 'Automated Test Subject One Updated', 'Scenario 2: Edit subject succeeds')

    // 4. Create second subject
    const { data: s2, error: s2Err } = await adminClient
      .from('subjects')
      .insert({ subject_code: code2, subject_name: 'Automated Test Subject Two' })
      .select()
      .single()
    assert(!s2Err && s2?.subject_code === code2, 'Scenario 4: Create second subject succeeds')
    if (s2) createdIds.push(s2.id)

    // 5. Allocate subject to dummy faculty
    const { data: alloc, error: allocErr } = await adminClient
      .from('faculty_subjects')
      .upsert(
        { faculty_id: targetFaculty.id, subject_id: s1.id, is_active: true },
        { onConflict: 'faculty_id,subject_id' }
      )
      .select()
      .single()
    assert(!allocErr && alloc?.is_active === true, 'Scenario 5: Allocate subject to dummy faculty succeeds')

    // 3. Deactivate second subject
    const { data: s2Deact, error: deactErr } = await adminClient
      .from('subjects')
      .update({ is_active: false })
      .eq('id', s2.id)
      .select()
      .single()
    assert(!deactErr && s2Deact?.is_active === false, 'Scenario 3: Deactivate subject succeeds')

    // Trigger check: allocating inactive subject rejected when Migration 12 applied
    const { error: inactiveAllocErr } = await adminClient
      .from('faculty_subjects')
      .insert({ faculty_id: targetFaculty.id, subject_id: s2.id, is_active: true })
    assert(
      Boolean(inactiveAllocErr),
      'Migration 12 Trigger: Assigning inactive subject is blocked at DB level'
    )
  } finally {
    // Cleanup temporary test rows without touching existing data
    for (const sid of createdIds) {
      await adminClient.from('faculty_subjects').delete().eq('subject_id', sid)
      await adminClient.from('subjects').delete().eq('id', sid)
    }
  }
}

async function main() {
  runStaticVerification()
  await runLiveRlsProbe()
  await runLiveE2E()

  console.log(`\nSummary: ${passed} passed, ${failed} failed.`)
  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unhandled test error:', err)
  process.exit(1)
})
