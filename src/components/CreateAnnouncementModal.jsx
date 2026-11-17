import { useState } from 'react'
import { Megaphone, X, Loader2, AlertCircle, Calendar, BookOpen, Tag, Flame } from 'lucide-react'
import {
  NOTIFICATION_CATEGORIES,
  createAnnouncement,
} from '../services/notificationService'

export default function CreateAnnouncementModal({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  subjects = [],
  defaultSubjectId = null,
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('General Announcement')
  const [priority, setPriority] = useState('Normal')
  const [subjectId, setSubjectId] = useState(defaultSubjectId || '')
  const [expiryDate, setExpiryDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleClose = () => {
    setTitle('')
    setDescription('')
    setCategory('General Announcement')
    setPriority('Normal')
    setSubjectId(defaultSubjectId || '')
    setExpiryDate('')
    setError(null)
    onClose()
  }

  // Automatically adjust priority when Urgent Notice category is selected
  const handleCategoryChange = (e) => {
    const val = e.target.value
    setCategory(val)
    if (val === 'Urgent Notice') {
      setPriority('Urgent')
    } else if (priority === 'Urgent') {
      setPriority('Normal')
    }
  }

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Please provide an announcement title.')
      return
    }

    if (!description.trim()) {
      setError('Please write an announcement message.')
      return
    }

    if (!currentUser?.id) {
      setError('User identity not verified. Please refresh your session.')
      return
    }

    setSubmitting(true)
    try {
      const created = await createAnnouncement({
        title,
        description,
        category,
        priority,
        subjectId: subjectId || null,
        expiryDate: expiryDate || null,
        publishedBy: currentUser.id,
      })

      if (onSuccess) {
        onSuccess(created)
      }
      handleClose()
    } catch (err) {
      console.error('Failed to publish announcement:', err)
      setError(err.message || 'Failed to publish announcement. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-announcement-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h3 id="create-announcement-title" className="text-base font-bold text-white">
                Publish Announcement
              </h3>
              <p className="text-xs text-slate-400">
                Post notices and updates visible to students
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-rose-800/80 bg-rose-950/60 p-3 text-xs text-rose-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Title input */}
          <div>
            <label htmlFor="announcement-title" className="block text-xs font-semibold text-slate-300">
              Announcement Title <span className="text-rose-400">*</span>
            </label>
            <input
              id="announcement-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Midterm Exam Schedule Announced"
              maxLength={120}
              required
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="mt-1 block text-right text-[10px] text-slate-500">
              {title.length}/120
            </span>
          </div>

          {/* Category & Priority Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="announcement-category" className="flex items-center gap-1 text-xs font-semibold text-slate-300">
                <Tag className="h-3 w-3 text-slate-400" />
                <span>Category</span> <span className="text-rose-400">*</span>
              </label>
              <select
                id="announcement-category"
                value={category}
                onChange={handleCategoryChange}
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {NOTIFICATION_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="announcement-priority" className="flex items-center gap-1 text-xs font-semibold text-slate-300">
                <Flame className="h-3 w-3 text-slate-400" />
                <span>Priority</span>
              </label>
              <select
                id="announcement-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          {/* Associated Subject (Optional) */}
          <div>
            <label htmlFor="announcement-subject" className="flex items-center gap-1 text-xs font-semibold text-slate-300">
              <BookOpen className="h-3 w-3 text-slate-400" />
              <span>Target Course / Subject (Optional)</span>
            </label>
            <select
              id="announcement-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">General (All Students / Classroom Wide)</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.subject_code} — {sub.subject_name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-slate-500">
              Leave as General for institution or classroom-wide announcements.
            </span>
          </div>

          {/* Expiry Date (Optional) */}
          <div>
            <label htmlFor="announcement-expiry" className="flex items-center gap-1 text-xs font-semibold text-slate-300">
              <Calendar className="h-3 w-3 text-slate-400" />
              <span>Expiry Date (Optional)</span>
            </label>
            <input
              id="announcement-expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              disabled={submitting}
              min={new Date().toISOString().split('T')[0]}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Message textarea */}
          <div>
            <label htmlFor="announcement-message" className="block text-xs font-semibold text-slate-300">
              Announcement Message <span className="text-rose-400">*</span>
            </label>
            <textarea
              id="announcement-message"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Write detailed announcement content here..."
              required
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Megaphone className="h-3.5 w-3.5" />
                  <span>Publish Announcement</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
