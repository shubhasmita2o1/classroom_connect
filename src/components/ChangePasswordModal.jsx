import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AlertBanner from './AlertBanner'
import { Lock, Eye, EyeOff, X, CheckCircle2, ShieldCheck } from 'lucide-react'

export default function ChangePasswordModal({ isOpen, onClose }) {
  const { updatePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  if (!isOpen) return null

  const handleClose = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setErrorMessage(null)
    setSuccessMessage(null)
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!currentPassword) {
      setErrorMessage('Please enter your current password.')
      return
    }

    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.')
      return
    }

    if (newPassword === currentPassword) {
      setErrorMessage('New password must be different from your current password.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match. Please re-enter.')
      return
    }

    setSubmitting(true)
    const res = await updatePassword(currentPassword, newPassword)
    setSubmitting(false)

    if (res.success) {
      setSuccessMessage('Password successfully updated!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        handleClose()
      }, 1500)
    } else {
      setErrorMessage(res.error || 'Failed to update password')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Change Account Password</h3>
              <p className="text-xs text-slate-400">Re-authenticate and set your new credentials</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Alerts */}
        <div className="mt-4 space-y-2">
          {errorMessage && (
            <AlertBanner
              type="error"
              message={errorMessage}
              onClose={() => setErrorMessage(null)}
            />
          )}
          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-800/80 bg-emerald-950/50 p-3 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Current Password Field */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
              Current Password *
            </label>
            <div className="relative mt-1">
              <input
                type={showCurrentPass ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Enter your existing password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={submitting}
                className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200"
                aria-label={showCurrentPass ? 'Hide current password' : 'Show current password'}
              >
                {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password Field */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
              New Password *
            </label>
            <div className="relative mt-1">
              <input
                type={showNewPass ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
                className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200"
                aria-label={showNewPass ? 'Hide new password' : 'Show new password'}
              >
                {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password Field */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
              Confirm New Password *
            </label>
            <input
              type={showNewPass ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5 text-[11px] text-slate-400 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
            <span>Re-authentication required. Password changes take effect immediately.</span>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 shadow-sm"
            >
              {submitting ? 'Verifying & Updating...' : 'Save New Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
