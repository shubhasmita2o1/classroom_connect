import { useState, useEffect, useCallback } from 'react'
import Navbar from '../../components/Navbar'
import AlertBanner from '../../components/AlertBanner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
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
} from 'lucide-react'

export default function FacultyDashboard() {
  const { user, profile } = useAuth()

  // Faculty record
  const [facultyRecord, setFacultyRecord] = useState(null)
  const [allocatedSubjects, setAllocatedSubjects] = useState([])
  const [loadingInitial, setLoadingInitial] = useState(true)

  // Attendance Workflow State
  const [activeSession, setActiveSession] = useState(null)
  const [sessionSubject, setSessionSubject] = useState(null)
  const [studentsRoster, setStudentsRoster] = useState([])
  const [attendanceMap, setAttendanceMap] = useState({}) // studentId -> 'present' | 'absent'
  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)
  const [statusError, setStatusError] = useState(null)

  // Sessions History
  const [recentSessions, setRecentSessions] = useState([])

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
        // 2. Fetch allocated subjects
        const { data: allocations, error: allocErr } = await supabase
          .from('faculty_subjects')
          .select('subject_id, subjects(id, subject_code, subject_name, description)')
          .eq('faculty_id', faculty.id)
          .eq('is_active', true)

        if (!allocErr && allocations) {
          const subjects = allocations.map((a) => a.subjects).filter(Boolean)
          setAllocatedSubjects(subjects)
          if (subjects.length > 0) {
            setSessionSubject((prev) => prev || subjects[0])
          }
        }

        // 3. Fetch active classroom students roster
        const { data: students, error: studentErr } = await supabase
          .from('students')
          .select('id, roll_number, full_name, is_active')
          .eq('is_active', true)
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
      }
    } catch (err) {
      console.error('Error loading faculty data:', err)
      setStatusError(`Failed to load faculty information: ${err.message}`)
    } finally {
      setLoadingInitial(false)
    }
  }, [user])

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
              .select('subject_id, subjects(id, subject_code, subject_name, description)')
              .eq('faculty_id', faculty.id)
              .eq('is_active', true),
            supabase
              .from('students')
              .select('id, roll_number, full_name, is_active')
              .eq('is_active', true)
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
              const subjects = allocations.map((a) => a.subjects).filter(Boolean)
              setAllocatedSubjects(subjects)
              if (subjects.length > 0) {
                setSessionSubject((prev) => prev || subjects[0])
              }
            }
            if (students) setStudentsRoster(students)
            if (sessions) setRecentSessions(sessions)
            setLoadingInitial(false)
          }
        }
      } catch (err) {
        console.error(err)
        if (!ignore) setLoadingInitial(false)
      }
    }

    initFaculty()
    return () => { ignore = true }
  }, [user])

  // Load existing records for the current session
  const loadSessionRecords = async (sessionId) => {
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('student_id, status')
        .eq('session_id', sessionId)

      if (!error && data) {
        const map = {}
        data.forEach((r) => {
          map[r.student_id] = r.status
        })
        setAttendanceMap(map)
      }
    } catch (err) {
      console.error('Error loading attendance records:', err)
    }
  }

  // 1. Create Draft Session
  const handleCreateDraftSession = async () => {
    if (!facultyRecord || !sessionSubject) {
      setStatusError('Please ensure a faculty record and subject are selected.')
      return
    }

    setBusy(true)
    setStatusError(null)
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
      await loadFacultyData()
    } catch (err) {
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
    setStatusMessage('Starting attendance session...')

    try {
      const { error } = await supabase.rpc('start_attendance_session', {
        target_session_id: activeSession.id,
      })

      if (error) throw error

      setActiveSession((prev) => ({ ...prev, status: 'in_progress', started_at: new Date().toISOString() }))
      setStatusMessage('Attendance session started. You can now mark student attendance.')
      await loadFacultyData()
    } catch (err) {
      setStatusError(`Failed to start session: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // 3. Mark Single Student
  const handleMarkStudent = async (studentId, status) => {
    if (!activeSession || activeSession.status === 'finalized' || !user) return

    setBusy(true)
    setStatusError(null)

    try {
      // Upsert attendance record
      const { error } = await supabase.from('attendance_records').upsert(
        {
          session_id: activeSession.id,
          student_id: studentId,
          status: status,
          marked_by: user.id,
        },
        { onConflict: 'session_id, student_id' }
      )

      if (error) throw error

      setAttendanceMap((prev) => ({ ...prev, [studentId]: status }))
    } catch (err) {
      setStatusError(`Failed to record attendance: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Quick: Mark All Students Present
  const handleMarkAll = async (status) => {
    if (!activeSession || activeSession.status === 'finalized' || !user || !studentsRoster.length) return

    setBusy(true)
    setStatusError(null)
    setStatusMessage(`Marking all active students as ${status.toUpperCase()}...`)

    try {
      const records = studentsRoster.map((student) => ({
        session_id: activeSession.id,
        student_id: student.id,
        status: status,
        marked_by: user.id,
      }))

      const { error } = await supabase.from('attendance_records').upsert(records, {
        onConflict: 'session_id, student_id',
      })

      if (error) throw error

      const newMap = {}
      studentsRoster.forEach((s) => {
        newMap[s.id] = status
      })
      setAttendanceMap(newMap)
      setStatusMessage(`All ${studentsRoster.length} students marked ${status.toUpperCase()}.`)
    } catch (err) {
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
      await loadFacultyData()
    } catch (err) {
      setStatusError(`Finalization failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Select an existing session to resume or view
  const handleSelectSession = async (sess) => {
    setActiveSession(sess)
    await loadSessionRecords(sess.id)
    setStatusMessage(`Loaded session #${sess.session_number} (${sess.status})`)
    setStatusError(null)
  }

  const markedCount = Object.keys(attendanceMap).length
  const presentCount = Object.values(attendanceMap).filter((s) => s === 'present').length
  const absentCount = Object.values(attendanceMap).filter((s) => s === 'absent').length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Faculty Header Card */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                <Award className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-950 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-emerald-400 border border-emerald-800">
                    Faculty Portal
                  </span>
                  {facultyRecord?.employee_id && (
                    <span className="text-xs font-mono text-slate-400">
                      ID: {facultyRecord.employee_id}
                    </span>
                  )}
                </div>
                <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
                  {profile?.full_name || facultyRecord?.full_name || 'Faculty Member'}
                </h1>
                <p className="text-xs text-slate-400">
                  Department of Computer Science & Engineering • Classroom Connect
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadFacultyData}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Roster</span>
            </button>
          </div>

          {/* Allocated Subjects Pill List */}
          <div className="mt-6 border-t border-slate-800/80 pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Allocated Teaching Subjects:
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {allocatedSubjects.length === 0 ? (
                <span className="text-xs text-slate-500">
                  No allocated subjects found. Contact administration for subject assignment.
                </span>
              ) : (
                allocatedSubjects.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSessionSubject(sub)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      sessionSubject?.id === sub.id
                        ? 'border-blue-500 bg-blue-950/60 text-blue-300'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <BookOpen className="h-3.5 w-3.5 text-blue-400" />
                    <span>
                      {sub.subject_code} — {sub.subject_name}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Notifications / Alerts */}
        <div className="mt-6 space-y-3">
          {statusError && (
            <AlertBanner
              type="error"
              message={statusError}
              onClose={() => setStatusError(null)}
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
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left 2 Cols: Active Attendance Workflow */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-emerald-400" />
                    <span>Attendance Lifecycle Manager</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Draft, take, and finalize classroom attendance with automatic active roster validation.
                  </p>
                </div>

                {activeSession && (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
                      activeSession.status === 'finalized'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : activeSession.status === 'in_progress'
                        ? 'bg-blue-950 text-blue-300 border border-blue-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {activeSession.status.replace('_', ' ')}
                  </span>
                )}
              </div>

              {/* Action Buttons Row */}
              <div className="mt-5 flex flex-wrap gap-3">
                {!activeSession ? (
                  <button
                    type="button"
                    onClick={handleCreateDraftSession}
                    disabled={busy || !sessionSubject}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm"
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
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <Play className="h-4 w-4" />
                      <span>Start Session #{activeSession.session_number}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSession(null)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Mark All Present</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMarkAll('absent')}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-800 bg-rose-950/60 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Mark All Absent</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleFinalizeSession}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 ml-auto shadow-sm"
                    >
                      <FileCheck2 className="h-4 w-4" />
                      <span>Finalize Attendance</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Attendance Finalized & Locked</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSession(null)
                        setAttendanceMap({})
                      }}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
                    >
                      Start New Session
                    </button>
                  </div>
                )}
              </div>

              {/* Progress Summary if Session Active */}
              {activeSession && (
                <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Classroom Roster Marked:</span>
                    <span className="font-semibold text-white">
                      {markedCount} / {studentsRoster.length} Students
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{
                        width: `${studentsRoster.length ? (markedCount / studentsRoster.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="text-emerald-400 font-medium">Present: {presentCount}</span>
                    <span className="text-rose-400 font-medium">Absent: {absentCount}</span>
                    <span className="text-amber-400 font-medium">
                      Unmarked: {Math.max(0, studentsRoster.length - markedCount)}
                    </span>
                  </div>
                </div>
              )}

              {/* Student Roster Marking Table */}
              <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
                    <thead className="sticky top-0 bg-slate-900 uppercase tracking-wider text-slate-400 z-10">
                      <tr>
                        <th className="px-4 py-3">Roll No.</th>
                        <th className="px-4 py-3">Student Name</th>
                        <th className="px-4 py-3 text-right">Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950/60 font-normal">
                      {loadingInitial ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                            Loading classroom roster...
                          </td>
                        </tr>
                      ) : studentsRoster.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                            No active students in classroom roster.
                          </td>
                        </tr>
                      ) : (
                        studentsRoster.map((student) => {
                          const currentStatus = attendanceMap[student.id]
                          return (
                            <tr key={student.id} className="hover:bg-slate-900/60 transition-colors">
                              <td className="px-4 py-2.5 font-mono font-medium text-slate-200">
                                {student.roll_number}
                              </td>
                              <td className="px-4 py-2.5 font-medium text-white">
                                {student.full_name}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {activeSession?.status === 'in_progress' ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleMarkStudent(student.id, 'present')}
                                      disabled={busy}
                                      className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                                        currentStatus === 'present'
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-slate-800 text-slate-400 hover:bg-emerald-950 hover:text-emerald-300 border border-slate-700'
                                      }`}
                                    >
                                      Present
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMarkStudent(student.id, 'absent')}
                                      disabled={busy}
                                      className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                                        currentStatus === 'absent'
                                          ? 'bg-rose-600 text-white'
                                          : 'bg-slate-800 text-slate-400 hover:bg-rose-950 hover:text-rose-300 border border-slate-700'
                                      }`}
                                    >
                                      Absent
                                    </button>
                                  </div>
                                ) : currentStatus ? (
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                                      currentStatus === 'present'
                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                                    }`}
                                  >
                                    {currentStatus}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">Pending</span>
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
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  <span>Recent Lecture Sessions</span>
                </h3>
              </div>

              <div className="mt-4 space-y-3">
                {recentSessions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">
                    No previous sessions recorded.
                  </p>
                ) : (
                  recentSessions.map((sess) => (
                    <div
                      key={sess.id}
                      onClick={() => handleSelectSession(sess)}
                      className={`cursor-pointer rounded-lg border p-3.5 transition-colors ${
                        activeSession?.id === sess.id
                          ? 'border-blue-500 bg-blue-950/30'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-white">
                        <span>{sess.subjects?.subject_code || 'Subject'}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            sess.status === 'finalized'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}
                        >
                          {sess.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Date: {sess.session_date}</span>
                        <span>Session #{sess.session_number}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
