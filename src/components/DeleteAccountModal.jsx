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
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : targetProfile.role === 'faculty'
      ? 'bg-[#EAF3ED] text-[#145C3A] border-[#21845A]/30'
      : 'bg-sky-50 text-sky-700 border-sky-200'

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#252B27]/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-red-900/20 bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E8ECE7] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-[#FEF2F2] text-[#DC2626]">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 id="delete-account-modal-title" className="text-base font-bold text-[#252B27]">
                Permanently Delete Account
              </h3>
              <p className="text-xs text-[#DC2626]">
                Irreversible removal of authentication &amp; portal access
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-[#78817B] hover:bg-[#F5F6F3] hover:text-[#252B27] disabled:opacity-50"
            aria-label="Close delete confirmation modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Account Details */}
        <div className="mt-4 rounded-xl border border-red-100 bg-[#FEF2F2]/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#991B1B]">
            Account Scheduled for Permanent Deletion
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] text-[#78817B]">Login ID</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold text-[#252B27]">{expectedLoginId}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-[#78817B]">Full Name</dt>
              <dd className="mt-0.5 text-sm font-semibold text-[#252B27]">
                {targetProfile.full_name || 'Academic User'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-[#78817B]">Role</dt>
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
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-[#FFFBEB] p-3 text-xs text-[#92400E]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706]" />
          <div className="space-y-1 leading-relaxed text-[11px]">
            <p className="font-semibold text-[#92400E]">
              Auth credentials and active portal access will be permanently destroyed.
            </p>
            <p className="text-[#92400E]/80">
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
              className="block text-xs font-semibold text-[#252B27]"
            >
              Type{' '}
              <span className="rounded bg-[#F5F6F3] px-1.5 py-0.5 font-mono font-bold text-[#DC2626] border border-[#E8ECE7]">
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
              className="mt-2 block w-full rounded-xl border border-red-200 bg-[#F5F6F3]/50 px-3.5 py-2 font-mono text-sm text-[#252B27] placeholder-[#9CA3AF] focus:border-[#DC2626] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#DC2626] disabled:opacity-50"
            />
            {confirmInput.length > 0 && !isExactMatch && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#DC2626]">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>Input must match &quot;{expectedLoginId}&quot; exactly.</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#E8ECE7] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-[#E8ECE7] bg-white px-4 py-2 text-xs font-semibold text-[#252B27] hover:bg-[#F5F6F3] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isExactMatch || submitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200 disabled:text-red-400"
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
