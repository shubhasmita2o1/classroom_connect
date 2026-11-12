import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// SEC-02: Explicit controlled seed account mapping for local and pre-migration consistency
const SEED_ACCOUNT_MAP = {
  ADMIN001: 'admin001@classroom.local',
  FAC001: 'faculty@classroom.local',
  STU001: 'student@classroom.local',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch authenticated user profile from database
  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error: profileErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_active, login_id, created_at')
        .eq('id', userId)
        .single()

      if (profileErr) {
        console.error('Error fetching profile:', profileErr.message)
        setError('Unable to load user profile. Please contact the administrator.')
        return { success: false, error: profileErr.message }
      }

      if (!data) {
        setError('No profile record linked to this account.')
        return { success: false, notFound: true }
      }

      // Check account active status
      if (data.is_active === false) {
        await supabase.auth.signOut()
        setUser(null)
        setSession(null)
        setProfile(null)
        setRole(null)
        const inactiveMsg = 'This account has been deactivated. Please contact your college administrator.'
        setError(inactiveMsg)
        return { success: false, inactive: true, error: inactiveMsg }
      }

      // Ensure login_id has a value (fallback to prefix of email)
      const enrichedProfile = {
        ...data,
        login_id: data.login_id || data.email?.split('@')[0]?.toUpperCase() || 'USER',
      }

      setProfile(enrichedProfile)
      setRole(enrichedProfile.role)
      setError(null)
      return { success: true, profile: enrichedProfile }
    } catch (err) {
      console.error('Unexpected error in fetchProfile:', err)
      const msg = err instanceof Error ? err.message : 'Unexpected profile error'
      setError(msg)
      return { success: false, error: msg }
    }
  }, [])

  // Initial session restoration & auth state listener
  useEffect(() => {
    let mounted = true

    async function initAuth() {
      try {
        const { data, error: sessionErr } = await supabase.auth.getSession()

        if (sessionErr) {
          console.error('Session restoration error:', sessionErr.message)
        }

        if (mounted && data?.session?.user) {
          setSession(data.session)
          setUser(data.session.user)
          await fetchProfile(data.session.user.id)
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (currentSession?.user) {
          setSession(currentSession)
          setUser(currentSession.user)
          await fetchProfile(currentSession.user.id)
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null)
        setUser(null)
        setProfile(null)
        setRole(null)
      } else if (event === 'USER_UPDATED') {
        if (currentSession?.user) {
          await fetchProfile(currentSession.user.id)
        }
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  // Sign In using College Login ID (e.g. ADMIN001, FAC001, STU001)
  const signIn = async (loginId, password) => {
    setError(null)
    try {
      const rawId = loginId?.trim()
      if (!rawId) {
        const msg = 'Please enter your college Login ID.'
        setError(msg)
        return { success: false, error: msg }
      }

      const cleanLoginId = rawId.toUpperCase()

      // SEC-02: Check explicit seed map first, default to synthetic identity
      let authEmail = SEED_ACCOUNT_MAP[cleanLoginId] || `${cleanLoginId.toLowerCase()}@classroom.local`

      // SEC-01 & SEC-02: Query hardened database resolution RPC
      try {
        const { data: resolvedEmail, error: rpcErr } = await supabase.rpc(
          'resolve_login_id_to_auth_email',
          { p_login_id: cleanLoginId }
        )
        if (!rpcErr && resolvedEmail) {
          authEmail = resolvedEmail
        }
      } catch {
        // Fall back to seed map or synthetic identity if database RPC is unavailable
      }

      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      })

      if (signInErr) {
        const userMsg =
          signInErr.message.includes('Invalid login credentials')
            ? `Invalid credentials for Login ID "${cleanLoginId}". Check your ID and password.`
            : signInErr.message
        setError(userMsg)
        return { success: false, error: userMsg }
      }

      if (!data.user) {
        const msg = 'Authentication failed: No user returned.'
        setError(msg)
        return { success: false, error: msg }
      }

      setUser(data.user)
      setSession(data.session)

      const profileRes = await fetchProfile(data.user.id)
      if (!profileRes.success) {
        return profileRes
      }

      return {
        success: true,
        user: data.user,
        role: profileRes.profile.role,
        profile: profileRes.profile,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed'
      setError(msg)
      return { success: false, error: msg }
    }
  }

  // SEC-04: Re-authenticating Password Change
  const updatePassword = async (currentPassword, newPassword) => {
    if (!currentPassword) {
      return {
        success: false,
        error: 'Current password is required to verify identity.',
      }
    }

    if (!newPassword || newPassword.length < 8) {
      return {
        success: false,
        error: 'New password must be at least 8 characters long.',
      }
    }

    if (currentPassword === newPassword) {
      return {
        success: false,
        error: 'New password must be different from your current password.',
      }
    }

    try {
      const userEmail = user?.email
      if (!userEmail) {
        return {
          success: false,
          error: 'No active user session found to re-authenticate.',
        }
      }

      // 1. Re-authenticate caller with current password
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      })

      if (reauthErr) {
        return {
          success: false,
          error: 'Current password is incorrect. Please re-enter your existing password.',
        }
      }

      // 2. Perform password update after verified re-authentication
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateErr) {
        return { success: false, error: updateErr.message }
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update password',
      }
    }
  }

  // Sign Out
  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out error:', err)
    } finally {
      setUser(null)
      setSession(null)
      setProfile(null)
      setRole(null)
      setError(null)
    }
  }

  // Clear errors manually if needed
  const clearError = () => setError(null)

  const value = {
    user,
    session,
    profile,
    role,
    loading,
    error,
    signIn,
    signOut,
    updatePassword,
    fetchProfile,
    clearError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
