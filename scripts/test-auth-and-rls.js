/**
 * Classroom Connect - Phase 2.1 & Revision Verification Suite
 *
 * Verifies:
 * 1. Migration 7 integrity & security hardening SQL assertions
 * 2. Migration 8 Login ID authentication & resolution RPC assertions
 * 3. Supabase client configuration & credentials protection (zero service role leaks)
 * 4. AuthContext Login ID resolution, inactive account protection, & updatePassword
 * 5. Role-based routing configuration
 * 6. Edge Function security, service-role isolation, and Login ID provisioning
 * 7. ChangePasswordModal component & self-service password update
 * 8. Production build artifacts and code splitting
 * 9. Security Hardening Audit Findings (SEC-01 to SEC-05)
 * 10. Migration 10 Canonical ADMIN001 Identity Resolution
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

let totalTests = 0
let passedTests = 0

function assert(condition, message) {
  totalTests++
  if (condition) {
    console.log(`  ✓ ${message}`)
    passedTests++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
  }
}

console.log('\n======================================================')
console.log('CLASSROOM CONNECT — PHASE 2.1 & REVISION TEST SUITE')
console.log('======================================================\n')

// 1. Verify Migration 7 exists and contains all required hardening rules
console.log('Test Group 1: Database Hardening & Migration 7 Verification')
const mig7Path = path.join(rootDir, 'supabase', 'migrations', '20261109150000_auth_provisioning_and_hardening.sql')
assert(fs.existsSync(mig7Path), 'Migration 7 file exists with valid timestamp')

if (fs.existsSync(mig7Path)) {
  const sql = fs.readFileSync(mig7Path, 'utf8')
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.institution_settings'), 'Institution settings table defined with configurable metadata')
  assert(sql.includes('public.handle_new_auth_user()'), 'Auth-to-profile provisioning trigger handle_new_auth_user() defined')
  assert(sql.includes('CREATE TRIGGER on_auth_user_created'), 'on_auth_user_created trigger bound to auth.users AFTER INSERT')
  assert(sql.includes('DROP POLICY IF EXISTS faculty_update_attendance_records'), 'Old faculty attendance update policy dropped')
  assert(sql.includes('marked_by = (SELECT auth.uid())'), 'Faculty update policy enforces marked_by = auth.uid()')
  assert(sql.includes('st.is_active = TRUE'), 'Faculty update policy restricts operations to active students only')
  assert(sql.includes('missing_students_count > 0'), 'Finalize attendance validates against missing active students from classroom roster')
  assert(sql.includes('inactive_records_count > 0'), 'Finalize attendance rejects sessions with marked inactive students')
  assert(sql.includes('admin_set_user_active'), 'Admin RPC defined for activating/deactivating accounts')
}

// 2. Verify Migration 8 exists for Login ID authentication
console.log('\nTest Group 2: Migration 8 — College Login ID Authentication')
const mig8Path = path.join(rootDir, 'supabase', 'migrations', '20261109160000_login_id_auth.sql')
assert(fs.existsSync(mig8Path), 'Migration 8 file exists with valid timestamp')

if (fs.existsSync(mig8Path)) {
  const sql8 = fs.readFileSync(mig8Path, 'utf8')
  assert(sql8.includes('ALTER TABLE public.profiles\nADD COLUMN IF NOT EXISTS login_id TEXT') || sql8.includes('ADD COLUMN IF NOT EXISTS login_id TEXT'), 'Migration 8 adds login_id column to public.profiles')
  assert(sql8.includes('unique_profile_login_id'), 'Migration 8 creates unique constraint on profiles(login_id)')
  assert(sql8.includes('resolve_login_id_to_auth_email'), 'Migration 8 defines resolve_login_id_to_auth_email RPC')
  assert(sql8.includes('GRANT EXECUTE ON FUNCTION public.resolve_login_id_to_auth_email(TEXT) TO anon'), 'resolve_login_id_to_auth_email RPC granted to anon & authenticated')
  assert(sql8.includes('target_login_id'), 'handle_new_auth_user() trigger registers college Login ID on creation')
  assert(sql8.includes('roll_number = s.roll_number') || sql8.includes('login_id = s.roll_number'), 'Migration 8 backfills student login IDs from roll_number')
  assert(sql8.includes('employee_id = f.employee_id') || sql8.includes('login_id = f.employee_id'), 'Migration 8 backfills faculty login IDs from employee_id')
}

// 3. Verify Config.toml public signups disabled
console.log('\nTest Group 3: Public Registration & Cloud Configuration')
const configPath = path.join(rootDir, 'supabase', 'config.toml')
if (fs.existsSync(configPath)) {
  const configToml = fs.readFileSync(configPath, 'utf8')
  assert(configToml.includes('enable_signup = false'), 'Public signups disabled in config.toml (enable_signup = false)')
}

// 4. Verify Edge Function & CLI for Server-Side Login ID Provisioning
console.log('\nTest Group 4: Server-side Account Provisioning Security')
const funcPath = path.join(rootDir, 'supabase', 'functions', 'provision-user', 'index.js')
assert(fs.existsSync(funcPath), 'Provision-user Edge Function exists')

if (fs.existsSync(funcPath)) {
  const funcCode = fs.readFileSync(funcPath, 'utf8')
  assert(funcCode.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Edge function uses SUPABASE_SERVICE_ROLE_KEY server-side')
  assert(funcCode.includes("callerProfile.role !== 'admin'"), 'Edge function strictly enforces active administrator authorization')
  assert(funcCode.includes('cleanLoginId'), 'Edge function validates and normalizes college Login ID')
  assert(funcCode.includes('auth.admin.createUser'), 'Edge function provisions user via Supabase Auth Admin API')
}

const cliPath = path.join(rootDir, 'scripts', 'provision-user.js')
assert(fs.existsSync(cliPath), 'CLI server provisioning tool exists in scripts/provision-user.js')
if (fs.existsSync(cliPath)) {
  const cliCode = fs.readFileSync(cliPath, 'utf8')
  assert(cliCode.includes('loginId'), 'CLI provisioning script supports Login ID syntax')
}

// 5. Verify Browser Code Protection (Zero Service-Role Exposure)
console.log('\nTest Group 5: Browser Bundle Credential Safety')
const srcDir = path.join(rootDir, 'src')
function scanDir(dir) {
  let files = []
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item)
    if (fs.statSync(full).isDirectory()) {
      files = files.concat(scanDir(full))
    } else if (item.endsWith('.js') || item.endsWith('.jsx')) {
      files.push(full)
    }
  }
  return files
}

const srcFiles = scanDir(srcDir)
let leakFound = false
for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf8')
  if (content.includes('SERVICE_ROLE') || content.includes('service_role_key')) {
    leakFound = true
    console.error(`Leak detected in ${file}!`)
  }
}
assert(!leakFound, 'Zero service_role keys or privileged credentials in client browser codebase')

// 6. Verify Frontend Authentication, Login ID, & Password Change
console.log('\nTest Group 6: Frontend Login ID Authentication & Password Management')
const loginPageCode = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'LoginPage.jsx'), 'utf8')
assert(loginPageCode.includes('College Login ID'), 'Login page presents College Login ID input')
assert(loginPageCode.includes('FAC001') && loginPageCode.includes('ADMIN001') && loginPageCode.includes('STU001'), 'Login page provides quick-select test Login IDs')
assert(!loginPageCode.includes('College Email ID'), 'Login page removes external college email ID requirement')

const authContextCode = fs.readFileSync(path.join(rootDir, 'src', 'context', 'AuthContext.jsx'), 'utf8')
assert(authContextCode.includes('resolve_login_id_to_auth_email'), 'AuthContext resolves Login ID using resolve_login_id_to_auth_email RPC')
assert(authContextCode.includes('updatePassword'), 'AuthContext exposes updatePassword self-service method')
assert(authContextCode.includes('data.is_active === false'), 'AuthContext checks is_active and prevents inactive account access')
assert(authContextCode.includes('supabase.auth.signOut()'), 'AuthContext forces signOut on inactive accounts')
assert(authContextCode.includes('supabase.auth.onAuthStateChange'), 'AuthContext maintains real-time persistent sessions via onAuthStateChange')

const changePassModalPath = path.join(rootDir, 'src', 'components', 'ChangePasswordModal.jsx')
assert(fs.existsSync(changePassModalPath), 'ChangePasswordModal component created')
const navbarCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'Navbar.jsx'), 'utf8')
assert(navbarCode.includes('ChangePasswordModal'), 'Navbar integrates ChangePasswordModal')
assert(navbarCode.includes('profile.login_id'), 'Navbar displays user College Login ID badge')

// 7. Verify Role-Based Protected Routes
console.log('\nTest Group 7: Role-Based Routing & Dashboard Shells')
const appCode = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8')
assert(appCode.includes("path=\"/admin/*\""), 'Protected /admin/* route configured')
assert(appCode.includes("path=\"/faculty/*\""), 'Protected /faculty/* route configured')
assert(appCode.includes("path=\"/student/*\""), 'Protected /student/* route configured')
assert(appCode.includes("path=\"/login\""), 'Public /login route configured')
assert(appCode.includes("path=\"/unauthorized\""), '403 Unauthorized route configured')

// 8. Verify Production Build Artifacts
console.log('\nTest Group 8: Production Build Artifacts')
assert(fs.existsSync(path.join(rootDir, 'dist', 'index.html')), 'Production build dist/index.html generated')
const distAssets = fs.existsSync(path.join(rootDir, 'dist', 'assets')) ? fs.readdirSync(path.join(rootDir, 'dist', 'assets')) : []
assert(distAssets.some(f => f.startsWith('AdminDashboard')), 'AdminDashboard split chunk generated in dist')
assert(distAssets.some(f => f.startsWith('FacultyDashboard')), 'FacultyDashboard split chunk generated in dist')
assert(distAssets.some(f => f.startsWith('StudentDashboard')), 'StudentDashboard split chunk generated in dist')

// 9. Verify Security Hardening Audit Findings (SEC-01 through SEC-05)
console.log('\nTest Group 9: Security Hardening Findings (SEC-01 to SEC-05)')

// SEC-01 & SEC-03: Migration 9 verification
const mig9Path = path.join(rootDir, 'supabase', 'migrations', '20261109170000_security_hardening.sql')
assert(fs.existsSync(mig9Path), 'SEC-01/03: Migration 9 security hardening file exists')
if (fs.existsSync(mig9Path)) {
  const sql9 = fs.readFileSync(mig9Path, 'utf8')
  // SEC-01: Information exposure prevention
  assert(!sql9.includes('SELECT s.email INTO target_email FROM public.students s WHERE'), 'SEC-01: Roster students email is not exposed without linked active profile')
  assert(!sql9.includes('SELECT f.email INTO target_email FROM public.faculty f WHERE'), 'SEC-01: Roster faculty email is not exposed without linked active profile')
  assert(sql9.includes('JOIN public.profiles p ON p.id = s.profile_id'), 'SEC-01: Student resolution strictly joins profiles table')
  assert(sql9.includes('JOIN public.profiles p ON p.id = f.profile_id'), 'SEC-01: Faculty resolution strictly joins profiles table')
  assert(sql9.includes("SET search_path = ''"), 'SEC-01: SECURITY DEFINER with empty search_path enforced on resolve function')

  // SEC-02: Seed account compatibility
  assert(sql9.includes("clean_id = 'ADMIN001' THEN") && sql9.includes("'admin@classroom.local'"), 'SEC-02: Seed mapping for ADMIN001 preserved in PostgreSQL RPC')
  assert(sql9.includes("clean_id = 'FAC001' THEN") && sql9.includes("'faculty@classroom.local'"), 'SEC-02: Seed mapping for FAC001 preserved in PostgreSQL RPC')
  assert(sql9.includes("clean_id = 'STU001' THEN") && sql9.includes("'student@classroom.local'"), 'SEC-02: Seed mapping for STU001 preserved in PostgreSQL RPC')

  // SEC-03: PostgreSQL check constraints & normalization
  assert(sql9.includes('UPDATE public.profiles') && sql9.includes('SET login_id = UPPER(TRIM(login_id))'), 'SEC-03: Normalizes existing records in profiles table before constraint')
  assert(sql9.includes('check_login_id_format'), 'SEC-03: Adds check_login_id_format CHECK constraint on profiles table')
  assert(sql9.includes("login_id = UPPER(TRIM(login_id))"), 'SEC-03: Enforces uppercase trimmed login_id in CHECK constraint')
  assert(sql9.includes("idx_unique_profiles_login_id"), 'SEC-03: Enforces unique index idx_unique_profiles_login_id')
}

// SEC-02 & SEC-04: AuthContext & ChangePasswordModal verification
assert(authContextCode.includes('SEED_ACCOUNT_MAP') && authContextCode.includes('ADMIN001'), 'SEC-02: AuthContext maintains controlled SEED_ACCOUNT_MAP')
assert(authContextCode.includes("ADMIN001: 'admin001@classroom.local'"), 'AuthContext SEED_ACCOUNT_MAP maps ADMIN001 to canonical admin001@classroom.local')
assert(!authContextCode.includes("ADMIN001: 'admin@classroom.local'"), 'AuthContext removes obsolete ADMIN001 mapping to admin@classroom.local')
assert(authContextCode.includes('currentPassword'), 'SEC-04: AuthContext updatePassword requires currentPassword')
assert(authContextCode.includes('supabase.auth.signInWithPassword'), 'SEC-04: AuthContext updatePassword re-authenticates current credentials before update')
assert(authContextCode.includes('currentPassword === newPassword'), 'SEC-04: AuthContext rejects identical current and new passwords')

const modalCode = fs.readFileSync(changePassModalPath, 'utf8')
assert(modalCode.includes('currentPassword'), 'SEC-04: ChangePasswordModal contains currentPassword input')
assert(modalCode.includes('showCurrentPass'), 'SEC-04: ChangePasswordModal supports current password visibility toggle')
assert(modalCode.includes('Re-authentication required'), 'SEC-04: ChangePasswordModal conveys re-authentication security guarantee')

// SEC-05: Edge Function CORS configuration
if (fs.existsSync(funcPath)) {
  const funcCode = fs.readFileSync(funcPath, 'utf8')
  assert(!funcCode.includes("'Access-Control-Allow-Origin': '*'"), 'SEC-05: Wildcard Access-Control-Allow-Origin is removed from Edge Function')
  assert(funcCode.includes('ALLOWED_ORIGINS'), 'SEC-05: Edge Function supports configurable ALLOWED_ORIGINS environment variable')
  assert(funcCode.includes('DEFAULT_ALLOWED_ORIGINS'), 'SEC-05: Edge Function retains local development origins by default')
  assert(funcCode.includes('403') && funcCode.includes('not authorized by CORS policy'), 'SEC-05: Edge Function rejects unauthorized browser origins with HTTP 403')
  assert(funcCode.includes("'Vary': 'Origin'"), 'SEC-05: Edge Function sets Vary: Origin on dynamic CORS responses')
}

// 10. Verify Migration 10: Canonical ADMIN001 Identity Resolution
console.log('\nTest Group 10: Migration 10 — Canonical ADMIN001 Identity Resolution')
const mig10Path = path.join(rootDir, 'supabase', 'migrations', '20261110160000_canonical_admin_login_id.sql')
assert(fs.existsSync(mig10Path), 'Migration 10 file exists with valid timestamp')

if (fs.existsSync(mig10Path)) {
  const sql10 = fs.readFileSync(mig10Path, 'utf8')
  assert(sql10.includes('CREATE OR REPLACE FUNCTION public.resolve_login_id_to_auth_email'), 'Migration 10 safely updates resolve_login_id_to_auth_email RPC')
  assert(sql10.includes("clean_id = 'ADMIN001' THEN") && sql10.includes("'admin001@classroom.local'"), 'Migration 10 maps ADMIN001 to canonical email admin001@classroom.local')
  assert(!sql10.includes("'admin@classroom.local'"), 'Migration 10 removes obsolete alias admin@classroom.local')
  assert(sql10.includes('WHERE login_id = clean_id') && sql10.includes('is_active = TRUE'), 'Migration 10 resolves login_id against active profiles first')
  assert(sql10.includes('SECURITY DEFINER') && sql10.includes("SET search_path = ''"), 'Migration 10 preserves SECURITY DEFINER and empty search_path')
  assert(sql10.includes('JOIN public.profiles p ON p.id = s.profile_id'), 'Migration 10 preserves safe student profile join')
  assert(sql10.includes('JOIN public.profiles p ON p.id = f.profile_id'), 'Migration 10 preserves safe faculty profile join')
  assert(sql10.includes('GRANT EXECUTE ON FUNCTION public.resolve_login_id_to_auth_email(TEXT) TO anon, authenticated, service_role'), 'Migration 10 preserves execution permissions for anon, authenticated, and service_role')
}

console.log('\n------------------------------------------------------')
console.log(`Results: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`)
console.log('------------------------------------------------------\n')

if (passedTests === totalTests) {
  console.log('ALL PHASE 2.1 REVISION TESTS PASSED SUCCESSFULLY!\n')
  process.exit(0)
} else {
  console.error('SOME ASSERTIONS FAILED.\n')
  process.exit(1)
}
