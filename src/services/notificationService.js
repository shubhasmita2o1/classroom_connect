/**
 * Classroom Connect — Notifications Service
 *
 * Handles announcement fetching, creation, read tracking, and sender resolution
 * compliant with Supabase RLS policies and database constraints.
 */

import { supabase } from '../lib/supabase.js'

export const NOTIFICATION_CATEGORIES = [
  'General Announcement',
  'Academic Notice',
  'Urgent Notice',
  'Examination Notice',
  'Holiday Notice',
  'Important Announcement',
]

export const CATEGORY_SHORT_NAMES = {
  'General Announcement': 'General',
  'Academic Notice': 'Academic',
  'Urgent Notice': 'Urgent',
  'Examination Notice': 'Exam',
  'Holiday Notice': 'Holiday',
  'Important Announcement': 'Important',
}

export const CATEGORY_STYLES = {
  'Urgent Notice': {
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    label: 'Urgent',
  },
  'Academic Notice': {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-600',
    label: 'Academic',
  },
  'Examination Notice': {
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-500',
    label: 'Exam',
  },
  'Holiday Notice': {
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    label: 'Holiday',
  },
  'Important Announcement': {
    badge: 'bg-orange-50 text-orange-800 border-orange-200',
    dot: 'bg-orange-500',
    label: 'Important',
  },
  'General Announcement': {
    badge: 'bg-sky-50 text-sky-800 border-sky-200',
    dot: 'bg-sky-500',
    label: 'General',
  },
}

export function formatRelativeTime(dateString) {
  if (!dateString) return 'Recently'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return dateString

  const now = new Date()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

/**
 * Dispatch an in-app event to notify listeners (e.g. Navbar unread badge)
 */
export function dispatchNotificationUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('classroom:notifications-updated'))
  }
}

/**
 * Fetch published announcements for a student along with their individual read statuses
 */
export async function fetchStudentNotifications(studentId) {
  if (!studentId) {
    return { data: [], unreadCount: 0, error: null }
  }

  try {
    // 1. Fetch published notifications (RLS: students_read_published_notifications)
    // and joined subjects
    const { data: notifications, error: notifErr } = await supabase
      .from('notifications')
      .select(`
        id,
        title,
        description,
        category,
        priority,
        publication_date,
        published_at,
        expiry_date,
        published_by,
        subject_id,
        subjects (
          id,
          subject_code,
          subject_name
        )
      `)
      .eq('is_published', true)
      .order('published_at', { ascending: false })

    if (notifErr) throw notifErr

    // 2. Fetch read statuses for this student (RLS: students_read_own_notification_reads)
    const { data: reads, error: readsErr } = await supabase
      .from('notification_reads')
      .select('notification_id, read_at')
      .eq('student_id', studentId)

    if (readsErr) throw readsErr

    const readMap = new Map()
    if (reads) {
      for (const r of reads) {
        readMap.set(r.notification_id, r.read_at)
      }
    }

    // 3. Fetch active faculty to resolve sender display names
    // RLS: authenticated_read_active_faculty
    const { data: facultyList } = await supabase
      .from('faculty')
      .select('profile_id, full_name, designation, department')
      .eq('is_active', true)

    const facultyMap = new Map()
    if (facultyList) {
      for (const f of facultyList) {
        if (f.profile_id) {
          facultyMap.set(f.profile_id, f)
        }
      }
    }

    // 4. Merge read status and publisher info
    let unreadCount = 0
    const enriched = (notifications || []).map((notif) => {
      const isRead = readMap.has(notif.id)
      if (!isRead) unreadCount++

      const facultySender = facultyMap.get(notif.published_by)
      const senderName = facultySender
        ? `${facultySender.full_name}${facultySender.designation ? ` (${facultySender.designation})` : ''}`
        : 'Classroom Administration'

      return {
        ...notif,
        is_read: isRead,
        read_at: readMap.get(notif.id) || null,
        sender_name: senderName,
        relative_time: formatRelativeTime(notif.published_at || notif.publication_date),
      }
    })

    return { data: enriched, unreadCount, error: null }
  } catch (err) {
    console.error('Error fetching student notifications:', err)
    return { data: [], unreadCount: 0, error: err.message || 'Failed to load notifications' }
  }
}

/**
 * Fetch total unread notification count for a student (lightweight for Navbar)
 */
export async function getStudentUnreadCount(studentId) {
  if (!studentId) return 0
  try {
    const [
      { data: notifs, error: notifErr },
      { data: reads, error: readErr },
    ] = await Promise.all([
      supabase.from('notifications').select('id').eq('is_published', true),
      supabase.from('notification_reads').select('notification_id').eq('student_id', studentId),
    ])

    if (notifErr || readErr) return 0
    const readSet = new Set((reads || []).map((r) => r.notification_id))
    return (notifs || []).filter((n) => !readSet.has(n.id)).length
  } catch {
    return 0
  }
}

/**
 * Mark a single notification as read by this student
 */
export async function markNotificationAsRead(notificationId, studentId) {
  if (!notificationId || !studentId) return { success: false }

  try {
    const { error } = await supabase.from('notification_reads').insert({
      notification_id: notificationId,
      student_id: studentId,
      read_at: new Date().toISOString(),
    })

    // Ignore unique constraint violation (code 23505) if already read
    if (error && error.code !== '23505') {
      throw error
    }

    dispatchNotificationUpdate()
    return { success: true }
  } catch (err) {
    console.error('Error marking notification as read:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Batch mark multiple notifications as read for this student
 */
export async function markAllNotificationsAsRead(notificationIds, studentId) {
  if (!notificationIds || notificationIds.length === 0 || !studentId) {
    return { success: true }
  }

  try {
    const rows = notificationIds.map((id) => ({
      notification_id: id,
      student_id: studentId,
      read_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('notification_reads').insert(rows)

    if (error && error.code !== '23505') {
      throw error
    }

    dispatchNotificationUpdate()
    return { success: true }
  } catch (err) {
    console.error('Error batch marking notifications as read:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Fetch announcements published by faculty
 */
export async function fetchFacultyAnnouncements(facultyUserId) {
  if (!facultyUserId) return { data: [], error: null }

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        id,
        title,
        description,
        category,
        priority,
        publication_date,
        published_at,
        expiry_date,
        published_by,
        subject_id,
        is_published,
        created_at,
        subjects (
          id,
          subject_code,
          subject_name
        )
      `)
      .eq('published_by', facultyUserId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const formatted = (data || []).map((n) => ({
      ...n,
      relative_time: formatRelativeTime(n.published_at || n.created_at),
    }))

    return { data: formatted, error: null }
  } catch (err) {
    console.error('Error fetching faculty announcements:', err)
    return { data: [], error: err.message || 'Failed to load announcements' }
  }
}

/**
 * Fetch all announcements for admin management
 */
export async function fetchAdminAnnouncements() {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        id,
        title,
        description,
        category,
        priority,
        publication_date,
        published_at,
        expiry_date,
        published_by,
        subject_id,
        is_published,
        created_at,
        subjects (
          id,
          subject_code,
          subject_name
        ),
        profiles:published_by (
          full_name,
          role,
          login_id
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    const formatted = (data || []).map((n) => ({
      ...n,
      sender_name: n.profiles?.full_name || 'Administrator',
      relative_time: formatRelativeTime(n.published_at || n.created_at),
    }))

    return { data: formatted, error: null }
  } catch (err) {
    console.error('Error fetching admin announcements:', err)
    return { data: [], error: err.message || 'Failed to load announcements' }
  }
}

/**
 * Publish a new announcement (Faculty or Admin)
 */
export async function createAnnouncement({
  title,
  description,
  category = 'General Announcement',
  priority = 'Normal',
  subjectId = null,
  expiryDate = null,
  publishedBy,
}) {
  if (!title || !title.trim()) {
    throw new Error('Announcement title is required.')
  }
  if (!description || !description.trim()) {
    throw new Error('Announcement message is required.')
  }
  if (!publishedBy) {
    throw new Error('Publisher identity is required.')
  }

  const now = new Date()
  const payload = {
    title: title.trim(),
    description: description.trim(),
    category,
    priority: priority || (category === 'Urgent Notice' ? 'Urgent' : 'Normal'),
    publication_date: now.toISOString().split('T')[0],
    published_at: now.toISOString(),
    is_published: true,
    published_by: publishedBy,
    subject_id: subjectId || null,
    expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null,
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert([payload])
    .select()
    .single()

  if (error) throw error

  dispatchNotificationUpdate()
  return data
}

/**
 * Delete an announcement (Admin or Creator)
 */
export async function deleteAnnouncement(notificationId) {
  if (!notificationId) return { success: false }

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)

  if (error) throw error

  dispatchNotificationUpdate()
  return { success: true }
}
