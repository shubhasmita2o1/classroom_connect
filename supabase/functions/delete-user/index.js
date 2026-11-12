import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SEC-05: Configurable CORS Allowed Origins (matches provision-user)
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function mapPreparationErrorStatus(message) {
  const lower = (message || '').toLowerCase()
  if (lower.includes('forbidden')) return 403
  if (lower.includes('not found') || lower.includes('already been deleted')) return 404
  if (lower.includes('last active administrator')) return 409
  if (lower.includes('deactivated') || lower.includes('self-deletion') || lower.includes('required')) return 400
  return 500
}

serve(async (req) => {
  const rawOrigin = req.headers.get('Origin')
  const reqOrigin = rawOrigin ? rawOrigin.trim().replace(/\/$/, '') : null
  const allowedOrigins = getAllowedOrigins()

  // Reject unauthorized browser origins
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
      return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)
    }

    // 2. Validate Environment Variables (Service Role Key stays strictly server-side)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse(
        { error: 'Server misconfiguration: missing Supabase credentials' },
        500,
        corsHeaders
      )
    }

    // 3. Verify Caller JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401, corsHeaders)
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: callerUser },
      error: authError,
    } = await callerClient.auth.getUser()

    if (authError || !callerUser) {
      return jsonResponse({ error: 'Unauthorized: Invalid or expired token' }, 401, corsHeaders)
    }

    // 4. Verify Caller is an Active Administrator
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: callerProfile, error: callerProfileErr } = await adminClient
      .from('profiles')
      .select('id, role, is_active, login_id')
      .eq('id', callerUser.id)
      .single()

    if (
      callerProfileErr ||
      !callerProfile ||
      callerProfile.role !== 'admin' ||
      callerProfile.is_active !== true
    ) {
      return jsonResponse(
        { error: 'Forbidden: Only active administrators can permanently delete accounts.' },
        403,
        corsHeaders
      )
    }

    // 5. Parse and Validate Request Body
    let body
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON request body.' }, 400, corsHeaders)
    }

    const { targetUserId, confirmLoginId } = body || {}

    if (!targetUserId || typeof targetUserId !== 'string' || !UUID_REGEX.test(targetUserId)) {
      return jsonResponse({ error: 'A valid targetUserId (UUID) is required.' }, 400, corsHeaders)
    }

    // 6. Prevent Self-Deletion
    if (targetUserId === callerUser.id) {
      return jsonResponse(
        { error: 'Self-deletion is not allowed. Administrators cannot delete their own account.' },
        400,
        corsHeaders
      )
    }

    // 7. Fetch & Validate Target Account State
    const { data: targetProfile, error: targetLookupErr } = await adminClient
      .from('profiles')
      .select('id, login_id, full_name, email, role, is_active')
      .eq('id', targetUserId)
      .maybeSingle()

    if (targetLookupErr) {
      return jsonResponse({ error: targetLookupErr.message }, 500, corsHeaders)
    }

    if (!targetProfile) {
      return jsonResponse(
        { error: 'Account not found or has already been deleted.' },
        404,
        corsHeaders
      )
    }

    const expectedLoginId =
      targetProfile.login_id || targetProfile.email?.split('@')[0]?.toUpperCase() || ''

    if (confirmLoginId !== undefined) {
      if (typeof confirmLoginId !== 'string' || confirmLoginId.trim() !== expectedLoginId) {
        return jsonResponse(
          { error: `Confirmation Login ID does not match "${expectedLoginId}".` },
          400,
          corsHeaders
        )
      }
    }

    if (targetProfile.is_active !== false) {
      return jsonResponse(
        { error: 'Only deactivated accounts can be permanently deleted. Please deactivate this account first.' },
        400,
        corsHeaders
      )
    }

    // 8. Prevent Deletion of the Last Active Administrator
    if (targetProfile.role === 'admin') {
      const { count: activeAdminCount, error: countErr } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true)
        .neq('id', targetUserId)

      if (countErr) {
        return jsonResponse({ error: countErr.message }, 500, corsHeaders)
      }

      if ((activeAdminCount ?? 0) < 1) {
        return jsonResponse(
          { error: 'Cannot delete the last active administrator.' },
          409,
          corsHeaders
        )
      }
    }

    // 9. Execute Transactional Database Preparation & Historical Data Preservation
    const { data: prepResult, error: prepError } = await adminClient.rpc(
      'admin_prepare_user_deletion',
      {
        p_target_user_id: targetUserId,
        p_caller_user_id: callerUser.id,
      }
    )

    if (prepError) {
      const status = mapPreparationErrorStatus(prepError.message)
      return jsonResponse({ error: prepError.message }, status, corsHeaders)
    }

    // 10. Delete Supabase Auth Identity (cascades to public.profiles)
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(targetUserId)

    if (deleteAuthError) {
      const isNotFound =
        deleteAuthError.status === 404 || /not found/i.test(deleteAuthError.message || '')

      if (!isNotFound) {
        return jsonResponse(
          { error: `Failed to remove authentication identity: ${deleteAuthError.message}` },
          500,
          corsHeaders
        )
      }
    }

    // Ensure profile row is removed if auth user was already absent
    const { error: cleanupProfileErr } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', targetUserId)

    if (cleanupProfileErr) {
      return jsonResponse(
        { error: `Auth identity removed, but failed to clean up profile: ${cleanupProfileErr.message}` },
        500,
        corsHeaders
      )
    }

    // 11. Record Immutable Deletion Audit Log
    const counts = prepResult?.counts || {}
    const rosterDisposition = prepResult?.rosterDisposition || 'none'
    const historicalRecordsPreserved = Boolean(prepResult?.historicalRecordsPreserved)

    const { error: auditErr } = await adminClient.from('account_deletion_logs').insert({
      deleted_user_id: targetUserId,
      login_id: expectedLoginId,
      full_name: targetProfile.full_name,
      role: targetProfile.role,
      roster_disposition: rosterDisposition,
      historical_records_preserved: historicalRecordsPreserved,
      performed_by: callerProfile.id,
      performed_by_login_id: callerProfile.login_id,
      details: {
        marked_records_unlinked: counts.markedRecords ?? 0,
        audit_logs_unlinked: counts.performedAudit ?? 0,
        notifications_unlinked: counts.notifications ?? 0,
        student_attendance_preserved: counts.studentAttendance ?? 0,
        student_audit_preserved: counts.studentAudit ?? 0,
        student_assignments_preserved: counts.studentAssignments ?? 0,
        faculty_sessions_preserved: counts.facultySessions ?? 0,
        faculty_assignments_preserved: counts.facultyAssignments ?? 0,
      },
    })

    if (auditErr) {
      console.error('Warning: Failed to write account_deletion_logs entry:', auditErr.message)
    }

    const historySuffix = historicalRecordsPreserved
      ? ' Historical academic, attendance, and audit records were preserved.'
      : ''

    return jsonResponse(
      {
        success: true,
        message: `Account ${expectedLoginId} (${targetProfile.full_name}) was permanently deleted.${historySuffix}`,
        deletedUser: {
          id: targetUserId,
          loginId: expectedLoginId,
          fullName: targetProfile.full_name,
          role: targetProfile.role,
        },
        dataIntegrity: {
          rosterDisposition,
          historicalRecordsPreserved,
          counts,
        },
      },
      200,
      corsHeaders
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return jsonResponse({ error: message }, 500, corsHeaders)
  }
})
