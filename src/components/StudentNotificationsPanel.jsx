import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Megaphone,
  CheckCheck,
  Search,
  RefreshCw,
  Clock,
  User,
  Flame,
  ChevronRight,
  Inbox,
  Loader2,
} from 'lucide-react'
import NotificationDetailModal from './NotificationDetailModal'
import {
  fetchStudentNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  CATEGORY_STYLES,
} from '../services/notificationService'

export default function StudentNotificationsPanel({ studentId }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNotif, setSelectedNotif] = useState(null)
  const [markingAll, setMarkingAll] = useState(false)

  const loadNotifications = useCallback(async (showLoading = false) => {
    if (!studentId) return
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const result = await fetchStudentNotifications(studentId)
      if (result.error) {
        setError(result.error)
      } else {
        setNotifications(result.data)
      }
    } catch (err) {
      setError(err.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    let ignore = false

    async function initFetch() {
      if (!studentId) {
        setLoading(false)
        return
      }
      try {
        const result = await fetchStudentNotifications(studentId)
        if (!ignore) {
          if (result.error) {
            setError(result.error)
          } else {
            setNotifications(result.data)
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || 'Failed to load notifications')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    initFetch()

    // Listen to custom notification updates dispatched across the app
    const handleUpdate = () => {
      loadNotifications(false)
    }
    window.addEventListener('classroom:notifications-updated', handleUpdate)
    return () => {
      ignore = true
      window.removeEventListener('classroom:notifications-updated', handleUpdate)
    }
  }, [studentId, loadNotifications])

  // Compute unread count
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length
  }, [notifications])

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      // Category filter
      if (activeCategory === 'GENERAL') {
        if (!item.category.includes('General') && !item.category.includes('Holiday') && !item.category.includes('Important')) {
          return false
        }
      } else if (activeCategory === 'ACADEMIC') {
        if (!item.category.includes('Academic') && !item.category.includes('Examination')) {
          return false
        }
      } else if (activeCategory === 'URGENT') {
        if (!item.category.includes('Urgent') && item.priority !== 'Urgent') {
          return false
        }
      }

      // Unread only filter
      if (unreadOnly && item.is_read) {
        return false
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchTitle = item.title?.toLowerCase().includes(query)
        const matchDesc = item.description?.toLowerCase().includes(query)
        const matchSender = item.sender_name?.toLowerCase().includes(query)
        const matchSubject = item.subjects?.subject_code?.toLowerCase().includes(query) ||
                             item.subjects?.subject_name?.toLowerCase().includes(query)
        if (!matchTitle && !matchDesc && !matchSender && !matchSubject) {
          return false
        }
      }

      return true
    })
  }, [notifications, activeCategory, unreadOnly, searchQuery])

  // Handle opening a notification card: mark as read automatically
  const handleOpenNotification = async (item) => {
    setSelectedNotif(item)

    if (!item.is_read) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      )
      await markNotificationAsRead(item.id, studentId)
    }
  }

  // Handle Mark All as Read
  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (unreadIds.length === 0) return

    setMarkingAll(true)
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    )

    try {
      await markAllNotificationsAsRead(unreadIds, studentId)
    } catch (err) {
      console.error(err)
      await loadNotifications(false)
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div id="announcements-section" className="mt-8 space-y-4">
      {/* Header bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">
                Announcements & Notices
              </h2>
              {unreadCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-blue-950 px-2 py-0.5 text-xs font-bold text-blue-300 border border-blue-800">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Official circulars, academic notices, and department updates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={markingAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition-colors disabled:opacity-50"
              title="Mark all notifications as read"
            >
              {markingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5 text-blue-400" />
              )}
              <span>Mark all read</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => loadNotifications(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition-colors"
            title="Refresh announcements"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'ALL', label: 'All Notices' },
              { id: 'GENERAL', label: 'General' },
              { id: 'ACADEMIC', label: 'Academic' },
              { id: 'URGENT', label: 'Urgent' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  activeCategory === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Unread Only Toggle */}
          <label className="flex items-center gap-2 cursor-pointer self-start sm:self-auto select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs font-medium text-slate-300">
              Unread only ({unreadCount})
            </span>
          </label>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notices by title, course, or message content..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950/80 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-800/80 bg-rose-950/60 p-3 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      {/* Announcement List */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-400" />
            <p className="mt-2 text-xs text-slate-400">Loading announcements...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-10 text-center">
            <Inbox className="mx-auto h-8 w-8 text-slate-600" />
            <h3 className="mt-2 text-sm font-semibold text-slate-300">
              No announcements found
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {unreadOnly
                ? 'All announcements in this category have been marked as read.'
                : 'There are no active notices matching your current filter criteria.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((item) => {
            const catStyle = CATEGORY_STYLES[item.category] || CATEGORY_STYLES['General Announcement']
            const isUrgent = item.priority === 'Urgent' || item.category === 'Urgent Notice'

            return (
              <div
                key={item.id}
                onClick={() => handleOpenNotification(item)}
                className={`group cursor-pointer rounded-xl border p-4 transition-all duration-150 ${
                  item.is_read
                    ? 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70'
                    : 'border-blue-900/60 bg-slate-900/90 shadow-sm hover:border-blue-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Badges and metadata */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {/* Unread indicator dot */}
                      {!item.is_read && (
                        <span
                          className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"
                          title="Unread announcement"
                        />
                      )}

                      {/* Category Badge */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${catStyle.badge}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${catStyle.dot}`} />
                        {item.category}
                      </span>

                      {/* Priority Tag */}
                      {isUrgent && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-800 bg-rose-950 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-300">
                          <Flame className="h-2.5 w-2.5" />
                          Urgent
                        </span>
                      )}

                      {/* Subject Tag */}
                      {item.subjects && (
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-300 border border-slate-700">
                          {item.subjects.subject_code}
                        </span>
                      )}

                      {/* Relative time */}
                      <span className="text-slate-500 text-[11px] ml-auto sm:ml-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {item.relative_time}
                      </span>
                    </div>

                    {/* Title */}
                    <h3
                      className={`mt-2 text-sm sm:text-base font-semibold group-hover:text-blue-400 transition-colors ${
                        item.is_read ? 'text-slate-300' : 'text-white font-bold'
                      }`}
                    >
                      {item.title}
                    </h3>

                    {/* Description preview snippet */}
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Footer sender */}
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <User className="h-3 w-3" />
                      <span>{item.sender_name}</span>
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-300 shrink-0 self-center transition-colors" />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Detail Modal */}
      <NotificationDetailModal
        isOpen={Boolean(selectedNotif)}
        notification={selectedNotif}
        isStudent={true}
        onClose={() => setSelectedNotif(null)}
        onMarkAsRead={(id) => {
          markNotificationAsRead(id, studentId)
          setSelectedNotif((prev) => (prev ? { ...prev, is_read: true } : null))
        }}
      />
    </div>
  )
}
