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
    <div className="flex min-h-screen bg-[#F5F6F3] text-[#252B27]">
      {/* Left Column: Institutional Brand & Portal Information */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#145C3A] p-12 lg:flex border-r border-[#145C3A]/20 text-white">
        {/* Subtle decorative background curves */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-[#21845A]/30 blur-3xl" />

        {/* Top Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#145C3A] shadow-md">
            <GraduationCap className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Classroom Connect
            </h1>
            <p className="text-xs font-medium text-emerald-200">
              Department of Computer Science & Engineering
            </p>
          </div>
        </div>

        {/* Hero Copy */}
        <div className="my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-xs font-medium text-emerald-100 backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Authorized Institutional Portal</span>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl leading-tight">
            Single Classroom Attendance & Academic Notifications
          </h2>

          <p className="text-sm leading-relaxed text-emerald-100/90 font-normal">
            Sign in with your college-managed Login ID. No external email accounts or email verification
            required.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/15 text-xs text-emerald-100">
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#145C3A] font-bold text-[10px] shrink-0">✓</span>
              <span>College Login ID access</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#145C3A] font-bold text-[10px] shrink-0">✓</span>
              <span>PostgreSQL RLS security</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#145C3A] font-bold text-[10px] shrink-0">✓</span>
              <span>Automated audit logging</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#145C3A] font-bold text-[10px] shrink-0">✓</span>
              <span>No public registration</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-emerald-200/80">
          <p>© {new Date().getFullYear()} Classroom Connect. All rights reserved.</p>
          <p className="mt-0.5">Protected under institutional academic regulations.</p>
        </div>
      </div>

      {/* Right Column: Sign In Form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md space-y-6">
          {/* Mobile Brand Heading */}
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#145C3A] text-white shadow-md">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#252B27]">Classroom Connect</h1>
              <p className="text-xs text-[#78817B]">Academic Portal</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-6 sm:p-8 shadow-sm">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[#252B27]">
                Institutional Login
              </h2>
              <p className="mt-1.5 text-xs text-[#78817B]">
                Sign in with your college-issued Login ID and password.
              </p>
            </div>

            {/* Error Banner */}
            {(localError || authError) && (
              <div className="mt-4">
                <AlertBanner
                  type="error"
                  message={localError || authError}
                  onClose={() => setLocalError(null)}
                />
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Login ID Field */}
              <div>
                <label
                  htmlFor="loginId"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#78817B]"
                >
                  College Login ID
                </label>
                <div className="relative mt-1.5">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#78817B]">
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
                    className="block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3]/50 py-2.5 pl-10 pr-3.5 text-sm font-mono uppercase tracking-wider text-[#252B27] placeholder-[#9CA3AF] placeholder:normal-case placeholder:tracking-normal shadow-sm transition-colors focus:border-[#145C3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145C3A] disabled:opacity-50"
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#78817B]">
                  Admin: ADMIN001 • Faculty: FAC001 • Student: STU001
                </p>
              </div>

              {/* Password Field */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#78817B]"
                >
                  Password
                </label>
                <div className="relative mt-1.5">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#78817B]">
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
                    className="block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3]/50 py-2.5 pl-10 pr-10 text-sm text-[#252B27] placeholder-[#9CA3AF] shadow-sm transition-colors focus:border-[#145C3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145C3A] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#78817B] hover:text-[#252B27]"
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#145C3A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#21845A] focus:outline-none focus:ring-2 focus:ring-[#145C3A] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="mt-5 rounded-xl border border-amber-200 bg-[#FFFBEB] p-3 text-xs text-[#92400E]">
              <div className="flex gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#D97706] mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-[#92400E]">
                    Strict Institutional Access
                  </p>
                  <p className="leading-relaxed text-[#92400E]/80 text-[11px]">
                    Public self-registration is disabled. All accounts are managed and provisioned by the
                    college administration. Contact the academic office for credential assistance.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Fill Test Accounts */}
            <div className="mt-5 border-t border-[#E8ECE7] pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#78817B]">
                Quick Select Test Login IDs:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickFill('FAC001')}
                  className="rounded-lg border border-[#21845A]/30 bg-[#EAF3ED] px-2.5 py-1 text-xs font-mono font-medium text-[#145C3A] hover:bg-[#145C3A] hover:text-white transition-colors"
                >
                  FAC001 (Faculty)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('ADMIN001')}
                  className="rounded-lg border border-[#E8ECE7] bg-[#F5F6F3] px-2.5 py-1 text-xs font-mono font-medium text-[#252B27] hover:bg-[#252B27] hover:text-white transition-colors"
                >
                  ADMIN001 (Admin)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('STU001')}
                  className="rounded-lg border border-[#21845A]/30 bg-[#EAF3ED] px-2.5 py-1 text-xs font-mono font-medium text-[#145C3A] hover:bg-[#145C3A] hover:text-white transition-colors"
                >
                  STU001 (Student)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
