import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GraduationCap, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  const { role, user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F6F3] p-6 text-[#252B27]">
      <div className="w-full max-w-md rounded-2xl border border-[#E8ECE7] bg-white p-8 shadow-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF3ED] text-[#145C3A] border border-[#21845A]/20 shadow-inner">
          <GraduationCap className="h-7 w-7" />
        </div>

        <h1 className="mt-5 text-xl font-bold tracking-tight text-[#252B27]">
          404 — Page Not Found
        </h1>
        <p className="mt-2 text-xs text-[#78817B]">
          The requested institutional route does not exist or has been relocated.
        </p>

        <div className="mt-8">
          {user && role ? (
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
