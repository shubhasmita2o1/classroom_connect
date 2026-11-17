import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react'

export default function DeleteDraftSessionModal({
  isOpen,
  session,
  deleting,
  error,
  onClose,
  onConfirm,
}) {
  if (!isOpen || !session) return null

  const subjectCode = session.subjects?.subject_code || 'N/A'
  const subjectName = session.subjects?.subject_name || ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#252B27]/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-draft-session-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between border-b border-[#E8ECE7] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5]/60">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="delete-draft-session-title" className="text-base font-bold text-[#252B27]">
                Delete Draft Attendance Session
              </h3>
              <p className="text-xs text-[#78817B]">
                Permanent draft removal
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg p-1 text-[#78817B] hover:bg-[#F5F6F3] hover:text-[#252B27] disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          <div className="rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[#78817B]">Subject Code</span>
              <span className="font-mono font-semibold text-[#252B27]">
                {subjectCode}
                {subjectName ? ` — ${subjectName}` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#78817B]">Session Number</span>
              <span className="font-mono font-semibold text-[#252B27]">
                Session #{session.session_number}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#78817B]">Session Date</span>
              <span className="font-mono font-semibold text-[#252B27]">
                {session.session_date}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#78817B]">Current Status</span>
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 border border-amber-200">
                {session.status}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-[#FEF2F2] p-3.5 text-[#991B1B] leading-relaxed">
            <strong className="font-semibold text-[#DC2626]">Warning:</strong> Deleting this draft
            session permanently removes the draft and any associated draft attendance data.
            In-progress and finalized sessions cannot be deleted.
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-[#FEF2F2] p-3 text-xs text-[#991B1B]"
            >
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#E8ECE7] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl border border-[#E8ECE7] bg-white px-4 py-2 text-xs font-semibold text-[#252B27] hover:bg-[#F5F6F3] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(session)}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 shadow-sm transition-colors"
          >
            {deleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Deleting Draft...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                <span>Permanently Delete Draft</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
