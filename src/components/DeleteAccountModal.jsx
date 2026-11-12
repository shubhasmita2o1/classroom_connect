import { useState } from 'react'
import { supabase } from '../lib/supabase'
import AlertBanner from './AlertBanner'
import { AlertTriangle, Trash2, X, ShieldAlert } from 'lucide-react'

async function extractFunctionError(error, data) {
  let message = data?.error || error?.message || 'Failed to permanently delete account.'
  let status = null

  if (error?.context) {
    status = error.context.status ?? null
    try {
      const cloned = typeof error.context.clone === 'function' ? error.context.clone() : error.context
      const payload = await cloned.json()
      if (payload?.error) {
        message = payload.error
      }
    } catch {
      // Keep fallback message if response body is not JSON
    }
  }

  return { message, status }
}

export default function DeleteAccountModal({
  targetProfile,
  onClose,
  onDeleted,
  onStaleAccount,
}) {
  const [confirmInput, setConfirmInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  if (!targetProfile) return null

  const expectedLoginId =
    targetProfile.login_id || targetProfile.email?.split('@')[0]?.toUpperCase() || ''
  const isExactMatch = expectedLoginId.length > 0 && confirmInput.trim() === expectedLoginId
  const roleBadgeClass =
    targetProfile.role === 'admin'
      ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
      : targetProfile.role === 'faculty'
      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
      : 'bg-sky-950 text-sky-300 border-sky-800'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage(null)

    if (targetProfile.is_active) {
      setErrorMessage('Only deactivated accounts can be permanently deleted. Deactivate the account first.')
      return
    }

    if (!isExactMatch) {
      setErrorMessage(`Please type the exact Login ID "${expectedLoginId}" to confirm deletion.`)
      return
    }

    setSubmitting(true)

    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: {
          targetUserId: targetProfile.id,
          confirmLoginId: confirmInput.trim(),
        },
      })

      if (error || data?.error) {
        const parsed = await extractFunctionError(error, data)
        setErrorMessage(parsed.message)
        if (parsed.status === 404 && onStaleAccount) {
          onStaleAccount()
        }
        return
      }

      onDeleted(data)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected error while deleting account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-red-900/60 bg-slate-900 p-6 shadow-2xl shadow-red-950/30">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-700/50 bg-red-950/80 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 id="delete-account-modal-title" className="text-base font-bold text-white">
                Permanently Delete Account
              </h3>
              <p className="text-xs text-red-300/90">
                Irreversible removal of authentication &amp; portal access
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
            aria-label="Close delete confirmation modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Account Details */}
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/20 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-300">
            Account Scheduled for Permanent Deletion
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] text-slate-400">Login ID</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold text-white">{expectedLoginId}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Full Name</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-100">
                {targetProfile.full_name || 'Academic User'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Role</dt>
              <dd className="mt-0.5">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${roleBadgeClass}`}
                >
                  {targetProfile.role}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {/* Data Integrity Guarantee Notice */}
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="space-y-1 leading-relaxed">
            <p className="font-semibold text-amber-300">
              Auth credentials and active portal access will be permanently destroyed.
            </p>
            <p className="text-amber-200/80">
              Historical attendance records, sessions, and audit logs are preserved. If this account has
              academic history, its roster identity will be archived safely.
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-4">
            <AlertBanner
              type="error"
              message={errorMessage}
              onClose={() => setErrorMessage(null)}
            />
          </div>
        )}

        {/* Confirmation Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="confirm-delete-login-id"
              className="block text-xs font-medium text-slate-300"
            >
              Type{' '}
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono font-bold text-red-300 border border-slate-700">
                {expectedLoginId}
              </span>{' '}
              to confirm permanent deletion *
            </label>
            <input
              id="confirm-delete-login-id"
              type="text"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={submitting}
              placeholder={`Enter ${expectedLoginId}`}
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className="mt-2 block w-full rounded-lg border border-red-900/60 bg-slate-950 px-3.5 py-2 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
            />
            {confirmInput.length > 0 && !isExactMatch && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-400">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>Input must match "{expectedLoginId}" exactly.</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isExactMatch || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-600 bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:border-red-900/50 disabled:bg-red-950/60 disabled:text-red-300/50"
            >
              {submitting ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Deleting Account...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Permanently Delete Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
