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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#252B27]/40 p-4 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-detail-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-xl my-8">
        {/* Header Badges & Close */}
        <div className="flex items-start justify-between border-b border-[#E8ECE7] pb-4">
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
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold uppercase text-rose-700">
                <Flame className="h-3 w-3" />
                Urgent Priority
              </span>
            )}

            {/* Read/Unread State for Student */}
            {isStudent && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                  notification.is_read
                    ? 'border-[#E8ECE7] bg-[#F5F6F3] text-[#78817B]'
                    : 'border-[#21845A]/30 bg-[#EAF3ED] text-[#145C3A] font-semibold'
                }`}
              >
                {notification.is_read ? 'Read' : 'Unread'}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#78817B] hover:bg-[#F5F6F3] hover:text-[#252B27]"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-4 space-y-4">
          <div>
            <h2 id="notification-detail-title" className="text-lg font-bold text-[#252B27] sm:text-xl">
              {notification.title}
            </h2>

            {/* Sender & Timestamp Metadata */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#78817B]">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[#78817B]" />
                <span className="font-medium text-[#252B27]">{notification.sender_name || 'Academic Administration'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#78817B]" />
                <span>
                  {notification.publication_date || 'Date'}
                  {notification.relative_time ? ` (${notification.relative_time})` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Subject tag if attached */}
          {notification.subjects && (
            <div className="flex items-center gap-2 rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3 py-2 text-xs">
              <BookOpen className="h-4 w-4 text-[#145C3A] shrink-0" />
              <div className="truncate">
                <span className="font-semibold text-[#252B27]">Course: </span>
                <span className="font-mono text-[#78817B]">
                  {notification.subjects.subject_code} — {notification.subjects.subject_name}
                </span>
              </div>
            </div>
          )}

          {/* Urgent Alert Banner */}
          {isUrgent && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-medium">
                This is a high-priority notice requiring immediate student attention.
              </span>
            </div>
          )}

          {/* Announcement Message */}
          <div className="rounded-xl border border-[#E8ECE7] bg-[#F5F6F3]/60 p-4 text-xs leading-relaxed text-[#252B27] whitespace-pre-line max-h-72 overflow-y-auto">
            {notification.description}
          </div>

          {/* Expiry info if available */}
          {notification.expiry_date && (
            <p className="text-[11px] text-[#78817B] italic">
              Notice valid until: {new Date(notification.expiry_date).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between border-t border-[#E8ECE7] pt-4">
          <div className="text-xs text-[#78817B]">
            {notification.is_read && notification.read_at && (
              <span>Read on {new Date(notification.read_at).toLocaleDateString()}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isStudent && !notification.is_read && onMarkAsRead && (
              <button
                type="button"
                onClick={() => onMarkAsRead(notification.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#21845A]/30 bg-[#EAF3ED] px-3.5 py-2 text-xs font-semibold text-[#145C3A] hover:bg-[#145C3A] hover:text-white transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Mark as Read</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#E8ECE7] bg-white px-4 py-2 text-xs font-semibold text-[#252B27] hover:bg-[#F5F6F3]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
