/**
 * Classroom Connect - Admin Account Provisioning Script (CLI / Server-side)
 * 
 * Usage:
 *   1. Secure (Prompted or Env Var):
 *      node scripts/provision-user.js <loginId> <fullName> <role> [rollNumberOrEmpId]
 *      (Password will be prompted securely with hidden input, or read from ADMIN_PASSWORD env var)
 * 
 *   2. CLI Argument:
 *      node scripts/provision-user.js <loginId> <password> <fullName> <role> [rollNumberOrEmpId]
 * 
 * Examples:
 *   node scripts/provision-user.js ADMIN001 "Classroom Administrator" admin
 *   node scripts/provision-user.js FAC002 "Dr. Smith" faculty
 *   node scripts/provision-user.js STU002 "Alice Brown" student
 * 
 * Security:
 *   - Requires SUPABASE_SERVICE_ROLE_KEY set in process.env or .env.local
 *   - NEVER expose service role keys in client browser bundles or commit them to git.
 *   - Never logs or stores passwords in command output.
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const envFiles = ['.env.local', '.env']
  const env = {}
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file)
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          const val = trimmed.slice(eqIdx + 1).trim()
          if (!env[key]) env[key] = val
        }
      }
    }
  }
  return env
}

function promptPassword(promptText = 'Enter password for account (input hidden): ') {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question(promptText, (answer) => {
        rl.close()
        resolve(answer.trim())
      })
      return
    }

    process.stdout.write(promptText)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    let password = ''
    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(password)
      } else if (char === '\u0003') { // Ctrl+C
        process.stdout.write('\n')
        process.exit(1)
      } else if (char === '\u0008' || char === '\x7f') { // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1)
        }
      } else {
        password += char
      }
    }
    process.stdin.on('data', onData)
  })
}

async function provisionUser() {
  const env = loadEnv()
  const supabaseUrl = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error('Error: Missing SUPABASE_URL / VITE_SUPABASE_URL.')  
    process.exit(1)
  }

  if (!serviceRoleKey) {
    console.error('Error: Missing SUPABASE_SERVICE_ROLE_KEY. Server-side service-role key required for provisioning.')
    console.error('Provide SUPABASE_SERVICE_ROLE_KEY via environment variable or .env.local.')
    process.exit(1)
  }

  const rawArgs = process.argv.slice(2)
  const validRoles = ['admin', 'faculty', 'student']

  let loginId, password, fullName, role, extraId

  if (rawArgs.length >= 3 && validRoles.includes(rawArgs[2].toLowerCase())) {
    // Mode A: Password supplied via env var or interactive hidden prompt
    // Syntax: <loginId> <fullName> <role> [extraId]
    loginId = rawArgs[0].trim().toUpperCase()
    fullName = rawArgs[1].trim()
    role = rawArgs[2].trim().toLowerCase()
    extraId = rawArgs[3]?.trim()
    password = process.env.ADMIN_PASSWORD || process.env.BOOTSTRAP_PASSWORD
    if (!password) {
      password = await promptPassword(`Enter password for ${loginId} (min 8 chars, hidden): `)
    }
  } else if (rawArgs.length >= 4 && validRoles.includes(rawArgs[3].toLowerCase())) {
    // Mode B: Traditional CLI syntax
    // Syntax: <loginId> <password> <fullName> <role> [extraId]
    loginId = rawArgs[0].trim().toUpperCase()
    password = rawArgs[1]
    fullName = rawArgs[2].trim()
    role = rawArgs[3].trim().toLowerCase()
    extraId = rawArgs[4]?.trim()
  } else {
    console.log('\nUsage:')
    console.log('  Secure Mode (Hidden Password Prompt or ADMIN_PASSWORD env):')
    console.log('    node scripts/provision-user.js <loginId> <fullName> <role> [rollNumberOrEmpId]')
    console.log('\n  CLI Argument Mode:')
    console.log('    node scripts/provision-user.js <loginId> <password> <fullName> <role> [rollNumberOrEmpId]')
    console.log('\nRoles: admin | faculty | student')
    console.log('Example: node scripts/provision-user.js ADMIN001 "Classroom Administrator" admin\n')
    process.exit(1)
  }

  if (!password || password.length < 8) {
    console.error('Error: Password must be at least 8 characters long.')
    process.exit(1)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  console.log(`Checking existing records for Login ID "${loginId}"...`)

  // Check if profile already exists
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id, login_id, role, full_name')
    .eq('login_id', loginId)
    .maybeSingle()

  if (existingProfile) {
    console.log(`Account with Login ID "${loginId}" already exists in profiles (ID: ${existingProfile.id}, Role: ${existingProfile.role}).`)
    process.exit(0)
  }

  console.log(`Provisioning ${role} account for Login ID ${loginId}...`)

  const authEmail = `${loginId.toLowerCase()}@classroom.local`
  const userMetadata = {
    role,
    full_name: fullName,
    login_id: loginId,
    admin_provisioned: true,
  }

  if (role === 'student') {
    userMetadata.roll_number = extraId ? extraId.toUpperCase() : loginId
  } else if (role === 'faculty') {
    userMetadata.employee_id = extraId ? extraId.toUpperCase() : loginId
  }

  // 1. Create Auth User via Supabase Admin API
  const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
    app_metadata: { admin_provisioned: true },
  })

  if (createError) {
    console.error('Failed to create auth user:', createError.message)
    process.exit(1)
  }

  const userId = authData.user.id
  console.log(`Auth user created successfully (User ID: ${userId}).`)

  // 2. Verify or Ensure matching public.profiles record
  const { data: profileRecord, error: profileErr } = await adminClient
    .from('profiles')
    .select('id, full_name, email, role, is_active, login_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileRecord) {
    console.log('Verified: Matching public.profiles record created by database trigger.')
    console.log(`  - Role: ${profileRecord.role}`)
    console.log(`  - Login ID: ${profileRecord.login_id}`)
    console.log(`  - Active: ${profileRecord.is_active}`)
  } else {
    if (profileErr) {
      console.warn('Database query warning:', profileErr.message)
    }
    console.log('Database trigger did not automatically create profile. Upserting profile record directly...')
    const { error: upsertErr } = await adminClient.from('profiles').upsert({
      id: userId,
      full_name: fullName,
      email: authEmail,
      role,
      is_active: true,
      login_id: loginId,
    })

    if (upsertErr) {
      console.error('Error creating profile record:', upsertErr.message)
      process.exit(1)
    }
    console.log('Matching public.profiles record created successfully.')
  }

  console.log('\n======================================================')
  console.log('ACCOUNT BOOTSTRAP COMPLETE')
  console.log('======================================================')
  console.log('  User ID:             ', userId)
  console.log('  Login ID:            ', loginId)
  console.log('  Role:                ', role)
  console.log('  Display Name:        ', fullName)
  console.log('  Internal Auth Email: ', authEmail)
  console.log('======================================================\n')
}

provisionUser().catch((err) => {
  console.error('Unexpected error:', err.message || err)
  process.exit(1)
})
