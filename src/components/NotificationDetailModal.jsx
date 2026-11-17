import { X, CheckCircle2, Clock, User, BookOpen, AlertTriangle, Flame } from 'lucide-react'
import { CATEGORY_STYLES } from '../services/notificationService'

export default function NotificationDetailModal({
  isOpen,
  notification,
  onClose,
  onMarkAsRead,
  isStudent = false,
}) {
  if (!isOpen || !notification) return null

  const catStyle = CATEGORY_STYLES[notification.category] || CATEGORY_STYLES['General Announcement']
  const isUrgent = notification.priority === 'Urgent' || notification.category === 'Urgent Notice'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-detail-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl my-8">
        {/* Header Badges & Close */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${catStyle.badge}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${catStyle.dot}`} />
              {notification.category}
            </span>

            {/* Priority Badge */}
            {isUrgent && (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-800 bg-rose-950 px-2 py-0.5 text-[11px] font-bold uppercase text-rose-300">
                <Flame className="h-3 w-3" />
                Urgent Priority
              </span>
            )}

            {/* Read/Unread State for Student */}
            {isStudent && (
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium border ${
                  notification.is_read
                    ? 'border-slate-800 bg-slate-950 text-slate-400'
                    : 'border-blue-800/80 bg-blue-950/80 text-blue-300'
                }`}
              >
                {notification.is_read ? 'Read' : 'Unread'}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-4 space-y-4">
          <div>
            <h2 id="notification-detail-title" className="text-lg font-bold text-white sm:text-xl">
              {notification.title}
            </h2>

            {/* Sender & Timestamp Metadata */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-500" />
                <span>{notification.sender_name || 'Academic Administration'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>
                  {notification.publication_date || 'Date'}
                  {notification.relative_time ? ` (${notification.relative_time})` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Subject tag if attached */}
          {notification.subjects && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs">
              <BookOpen className="h-4 w-4 text-blue-400 shrink-0" />
              <div className="truncate">
                <span className="font-semibold text-white">Course: </span>
                <span className="font-mono text-slate-300">
                  {notification.subjects.subject_code} — {notification.subjects.subject_name}
                </span>
              </div>
            </div>
          )}

          {/* Urgent Alert Banner */}
          {isUrgent && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-900/60 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                This is a high-priority notice requiring immediate student attention.
              </span>
            </div>
          )}

          {/* Announcement Message */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-200 whitespace-pre-line max-h-72 overflow-y-auto">
            {notification.description}
          </div>

          {/* Expiry info if available */}
          {notification.expiry_date && (
            <p className="text-[11px] text-slate-500 italic">
              Notice valid until: {new Date(notification.expiry_date).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4">
          <div className="text-xs text-slate-500">
            {notification.is_read && notification.read_at && (
              <span>Read on {new Date(notification.read_at).toLocaleDateString()}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isStudent && !notification.is_read && onMarkAsRead && (
              <button
                type="button"
                onClick={() => onMarkAsRead(notification.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-700 bg-blue-950/80 px-3.5 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-900/80 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Mark as Read</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
