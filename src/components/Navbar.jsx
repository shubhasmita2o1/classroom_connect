import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ChangePasswordModal from './ChangePasswordModal'
import {
  GraduationCap,
  Shield,
  Award,
  BookOpen,
  LogOut,
  Menu,
  X,
  User,
  KeyRound,
} from 'lucide-react'

export default function Navbar() {
  const { profile, role, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
    navigate('/login', { replace: true })
  }

  const roleBadgeConfig = {
    admin: {
      label: 'Administrator',
      bg: 'bg-indigo-950/70 border-indigo-700/60 text-indigo-300',
      icon: <Shield className="h-3.5 w-3.5 mr-1 text-indigo-400" />,
    },
    faculty: {
      label: 'Faculty',
      bg: 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300',
      icon: <Award className="h-3.5 w-3.5 mr-1 text-emerald-400" />,
    },
    student: {
      label: 'Student',
      bg: 'bg-sky-950/70 border-sky-700/60 text-sky-300',
      icon: <BookOpen className="h-3.5 w-3.5 mr-1 text-sky-400" />,
    },
  }[role] || {
    label: role || 'User',
    bg: 'bg-slate-800 border-slate-700 text-slate-300',
    icon: <User className="h-3.5 w-3.5 mr-1 text-slate-400" />,
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white">
                  Classroom Connect
                </span>
                <span className="hidden rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase text-slate-400 sm:inline-block">
                  Academic Portal
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Department of Computer Science & Engineering
              </p>
            </div>
          </div>

          {/* Desktop Profile & Actions */}
          <div className="hidden items-center gap-3 md:flex">
            {profile && (
              <div className="flex items-center gap-3 border-r border-slate-800 pr-4">
                <div className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-sm font-semibold text-slate-100">
                      {profile.full_name || 'Academic User'}
                    </span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-400 border border-slate-700">
                      {profile.login_id || 'ID'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    College ID: {profile.login_id}
                  </p>
                </div>

                {/* Role badge */}
                <div
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleBadgeConfig.bg}`}
                >
                  {roleBadgeConfig.icon}
                  {roleBadgeConfig.label}
                </div>
              </div>
            )}

            {/* Change Password Button */}
            <button
              type="button"
              onClick={() => setPasswordModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-white"
              title="Change Account Password"
            >
              <KeyRound className="h-3.5 w-3.5 text-slate-400" />
              <span>Password</span>
            </button>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-white disabled:opacity-50"
              title="Sign out of academic portal"
            >
              <LogOut className="h-3.5 w-3.5 text-slate-400" />
              <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
          </div>

          {/* Mobile menu trigger */}
          <div className="flex md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-800 bg-slate-900 px-4 py-4 md:hidden space-y-3">
            {profile && (
              <div className="space-y-1 border-b border-slate-800 pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-100">
                    {profile.full_name}
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs font-bold text-blue-400 border border-slate-700">
                    {profile.login_id}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Role: {roleBadgeConfig.label}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false)
                setPasswordModalOpen(true)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <KeyRound className="h-4 w-4" />
              <span>Change Password</span>
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
          </div>
        )}
      </header>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </>
  )
}
