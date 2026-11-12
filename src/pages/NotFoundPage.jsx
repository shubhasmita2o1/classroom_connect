import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GraduationCap, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  const { role, user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-950/60 text-blue-400 border border-blue-800/60 shadow-inner">
          <GraduationCap className="h-8 w-8" />
        </div>

        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white">
          404 — Page Not Found
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          The requested institutional route does not exist or has been relocated.
        </p>

        <div className="mt-8">
          {user && role ? (
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
        </div>
      </div>
    </div>
  )
}
