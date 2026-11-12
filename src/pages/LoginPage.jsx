import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AlertBanner from '../components/AlertBanner'
import {
  GraduationCap,
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'

export default function LoginPage() {
  const { user, profile, role, signIn, error: authError, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState(location.state?.error || null)

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user && profile && role) {
      const from = location.state?.from?.pathname
      if (from && from !== '/login' && from !== '/unauthorized') {
        navigate(from, { replace: true })
      } else {
        navigate(`/${role}`, { replace: true })
      }
    }
  }, [user, profile, role, authLoading, navigate, location.state])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)

    const cleanId = loginId.trim().toUpperCase()

    if (!cleanId) {
      setLocalError('Please enter your college-issued Login ID (e.g. FAC001, STU001, ADMIN001).')
      return
    }

    if (!password) {
      setLocalError('Please enter your account password.')
      return
    }

    setSubmitting(true)
    const result = await signIn(cleanId, password)
    setSubmitting(false)

    if (result.success) {
      const targetRoute = location.state?.from?.pathname || `/${result.role}`
      navigate(targetRoute, { replace: true })
    } else {
      setLocalError(result.error || 'Authentication failed. Please verify your Login ID and password.')
    }
  }

  // Quick fill helper for institutional testing
  const handleQuickFill = (testId) => {
    setLoginId(testId)
    setLocalError(null)
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Left Column: Institutional Brand & Portal Information */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-12 lg:flex border-r border-slate-800">
        {/* Subtle decorative background rings */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />

        {/* Top Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/25">
            <GraduationCap className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Classroom Connect
            </h1>
            <p className="text-xs font-medium text-blue-300">
              Department of Computer Science & Engineering
            </p>
          </div>
        </div>

        {/* Hero Copy */}
        <div className="my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Authorized Institutional Portal</span>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl leading-tight">
            Single Classroom Attendance & Academic Notifications
          </h2>

          <p className="text-sm leading-relaxed text-slate-300">
            Sign in with your college-managed Login ID. No external email accounts or email verification
            required.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-800 text-[10px]">✓</span>
              <span>College Login ID access</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-800 text-[10px]">✓</span>
              <span>PostgreSQL RLS security</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-800 text-[10px]">✓</span>
              <span>Automated audit logging</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-800 text-[10px]">✓</span>
              <span>No public registration</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Classroom Connect. All rights reserved.</p>
          <p className="mt-0.5">Protected under institutional academic regulations.</p>
        </div>
      </div>

      {/* Right Column: Sign In Form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md space-y-6">
          {/* Mobile Brand Heading */}
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Classroom Connect</h1>
              <p className="text-xs text-slate-400">Academic Portal</p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Institutional Login
            </h2>
            <p className="mt-1.5 text-sm text-slate-400">
              Sign in with your college-issued Login ID and password.
            </p>
          </div>

          {/* Error Banner */}
          {(localError || authError) && (
            <AlertBanner
              type="error"
              message={localError || authError}
              onClose={() => setLocalError(null)}
            />
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Login ID Field */}
            <div>
              <label
                htmlFor="loginId"
                className="block text-xs font-medium uppercase tracking-wider text-slate-300"
              >
                College Login ID
              </label>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="loginId"
                  type="text"
                  autoComplete="username"
                  required
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value.toUpperCase())}
                  placeholder="e.g. ADMIN001, FAC001, STU001"
                  disabled={submitting}
                  className="block w-full rounded-lg border border-slate-700 bg-slate-900/90 py-2.5 pl-10 pr-3.5 text-sm font-mono uppercase tracking-wider text-slate-100 placeholder-slate-500 placeholder:normal-case placeholder:tracking-normal shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Admin: ADMIN001 • Faculty: FAC001 • Student: STU001
              </p>
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium uppercase tracking-wider text-slate-300"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={submitting}
                  className="block w-full rounded-lg border border-slate-700 bg-slate-900/90 py-2.5 pl-10 pr-10 text-sm text-slate-100 placeholder-slate-500 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign in to Portal</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Institutional No Self-Registration Notice */}
          <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3.5 text-xs text-amber-200/90">
            <div className="flex gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">
                  Strict Institutional Access
                </p>
                <p className="leading-relaxed text-amber-200/80">
                  Public self-registration is disabled. All accounts are managed and provisioned by the
                  college administration. Contact the academic office for credential assistance.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Fill Test Accounts */}
          <div className="border-t border-slate-800/80 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Quick Select Test Login IDs:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('FAC001')}
                className="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-mono text-emerald-300 hover:border-emerald-600 hover:text-white transition-colors"
              >
                FAC001 (Faculty)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('ADMIN001')}
                className="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-mono text-indigo-300 hover:border-indigo-600 hover:text-white transition-colors"
              >
                ADMIN001 (Admin)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('STU001')}
                className="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-mono text-sky-300 hover:border-sky-600 hover:text-white transition-colors"
              >
                STU001 (Student)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
