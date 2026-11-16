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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-draft-session-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-rose-900/60 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-950/80 text-rose-400 border border-rose-800/80">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="delete-draft-session-title" className="text-base font-bold text-white">
                Delete Draft Attendance Session
              </h3>
              <p className="text-xs text-slate-400">
                Permanent draft removal
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Subject Code</span>
              <span className="font-mono font-semibold text-white">
                {subjectCode}
                {subjectName ? ` — ${subjectName}` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Session Number</span>
              <span className="font-mono font-semibold text-slate-200">
                Session #{session.session_number}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Session Date</span>
              <span className="font-mono font-semibold text-slate-200">
                {session.session_date}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Current Status</span>
              <span className="rounded bg-amber-950 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300 border border-amber-800">
                {session.status}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-3.5 text-rose-200 leading-relaxed">
            <strong className="font-semibold text-rose-300">Warning:</strong> Deleting this draft
            session permanently removes the draft and any associated draft attendance data.
            In-progress and finalized sessions cannot be deleted.
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-800/80 bg-rose-950/60 p-3 text-xs text-rose-200"
            >
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(session)}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 shadow-sm transition-colors"
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
