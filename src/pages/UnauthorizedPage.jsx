import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShieldAlert, ArrowLeft } from 'lucide-react'

export default function UnauthorizedPage() {
  const { role } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F6F3] p-6 text-[#252B27]">
      <div className="w-full max-w-md rounded-2xl border border-[#E8ECE7] bg-white p-8 shadow-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5]/60 shadow-inner">
          <ShieldAlert className="h-7 w-7" />
        </div>

        <h1 className="mt-5 text-xl font-bold tracking-tight text-[#252B27]">
          Access Restricted (403)
        </h1>
        <p className="mt-2 text-xs text-[#78817B] leading-relaxed">
          You do not have authorization to access this institutional resource with your current{' '}
          <span className="font-semibold text-[#DC2626] capitalize">{role || 'user'}</span> role.
        </p>

        <div className="mt-6 rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] p-4 text-xs text-[#78817B] text-left">
          <p className="font-semibold text-[#252B27]">Security Policy Notice:</p>
          <p className="mt-1 leading-relaxed">
            Access to administrative and specialized academic views is strictly governed by
            PostgreSQL Row Level Security policies. Violations are audited.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {role ? (
            <button
              type="button"
              onClick={() => navigate(`/${role}`, { replace: true })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#145C3A] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#21845A] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to {role.charAt(0).toUpperCase() + role.slice(1)} Dashboard</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#145C3A] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#21845A] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Login</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
