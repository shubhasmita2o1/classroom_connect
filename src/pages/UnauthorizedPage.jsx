import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react'

export default function UnauthorizedPage() {
  const { role, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-rose-900/40 bg-slate-900/80 p-8 shadow-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-950/60 text-rose-400 border border-rose-800/60 shadow-inner">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight text-white">
          Access Restricted (403)
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          You do not have authorization to access this institutional resource with your current{' '}
          <span className="font-semibold text-rose-300 capitalize">{role || 'user'}</span> role.
        </p>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400 text-left">
          <p className="font-semibold text-slate-300">Security Policy Notice:</p>
          <p className="mt-1">
            Access to administrative and specialized academic views is strictly governed by
            PostgreSQL Row Level Security policies. Violations are audited.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {role ? (
            <button
              type="button"
              onClick={() => navigate(`/${role}`, { replace: true })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to {role.charAt(0).toUpperCase() + role.slice(1)} Dashboard</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Login</span>
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              await signOut()
              navigate('/login', { replace: true })
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  )
}
