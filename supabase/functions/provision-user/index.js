import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SEC-05: Configurable CORS Allowed Origins
// Local development origins are allowed by default; production domains are configured
// via the ALLOWED_ORIGINS environment variable (comma-separated list).
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
]

function getAllowedOrigins() {
  const envOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean)

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins])
}

function getCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

serve(async (req) => {
  const rawOrigin = req.headers.get('Origin')
  const reqOrigin = rawOrigin ? rawOrigin.trim().replace(/\/$/, '') : null
  const allowedOrigins = getAllowedOrigins()

  // SEC-05: Reject unauthorized browser origins
  if (reqOrigin && !allowedOrigins.has(reqOrigin)) {
    return new Response(
      JSON.stringify({ error: `Origin '${rawOrigin}' is not authorized by CORS policy.` }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  const corsHeaders = getCorsHeaders(reqOrigin)

  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Validate Environment Variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration: missing Supabase credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Authenticate Caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: callerUser },
      error: authError,
    } = await callerClient.auth.getUser()

    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Verify Caller is an Active Admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', callerUser.id)
      .single()

    if (profileError || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only active administrators can provision accounts' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Parse and Validate Request Body
    const body = await req.json()
    const { loginId, password, fullName, role, rollNumber, employeeId } = body

    if (!loginId || !password || !fullName || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: loginId, password, fullName, role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanLoginId = loginId.trim().toUpperCase()
    // Validation: Login ID must be alphanumeric and 3-20 characters (e.g. ADMIN001, FAC001, STU001)
    if (!/^[A-Z0-9_-]{3,20}$/.test(cleanLoginId)) {
      return new Response(
        JSON.stringify({
          error: 'Login ID must be 3-20 alphanumeric characters (e.g. ADMIN001, FAC001, STU001)',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedRole = role.toLowerCase()
    if (!['admin', 'faculty', 'student'].includes(normalizedRole)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be admin, faculty, or student' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (typeof password !== 'string' || password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters long' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if Login ID is already assigned in profiles
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id, login_id')
      .eq('login_id', cleanLoginId)
      .maybeSingle()

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: `Login ID ${cleanLoginId} is already in use.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Map Login ID to Internal Synthetic Auth Email
    const authEmail = `${cleanLoginId.toLowerCase()}@classroom.local`
    const targetRoll = normalizedRole === 'student' ? (rollNumber ? rollNumber.trim().toUpperCase() : cleanLoginId) : undefined
    const targetEmpId = normalizedRole === 'faculty' ? (employeeId ? employeeId.trim().toUpperCase() : cleanLoginId) : undefined

    // Protect archived historical roster identifiers from accidental reuse
    if (normalizedRole === 'student' && targetRoll) {
      const { data: archivedStudent } = await adminClient
        .from('students')
        .select('id, roll_number')
        .eq('roll_number', targetRoll)
        .eq('is_archived', true)
        .maybeSingle()

      if (archivedStudent) {
        return new Response(
          JSON.stringify({
            error: `Roll Number ${targetRoll} belongs to an archived historical student record and cannot be reused.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (normalizedRole === 'faculty' && targetEmpId) {
      const { data: archivedFaculty } = await adminClient
        .from('faculty')
        .select('id, employee_id')
        .eq('employee_id', targetEmpId)
        .eq('is_archived', true)
        .maybeSingle()

      if (archivedFaculty) {
        return new Response(
          JSON.stringify({
            error: `Employee ID ${targetEmpId} belongs to an archived historical faculty record and cannot be reused.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 7. Create User via Supabase Admin API (Service Role)
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: normalizedRole,
        full_name: fullName.trim(),
        login_id: cleanLoginId,
        roll_number: targetRoll,
        employee_id: targetEmpId,
        admin_provisioned: true,
      },
      app_metadata: {
        admin_provisioned: true,
      },
    })

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Account for ${cleanLoginId} provisioned successfully with role ${normalizedRole}.`,
        user: {
          id: newUser.user?.id,
          loginId: cleanLoginId,
          role: normalizedRole,
          fullName: fullName.trim(),
        },
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
