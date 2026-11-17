import { useState, useEffect, useCallback } from 'react'
import Navbar from '../../components/Navbar'
import AlertBanner from '../../components/AlertBanner'
import DeleteDraftSessionModal from '../../components/DeleteDraftSessionModal'
import CreateAnnouncementModal from '../../components/CreateAnnouncementModal'
import NotificationDetailModal from '../../components/NotificationDetailModal'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  fetchFacultyAnnouncements,
  deleteAnnouncement,
  CATEGORY_STYLES,
} from '../../services/notificationService'
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  XCircle,
  Play,
  Check,
  RefreshCw,
  PlusCircle,
  FileCheck2,
  UserCheck,
  Trash2,
  Megaphone,
  Flame,
  Clock,
} from 'lucide-react'

export default function FacultyDashboard() {
  const { user, profile } = useAuth()

  // Faculty record
  const [facultyRecord, setFacultyRecord] = useState(null)
  const [allocatedSubjects, setAllocatedSubjects] = useState([])
  const [loadingInitial, setLoadingInitial] = useState(true)

  // Announcements State
  const [announcements, setAnnouncements] = useState([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false)
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null)
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState(null)

  // Attendance Workflow State
  const [activeSession, setActiveSession] = useState(null)
  const [sessionSubject, setSessionSubject] = useState(null)
  const [studentsRoster, setStudentsRoster] = useState([])
  const [attendanceMap, setAttendanceMap] = useState({}) // studentId -> 'present' | 'absent'
  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)
  const [statusSuccess, setStatusSuccess] = useState(null)
  const [statusError, setStatusError] = useState(null)

  // Draft deletion modal state
  const [deleteTargetSession, setDeleteTargetSession] = useState(null)
  const [deletingDraft, setDeletingDraft] = useState(false)
  const [deleteModalError, setDeleteModalError] = useState(null)

  // Sessions History
  const [recentSessions, setRecentSessions] = useState([])

  // Load faculty's announcements
  const loadAnnouncements = useCallback(async () => {
    if (!user?.id) return
    setLoadingAnnouncements(true)
    try {
      const { data, error } = await fetchFacultyAnnouncements(user.id)
      if (!error && data) {
        setAnnouncements(data)
      }
    } catch (err) {
      console.error('Error loading announcements:', err)
    } finally {
      setLoadingAnnouncements(false)
    }
  }, [user])

  const handleDeleteAnnouncement = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this announcement?')) return
    setDeletingAnnouncementId(id)
    try {
      await deleteAnnouncement(id)
      setAnnouncements((prev) => prev.filter((a) => a.id !== id))
      setStatusSuccess('Announcement deleted successfully.')
    } catch (err) {
      setStatusError(`Failed to delete announcement: ${err.message}`)
    } finally {
      setDeletingAnnouncementId(null)
    }
  }

  // Load faculty record and allocated subjects
  const loadFacultyData = useCallback(async (showLoading = false) => {
    if (!user) return
    if (showLoading) setLoadingInitial(true)
    try {
      // 1. Fetch faculty profile
      const { data: faculty, error: facultyErr } = await supabase
        .from('faculty')
        .select('id, employee_id, full_name, email, is_active')
        .eq('profile_id', user.id)
        .maybeSingle()

      if (facultyErr) throw facultyErr

      setFacultyRecord(faculty)

      if (faculty) {
        // 2. Fetch allocated active subjects for this faculty member
        const { data: allocations, error: allocErr } = await supabase
          .from('faculty_subjects')
          .select('subject_id, subjects(id, subject_code, subject_name, description, is_active)')
          .eq('faculty_id', faculty.id)
          .eq('is_active', true)

        if (!allocErr && allocations) {
          const subjects = allocations
            .map((a) => a.subjects)
            .filter((s) => s && s.is_active !== false)
            .sort((a, b) => (a.subject_code || '').localeCompare(b.subject_code || ''))
          setAllocatedSubjects(subjects)
          setSessionSubject((prev) => subjects.find((s) => s.id === prev?.id) || subjects[0] || null)
        }

        // 3. Fetch active classroom students roster
        const { data: students, error: studentErr } = await supabase
          .from('students')
          .select('id, roll_number, full_name, is_active')
          .eq('is_active', true)
          .eq('is_archived', false)
          .order('roll_number', { ascending: true })

        if (!studentErr && students) {
          setStudentsRoster(students)
        }

        // 4. Fetch recent sessions
        const { data: sessions, error: sessErr } = await supabase
          .from('attendance_sessions')
          .select('id, session_date, session_number, status, started_at, finalized_at, subjects(subject_code, subject_name)')
          .eq('faculty_id', faculty.id)
          .order('created_at', { ascending: false })
          .limit(10)

        if (!sessErr && sessions) {
          setRecentSessions(sessions)
        }

        // 5. Fetch published announcements
        await loadAnnouncements()
      }
    } catch (err) {
      console.error('Error loading faculty data:', err)
      setStatusError(`Failed to load faculty information: ${err.message}`)
    } finally {
      setLoadingInitial(false)
    }
  }, [user, loadAnnouncements])

  useEffect(() => {
    let ignore = false

    async function initFaculty() {
      if (!user) return
      try {
        const { data: faculty } = await supabase
          .from('faculty')
          .select('id, employee_id, full_name, email, is_active')
          .eq('profile_id', user.id)
          .maybeSingle()

        if (!ignore && faculty) {
          setFacultyRecord(faculty)

          const [
            { data: allocations },
            { data: students },
            { data: sessions },
          ] = await Promise.all([
            supabase
              .from('faculty_subjects')
              .select('subject_id, subjects(id, subject_code, subject_name, description, is_active)')
              .eq('faculty_id', faculty.id)
              .eq('is_active', true),
            supabase
              .from('students')
              .select('id, roll_number, full_name, is_active')
              .eq('is_active', true)
              .eq('is_archived', false)
              .order('roll_number', { ascending: true }),
            supabase
              .from('attendance_sessions')
              .select('id, session_date, session_number, status, started_at, finalized_at, subjects(subject_code, subject_name)')
              .eq('faculty_id', faculty.id)
              .order('created_at', { ascending: false })
              .limit(10),
          ])

          if (!ignore) {
            if (allocations) {
              const subjects = allocations
                .map((a) => a.subjects)
                .filter((s) => s && s.is_active !== false)
                .sort((a, b) => (a.subject_code || '').localeCompare(b.subject_code || ''))
              setAllocatedSubjects(subjects)
              setSessionSubject((prev) => subjects.find((s) => s.id === prev?.id) || subjects[0] || null)
            }
            if (students) setStudentsRoster(students)
            if (sessions) setRecentSessions(sessions)
            loadAnnouncements()
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (!ignore) setLoadingInitial(false)
      }
    }

    initFaculty()
    return () => { ignore = true }
  }, [user, loadAnnouncements])

  // Load existing records for the current session
  const loadSessionRecords = async (sessionId) => {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('student_id, status')
      .eq('session_id', sessionId)

    if (error) {
      throw error
    }

    const map = {}
    ;(data || []).forEach((r) => {
      map[r.student_id] = r.status
    })
    setAttendanceMap(map)
    return map
  }

  // 1. Create Draft Session
  const handleCreateDraftSession = async () => {
    if (!facultyRecord || !sessionSubject) {
      setStatusMessage(null)
      setStatusError('Please ensure a faculty record and subject are selected.')
      return
    }

    setBusy(true)
    setStatusError(null)
    setStatusSuccess(null)
    setStatusMessage('Creating draft attendance session...')

    try {
      const today = new Date().toISOString().split('T')[0]

      // Check existing session numbers for today
      const { data: existing, error: existErr } = await supabase
        .from('attendance_sessions')
        .select('session_number')
        .eq('subject_id', sessionSubject.id)
        .eq('session_date', today)
        .order('session_number', { ascending: false })
        .limit(1)

      if (existErr) throw existErr

      const nextNumber = existing?.length ? existing[0].session_number + 1 : 1

      const { data: newSession, error: createErr } = await supabase
        .from('attendance_sessions')
        .insert({
          faculty_id: facultyRecord.id,
          subject_id: sessionSubject.id,
          session_date: today,
          session_number: nextNumber,
          status: 'draft',
        })
        .select()
        .single()

      if (createErr) throw createErr

      setActiveSession(newSession)
      setAttendanceMap({})
      setStatusMessage(
        `Draft Session #${nextNumber} created for ${sessionSubject.subject_code} (${sessionSubject.subject_name}). Next: Start session to record attendance.`
      )
      await loadFacultyData(false)
    } catch (err) {
      setStatusMessage(null)
      setStatusError(`Error creating session: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // 2. Start Session
  const handleStartSession = async () => {
    if (!activeSession) return

    setBusy(true)
    setStatusError(null)
    setStatusSuccess(null)
    setStatusMessage('Starting attendance session...')

    try {
      const { error } = await supabase.rpc('start_attendance_session', {
        target_session_id: activeSession.id,
      })

      if (error) throw error

      setActiveSession((prev) => ({ ...prev, status: 'in_progress', started_at: new Date().toISOString() }))
      setStatusMessage('Attendance session started. You can now mark student attendance.')
      await loadFacultyData(false)
    } catch (err) {
      setStatusMessage(null)
      setStatusError(`Failed to start session: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // 3. Mark Single Student
  const handleMarkStudent = async (studentId, status) => {
    if (!activeSession || activeSession.status !== 'in_progress' || !user) return

    setBusy(true)
    setStatusError(null)
    setStatusSuccess(null)
    setStatusMessage(null)

    try {
      const { error } = await supabase.from('attendance_records').upsert(
        {
          session_id: activeSession.id,
          student_id: studentId,
          status,
          marked_by: user.id,
        },
        { onConflict: 'session_id,student_id' }
      )

      if (error) throw error

      await loadSessionRecords(activeSession.id)
      const studentInfo = studentsRoster.find((s) => s.id === studentId)
      const label = studentInfo ? `${studentInfo.roll_number} (${studentInfo.full_name})` : 'Student'
      setStatusMessage(`${label} marked ${status.toUpperCase()}.`)
    } catch (err) {
      setStatusMessage(null)
      setStatusError(`Failed to record attendance: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Quick: Mark All Students Present / Absent
  const handleMarkAll = async (status) => {
    if (!activeSession || activeSession.status !== 'in_progress' || !user || !studentsRoster.length) return

    setBusy(true)
    setStatusError(null)
    setStatusSuccess(null)
    setStatusMessage(`Marking all active students as ${status.toUpperCase()}...`)

    try {
      const records = studentsRoster.map((student) => ({
        session_id: activeSession.id,
        student_id: student.id,
        status,
        marked_by: user.id,
      }))

      const { error } = await supabase.from('attendance_records').upsert(records, {
        onConflict: 'session_id,student_id',
      })

      if (error) throw error

      await loadSessionRecords(activeSession.id)
      setStatusMessage(`All ${studentsRoster.length} active students marked ${status.toUpperCase()}.`)
    } catch (err) {
      setStatusMessage(null)
      setStatusError(`Error marking bulk attendance: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // 4. Finalize Attendance Session
  const handleFinalizeSession = async () => {
    if (!activeSession) return

    const markedCount = Object.keys(attendanceMap).length
    const totalCount = studentsRoster.length

    if (markedCount < totalCount) {
      setStatusMessage(null)
      setStatusError(
        `Roster validation requirement: Attendance must be marked for all ${totalCount} active students before finalization. Currently marked: ${markedCount}.`
      )
      return
    }

    if (!window.confirm('Finalize this attendance session? Once finalized, records become immutable and can only be altered through audited administrator correction.')) {
      return
    }

    setBusy(true)
    setStatusError(null)
    setStatusSuccess(null)
    setStatusMessage('Validating roster and finalizing session...')

    try {
      const { error } = await supabase.rpc('finalize_attendance_session', {
        target_session_id: activeSession.id,
      })

      if (error) throw error

      setActiveSession((prev) => ({
        ...prev,
        status: 'finalized',
        finalized_at: new Date().toISOString(),
      }))
      setStatusMessage(
        `Session successfully finalized and locked! Verified against all ${totalCount} active students.`
      )
      await loadFacultyData(false)
    } catch (err) {
      setStatusMessage(null)
      setStatusError(`Finalization failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Select an existing session to resume or view
  const handleSelectSession = async (sess) => {
    setActiveSession(sess)
    setStatusError(null)
    setStatusSuccess(null)
    try {
      await loadSessionRecords(sess.id)
      setStatusMessage(`Loaded session #${sess.session_number} (${sess.status})`)
    } catch (err) {
      setStatusMessage(null)
      setStatusError(`Failed to load session attendance records: ${err.message}`)
    }
  }

  // Open confirmation modal for deleting a draft session
  const handleRequestDeleteDraft = (e, sess) => {
    e.stopPropagation()
    if (!sess || sess.status !== 'draft' || deletingDraft) return
    setDeleteModalError(null)
    setDeleteTargetSession(sess)
  }

  // Confirm transactional draft session deletion via server-side RPC
  const handleConfirmDeleteDraft = async (sessionToDelete) => {
    if (!sessionToDelete || deletingDraft) return

    setDeletingDraft(true)
    setDeleteModalError(null)
    setStatusError(null)
    setStatusSuccess(null)
    setStatusMessage(null)

    try {
      const { data, error } = await supabase.rpc('delete_draft_attendance_session', {
        target_session_id: sessionToDelete.id,
      })

      if (error) throw error

      if (activeSession?.id === sessionToDelete.id) {
        setActiveSession(null)
        setAttendanceMap({})
      }

      setDeleteTargetSession(null)
      const subjectLabel = sessionToDelete.subjects?.subject_code || 'Subject'
      const deletedDraftCount = data?.deletedDraftRecordsCount || 0
      setStatusSuccess(
        `Draft Session #${sessionToDelete.session_number} (${subjectLabel}, ${sessionToDelete.session_date}) deleted permanently${
          deletedDraftCount > 0
            ? ` along with ${deletedDraftCount} draft attendance record${deletedDraftCount > 1 ? 's' : ''}`
            : ''
        }.`
      )
      await loadFacultyData(false)
    } catch (err) {
      const msg = err?.message || 'Unable to delete draft session.'
      setDeleteModalError(`Failed to delete draft session: ${msg}`)
      setStatusError(`Failed to delete draft session: ${msg}`)
      await loadFacultyData(false)
    } finally {
      setDeletingDraft(false)
    }
  }

  const markedCount = Object.keys(attendanceMap).length
  const presentCount = Object.values(attendanceMap).filter((s) => s === 'present').length
  const absentCount = Object.values(attendanceMap).filter((s) => s === 'absent').length

  const finalizedSessionsCount = recentSessions.filter((s) => s.status === 'finalized').length
  const draftSessionsCount = recentSessions.filter((s) => s.status === 'draft').length

  return (
    <div className="min-h-screen bg-[#F5F6F3] text-[#252B27]">
      <Navbar />

      <main className="md:pl-64 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* Page Header (Donezo Template Format) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#252B27]">
                Dashboard
              </h1>
              <span className="rounded-full bg-[#EAF3ED] border border-[#21845A]/20 px-2.5 py-0.5 text-xs font-semibold text-[#145C3A]">
                Faculty Portal
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-[#78817B]">
              Welcome back, {profile?.full_name || facultyRecord?.full_name || 'Faculty Member'}! Record lecture attendance, manage draft sessions, and broadcast circulars.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setAnnouncementModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#145C3A] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#21845A] shadow-sm transition-colors"
            >
              <Megaphone className="h-4 w-4" />
              <span>Post Announcement</span>
            </button>

            <button
              type="button"
              onClick={() => loadFacultyData(false)}
              className="inline-flex items-center gap-2 rounded-full border border-[#E8ECE7] bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#252B27] hover:bg-[#F5F6F3] shadow-sm transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#78817B]" />
              <span>Refresh Roster</span>
            </button>
          </div>
        </div>

        {/* Top 4 KPI Metrics Grid (Donezo Pattern) */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Hero Deep Forest Green Card */}
          <div className="rounded-2xl bg-[#145C3A] text-white p-5 sm:p-6 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/90">
                Finalized Sessions
              </span>
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <Play className="h-4 w-4 fill-white" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                {finalizedSessionsCount}
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#21845A] px-2.5 py-0.5 text-[11px] font-semibold text-white/95">
                <CheckCircle2 className="h-3 w-3" />
                <span>Locked in curriculum</span>
              </span>
            </div>
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
          </div>

          {/* Card 2: White Card - Allocated Subjects */}
          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#78817B]">
                Allocated Subjects
              </span>
              <div className="h-8 w-8 rounded-full border border-[#E8ECE7] flex items-center justify-center text-[#78817B]">
                <BookOpen className="h-4 w-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-3xl sm:text-4xl font-bold text-[#252B27] tracking-tight">
                {allocatedSubjects.length}
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF3ED] px-2.5 py-0.5 text-[11px] font-semibold text-[#145C3A]">
                <Award className="h-3 w-3" />
                <span>Active teaching courses</span>
              </span>
            </div>
          </div>

          {/* Card 3: White Card - Active Roster */}
          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#78817B]">
                Classroom Roster
              </span>
              <div className="h-8 w-8 rounded-full border border-[#E8ECE7] flex items-center justify-center text-[#78817B]">
                <UserCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-3xl sm:text-4xl font-bold text-[#252B27] tracking-tight">
                {studentsRoster.length}
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F6F3] border border-[#E8ECE7] px-2.5 py-0.5 text-[11px] font-semibold text-[#78817B]">
                <Calendar className="h-3 w-3" />
                <span>Enrolled students</span>
              </span>
            </div>
          </div>

          {/* Card 4: White Card - Draft Sessions */}
          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#78817B]">
                Draft Sessions Pending
              </span>
              <div className="h-8 w-8 rounded-full border border-[#E8ECE7] flex items-center justify-center text-[#78817B]">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-3xl sm:text-4xl font-bold text-[#252B27] tracking-tight">
                {draftSessionsCount}
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                <span>Requires finalization</span>
              </span>
            </div>
          </div>
        </div>

        {/* Allocated Subjects Pill List Card */}
        <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#78817B]">
              Select Allocated Teaching Course:
            </span>
            {facultyRecord?.employee_id && (
              <span className="font-mono text-xs text-[#78817B]">
                Employee ID: <strong className="text-[#252B27]">{facultyRecord.employee_id}</strong>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {allocatedSubjects.length === 0 ? (
              <span className="text-xs text-[#78817B] py-1">
                No allocated subjects found. Contact administration for subject assignment.
              </span>
            ) : (
              allocatedSubjects.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSessionSubject(sub)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    sessionSubject?.id === sub.id
                      ? 'bg-[#145C3A] text-white shadow-sm'
                      : 'border border-[#E8ECE7] bg-[#F5F6F3] text-[#252B27] hover:bg-white hover:border-[#145C3A]/30'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>
                    {sub.subject_code} — {sub.subject_name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Notifications / Alerts */}
        <div className="space-y-3">
          {statusError && (
            <AlertBanner
              type="error"
              message={statusError}
              onClose={() => setStatusError(null)}
            />
          )}
          {statusSuccess && (
            <AlertBanner
              type="success"
              message={statusSuccess}
              onClose={() => setStatusSuccess(null)}
            />
          )}
          {statusMessage && (
            <AlertBanner
              type="info"
              message={statusMessage}
              onClose={() => setStatusMessage(null)}
            />
          )}
        </div>

        {/* Main Grid: Attendance Session Lifecycle & Recent History */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left 2 Cols: Active Attendance Workflow */}
          <div id="attendance-workspace" className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8ECE7] pb-4">
                <div>
                  <h2 className="text-lg font-bold text-[#252B27] flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-[#145C3A]" />
                    <span>Attendance Lifecycle Manager</span>
                  </h2>
                  <p className="text-xs text-[#78817B]">
                    Draft, record, and finalize classroom attendance with automatic active roster validation.
                  </p>
                </div>

                {activeSession && (
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      activeSession.status === 'finalized'
                        ? 'bg-[#EAF3ED] text-[#145C3A] border border-[#21845A]/30'
                        : activeSession.status === 'in_progress'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {activeSession.status.replace('_', ' ')}
                  </span>
                )}
              </div>

              {/* Action Buttons Row */}
              <div className="mt-5 flex flex-wrap gap-2.5">
                {!activeSession ? (
                  <button
                    type="button"
                    onClick={handleCreateDraftSession}
                    disabled={busy || !sessionSubject}
                    className="inline-flex items-center gap-2 rounded-full bg-[#145C3A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#21845A] disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Create Draft Session ({sessionSubject?.subject_code || 'Select Subject'})</span>
                  </button>
                ) : activeSession.status === 'draft' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleStartSession}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-full bg-[#145C3A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#21845A] disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <Play className="h-4 w-4 fill-white" />
                      <span>Start Session #{activeSession.session_number}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSession(null)}
                      className="rounded-full border border-[#E8ECE7] bg-white px-4 py-2.5 text-xs font-semibold text-[#252B27] hover:bg-[#F5F6F3]"
                    >
                      Cancel Draft
                    </button>
                  </>
                ) : activeSession.status === 'in_progress' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleMarkAll('present')}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#21845A]/30 bg-[#EAF3ED] px-4 py-2 text-xs font-semibold text-[#145C3A] hover:bg-[#145C3A] hover:text-white disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Mark All Present</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMarkAll('absent')}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-[#DC2626] hover:text-white disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Mark All Absent</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleFinalizeSession}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-full bg-[#145C3A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#21845A] disabled:opacity-50 ml-auto shadow-sm transition-colors"
                    >
                      <FileCheck2 className="h-4 w-4" />
                      <span>Finalize Attendance</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs text-[#145C3A] font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Attendance Finalized &amp; Locked</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSession(null)
                        setAttendanceMap({})
                      }}
                      className="rounded-full border border-[#E8ECE7] bg-white px-4 py-2 text-xs font-semibold text-[#252B27] hover:bg-[#F5F6F3] shadow-sm"
                    >
                      Start New Session
                    </button>
                  </div>
                )}
              </div>

              {/* Progress Summary if Session Active */}
              {activeSession && (
                <div className="mt-5 rounded-2xl border border-[#E8ECE7] bg-[#F5F6F3]/50 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#78817B]">Classroom Roster Marked:</span>
                    <span className="font-bold text-[#252B27]">
                      {markedCount} / {studentsRoster.length} Students
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#E8ECE7]">
                    <div
                      className="h-full bg-[#145C3A] transition-all duration-300 rounded-full"
                      style={{
                        width: `${studentsRoster.length ? (markedCount / studentsRoster.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-[#145C3A]">Present: {presentCount}</span>
                    <span className="text-[#DC2626]">Absent: {absentCount}</span>
                    <span className="text-amber-700">
                      Unmarked: {Math.max(0, studentsRoster.length - markedCount)}
                    </span>
                  </div>
                </div>
              )}

              {/* Student Roster Marking Table */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-[#E8ECE7] bg-white">
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-[#E8ECE7] text-left text-xs text-[#252B27]">
                    <thead className="sticky top-0 bg-[#F5F6F3] uppercase tracking-wider text-[#78817B] font-semibold z-10">
                      <tr>
                        <th className="px-4 py-3">Roll No.</th>
                        <th className="px-4 py-3">Student Name</th>
                        <th className="px-4 py-3 text-right">Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8ECE7] font-normal">
                      {loadingInitial ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-[#78817B]">
                            Loading classroom roster...
                          </td>
                        </tr>
                      ) : studentsRoster.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-[#78817B]">
                            No active students in classroom roster.
                          </td>
                        </tr>
                      ) : (
                        studentsRoster.map((student) => {
                          const currentStatus = attendanceMap[student.id]
                          return (
                            <tr key={student.id} className="hover:bg-[#F5F6F3]/50 transition-colors">
                              <td className="px-4 py-3 font-mono font-bold text-[#145C3A]">
                                {student.roll_number}
                              </td>
                              <td className="px-4 py-3 font-semibold text-[#252B27]">
                                {student.full_name}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {activeSession?.status === 'in_progress' ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleMarkStudent(student.id, 'present')}
                                      disabled={busy}
                                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                                        currentStatus === 'present'
                                          ? 'bg-[#145C3A] text-white shadow-sm'
                                          : 'border border-[#E8ECE7] bg-white text-[#78817B] hover:bg-[#EAF3ED] hover:text-[#145C3A]'
                                      }`}
                                    >
                                      Present
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMarkStudent(student.id, 'absent')}
                                      disabled={busy}
                                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                                        currentStatus === 'absent'
                                          ? 'bg-[#DC2626] text-white shadow-sm'
                                          : 'border border-[#E8ECE7] bg-white text-[#78817B] hover:bg-rose-50 hover:text-rose-700'
                                      }`}
                                    >
                                      Absent
                                    </button>
                                  </div>
                                ) : currentStatus ? (
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                                      currentStatus === 'present'
                                        ? 'bg-[#EAF3ED] text-[#145C3A] border border-[#21845A]/30'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}
                                  >
                                    {currentStatus}
                                  </span>
                                ) : (
                                  <span className="text-[#78817B]">Pending</span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Right Col: Recent Sessions History */}
          <div className="space-y-6">
            <div id="recent-sessions" className="rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8ECE7] pb-3">
                <h3 className="text-sm font-bold text-[#252B27] flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#145C3A]" />
                  <span>Recent Lecture Sessions</span>
                </h3>
                <span className="text-xs text-[#78817B] font-medium">
                  {recentSessions.length} Recorded
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {recentSessions.length === 0 ? (
                  <p className="text-xs text-[#78817B] text-center py-6">
                    No previous sessions recorded.
                  </p>
                ) : (
                  recentSessions.map((sess) => (
                    <div
                      key={sess.id}
                      onClick={() => handleSelectSession(sess)}
                      className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${
                        activeSession?.id === sess.id
                          ? 'border-[#145C3A] bg-[#EAF3ED]/40 shadow-sm'
                          : 'border-[#E8ECE7] bg-white hover:border-[#145C3A]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#252B27]">
                        <span className="truncate font-mono font-bold text-[#145C3A]">
                          {sess.subjects?.subject_code || 'Subject'}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                              sess.status === 'finalized'
                                ? 'bg-[#EAF3ED] text-[#145C3A] border border-[#21845A]/30'
                                : sess.status === 'in_progress'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {sess.status.replace('_', ' ')}
                          </span>
                          {sess.status === 'draft' && (
                            <button
                              type="button"
                              onClick={(e) => handleRequestDeleteDraft(e, sess)}
                              disabled={busy || deletingDraft}
                              title="Delete Draft Session"
                              aria-label={`Delete draft session ${sess.subjects?.subject_code || ''} #${sess.session_number}`}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-50 text-[#DC2626] hover:bg-red-100 disabled:opacity-50 transition-colors shadow-sm"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#78817B]">
                        <span>Date: {sess.session_date}</span>
                        <span className="font-mono">Session #{sess.session_number}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* My Published Announcements Card */}
            <div id="announcements-section" className="rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8ECE7] pb-3">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-[#145C3A]" />
                  <h3 className="text-sm font-bold text-[#252B27]">
                    My Published Announcements Card
                  </h3>
                  <span className="rounded-full bg-[#EAF3ED] px-2 py-0.5 text-[10px] font-bold text-[#145C3A]">
                    {announcements.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setAnnouncementModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-[#145C3A] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#21845A] transition-colors shadow-sm"
                >
                  <PlusCircle className="h-3 w-3" />
                  <span>New</span>
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {loadingAnnouncements ? (
                  <p className="text-xs text-[#78817B] text-center py-6">
                    Loading announcements...
                  </p>
                ) : announcements.length === 0 ? (
                  <div className="text-center py-6">
                    <Megaphone className="mx-auto h-6 w-6 text-[#78817B] mb-1" />
                    <p className="text-xs text-[#252B27] font-semibold">No announcements published yet</p>
                    <p className="text-[11px] text-[#78817B] mt-0.5">
                      Click &quot;New&quot; to publish a classroom or academic notice.
                    </p>
                  </div>
                ) : (
                  announcements.map((ann) => {
                    const catStyle = CATEGORY_STYLES[ann.category] || CATEGORY_STYLES['General Announcement']
                    const isUrgent = ann.priority === 'Urgent' || ann.category === 'Urgent Notice'

                    return (
                      <div
                        key={ann.id}
                        onClick={() => setSelectedAnnouncement(ann)}
                        className="group cursor-pointer rounded-2xl border border-[#E8ECE7] bg-white p-3.5 hover:border-[#145C3A]/40 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold border ${catStyle.badge}`}>
                                {ann.category}
                              </span>
                              {isUrgent && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-1.5 py-0.5 font-bold uppercase text-rose-700 border border-rose-200">
                                  <Flame className="h-2.5 w-2.5" />
                                  Urgent
                                </span>
                              )}
                              {ann.subjects && (
                                <span className="rounded-full bg-[#F5F6F3] border border-[#E8ECE7] px-2 py-0.5 font-mono text-[#252B27]">
                                  {ann.subjects.subject_code}
                                </span>
                              )}
                            </div>
                            <h4 className="mt-1.5 text-xs font-bold text-[#252B27] group-hover:text-[#145C3A] transition-colors truncate">
                              {ann.title}
                            </h4>
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-[#78817B]">
                              {ann.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleDeleteAnnouncement(e, ann.id)}
                              disabled={deletingAnnouncementId === ann.id}
                              title="Delete Announcement"
                              className="rounded-full p-1.5 text-[#78817B] hover:bg-red-50 hover:text-[#DC2626] transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[10px] text-[#78817B] border-t border-[#E8ECE7] pt-1.5">
                          <span>{ann.publication_date || 'Date'}</span>
                          <span>{ann.relative_time}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <DeleteDraftSessionModal
        isOpen={Boolean(deleteTargetSession)}
        session={deleteTargetSession}
        deleting={deletingDraft}
        error={deleteModalError}
        onClose={() => {
          if (!deletingDraft) {
            setDeleteTargetSession(null)
            setDeleteModalError(null)
          }
        }}
        onConfirm={handleConfirmDeleteDraft}
      />

      <CreateAnnouncementModal
        isOpen={announcementModalOpen}
        onClose={() => setAnnouncementModalOpen(false)}
        currentUser={user}
        subjects={allocatedSubjects}
        defaultSubjectId={sessionSubject?.id}
        onSuccess={() => {
          setStatusSuccess('Announcement published successfully!')
          loadAnnouncements()
        }}
      />

      <NotificationDetailModal
        isOpen={Boolean(selectedAnnouncement)}
        notification={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </div>
  )
}
