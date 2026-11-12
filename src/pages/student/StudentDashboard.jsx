import { useState, useEffect, useCallback } from 'react'
import Navbar from '../../components/Navbar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Award,
} from 'lucide-react'

export default function StudentDashboard() {
  const { user, profile } = useAuth()
  const [studentRecord, setStudentRecord] = useState(null)
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [subjectsList, setSubjectsList] = useState([])
  const [loading, setLoading] = useState(true)

  // Load student profile & finalized attendance records
  const loadStudentData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      // 1. Fetch Student Roster Record
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('id, roll_number, full_name, email, contact_number, admission_date, is_active')
        .eq('profile_id', user.id)
        .maybeSingle()

      if (studentErr) throw studentErr
      setStudentRecord(student)

      if (student) {
        // 2. Fetch Finalized Attendance Records for this student
        // RLS policy: students_read_own_finalized_attendance
        const { data: records, error: recErr } = await supabase
          .from('attendance_records')
          .select(`
            id,
            status,
            marked_at,
            attendance_sessions!inner (
              id,
              session_date,
              session_number,
              status,
              subjects!inner (
                id,
                subject_code,
                subject_name
              )
            )
          `)
          .eq('student_id', student.id)
          .eq('attendance_sessions.status', 'finalized')
          .order('marked_at', { ascending: false })

        if (!recErr && records) {
          setAttendanceRecords(records.filter((r) => r.attendance_sessions?.status === 'finalized'))
        }
      }

      // 3. Fetch active curriculum subjects ordered by subject code
      const { data: subs, error: subsErr } = await supabase
        .from('subjects')
        .select('id, subject_code, subject_name, description')
        .eq('is_active', true)
        .order('subject_code', { ascending: true })

      if (!subsErr && subs) {
        setSubjectsList(subs)
      }
    } catch (err) {
      console.error('Error loading student attendance:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    let ignore = false

    async function fetchData() {
      if (!user) return
      try {
        const { data: student } = await supabase
          .from('students')
          .select('id, roll_number, full_name, email, contact_number, admission_date, is_active')
          .eq('profile_id', user.id)
          .maybeSingle()

        if (!ignore && student) {
          setStudentRecord(student)

          const [
            { data: records },
            { data: subs }
          ] = await Promise.all([
            supabase
              .from('attendance_records')
              .select(`
                id,
                status,
                marked_at,
                attendance_sessions!inner (
                  id,
                  session_date,
                  session_number,
                  status,
                  subjects!inner (
                    id,
                    subject_code,
                    subject_name
                  )
                )
              `)
              .eq('student_id', student.id)
              .eq('attendance_sessions.status', 'finalized')
              .order('marked_at', { ascending: false }),
            supabase
              .from('subjects')
              .select('id, subject_code, subject_name, description')
              .eq('is_active', true)
              .order('subject_code', { ascending: true })
          ])

          if (!ignore) {
            if (records) {
              setAttendanceRecords(records.filter((r) => r.attendance_sessions?.status === 'finalized'))
            }
            if (subs) setSubjectsList(subs)
          }
        } else if (!ignore) {
          const { data: subs } = await supabase
            .from('subjects')
            .select('id, subject_code, subject_name, description')
            .eq('is_active', true)
            .order('subject_code', { ascending: true })
          if (!ignore && subs) setSubjectsList(subs)
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    fetchData()
    return () => { ignore = true }
  }, [user])

  // Aggregate stats (calculated strictly from finalized sessions)
  const finalizedRecords = attendanceRecords.filter(
    (r) => r.attendance_sessions?.status === 'finalized'
  )
  const totalSessions = finalizedRecords.length
  const totalPresent = finalizedRecords.filter((r) => r.status === 'present').length
  const totalAbsent = finalizedRecords.filter((r) => r.status === 'absent').length
  const attendancePercentage = totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : null

  // Subject-wise stats calculation
  const subjectStats = subjectsList.map((subject) => {
    const subRecords = finalizedRecords.filter(
      (r) => r.attendance_sessions?.subjects?.id === subject.id
    )
    const subTotal = subRecords.length
    const subPresent = subRecords.filter((r) => r.status === 'present').length
    const subPct = subTotal > 0 ? Math.round((subPresent / subTotal) * 100) : null
    return {
      ...subject,
      total: subTotal,
      present: subPresent,
      percentage: subPct,
    }
  })

  // Attendance compliance color
  const getPctColor = (pct) => {
    if (pct === null) return 'text-slate-400'
    if (pct >= 75) return 'text-emerald-400'
    if (pct >= 65) return 'text-amber-400'
    return 'text-rose-400'
  }

  const getStatusBadge = (pct) => {
    if (pct === null) {
      return (
        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 font-medium">
          No Sessions
        </span>
      )
    }
    if (pct >= 75) {
      return (
        <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] text-emerald-300 font-semibold border border-emerald-800">
          Compliant (≥ 75%)
        </span>
      )
    }
    if (pct >= 65) {
      return (
        <span className="rounded bg-amber-950 px-2 py-0.5 text-[10px] text-amber-300 font-semibold border border-amber-800">
          Warning (65-74%)
        </span>
      )
    }
    return (
      <span className="rounded bg-rose-950 px-2 py-0.5 text-[10px] text-rose-300 font-semibold border border-rose-800">
        Shortage (&lt; 65%)
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Student Profile Card */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600/20 text-sky-400 border border-sky-500/30">
                <BookOpen className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-sky-950 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-sky-300 border border-sky-800">
                    Student Portal
                  </span>
                  {studentRecord?.roll_number && (
                    <span className="text-xs font-mono font-medium text-slate-300">
                      Roll No: {studentRecord.roll_number}
                    </span>
                  )}
                </div>
                <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
                  {profile?.full_name || studentRecord?.full_name || 'Student'}
                </h1>
                <p className="text-xs text-slate-400">
                  Classroom Connect • Department of Computer Science & Engineering
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadStudentData}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Attendance</span>
            </button>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Overall Percentage */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Aggregate Attendance
              </span>
              <div className="rounded-lg bg-blue-950/60 p-2 text-blue-400 border border-blue-800/40">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className={`text-3xl font-extrabold ${getPctColor(attendancePercentage)}`}>
                {loading ? '...' : attendancePercentage !== null ? `${attendancePercentage}%` : '—'}
              </div>
              <div className="mt-2">{getStatusBadge(attendancePercentage)}</div>
            </div>
          </div>

          {/* Present Sessions */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Sessions Attended
              </span>
              <div className="rounded-lg bg-emerald-950/60 p-2 text-emerald-400 border border-emerald-800/40">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold text-white">
                {loading ? '...' : totalPresent}
              </div>
              <p className="mt-1 text-xs text-slate-400">Lectures Marked Present</p>
            </div>
          </div>

          {/* Absent Sessions */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Sessions Absent
              </span>
              <div className="rounded-lg bg-rose-950/60 p-2 text-rose-400 border border-rose-800/40">
                <XCircle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold text-white">
                {loading ? '...' : totalAbsent}
              </div>
              <p className="mt-1 text-xs text-slate-400">Lectures Missed</p>
            </div>
          </div>

          {/* Total Conducted */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Conducted
              </span>
              <div className="rounded-lg bg-indigo-950/60 p-2 text-indigo-400 border border-indigo-800/40">
                <Calendar className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold text-white">
                {loading ? '...' : totalSessions}
              </div>
              <p className="mt-1 text-xs text-slate-400">Finalized Academic Sessions</p>
            </div>
          </div>
        </div>

        {/* Attendance Regulation Notice */}
        {attendancePercentage !== null && attendancePercentage < 75 && totalSessions > 0 && (
          <div className="mt-6 rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-xs text-amber-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold text-amber-300">
                  College Attendance Warning: Below Minimum 75% Requirement
                </p>
                <p className="mt-1 leading-relaxed text-amber-200/80">
                  According to college academic guidelines, students must maintain at least 75% aggregate
                  attendance across all registered subjects to qualify for semester examinations.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Subject-Wise Attendance Breakdown */}
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-400" />
            <span>Course-Wise Attendance Breakdown</span>
          </h2>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
                <thead className="bg-slate-900 uppercase text-xs tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-3.5">Course Code</th>
                    <th className="px-6 py-3.5">Subject Name</th>
                    <th className="px-6 py-3.5 text-center">Conducted</th>
                    <th className="px-6 py-3.5 text-center">Attended</th>
                    <th className="px-6 py-3.5 text-center">Percentage</th>
                    <th className="px-6 py-3.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-normal">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-slate-500">
                        Calculating subject attendance...
                      </td>
                    </tr>
                  ) : subjectStats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-slate-500">
                        No active subjects found in curriculum.
                      </td>
                    </tr>
                  ) : (
                    subjectStats.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-white">
                          {sub.subject_code}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-200">
                          <div>{sub.subject_name}</div>
                          {sub.description && (
                            <p className="mt-0.5 text-xs text-slate-500">{sub.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-xs">
                          {sub.total}
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-xs text-emerald-400 font-semibold">
                          {sub.present}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`font-mono text-xs font-bold ${getPctColor(sub.percentage)}`}>
                            {sub.percentage !== null ? `${sub.percentage}%` : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {getStatusBadge(sub.percentage)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detailed Session Log History */}
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-emerald-400" />
            <span>Finalized Lecture Attendance Log</span>
          </h2>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
                <thead className="bg-slate-900 uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-3">Lecture Date</th>
                    <th className="px-6 py-3">Course</th>
                    <th className="px-6 py-3">Session #</th>
                    <th className="px-6 py-3 text-right">Marked Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-6 text-center text-slate-500">
                        Loading attendance history...
                      </td>
                    </tr>
                  ) : finalizedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-6 text-center text-slate-500">
                        No finalized attendance records recorded yet.
                      </td>
                    </tr>
                  ) : (
                    finalizedRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-3.5 font-medium text-slate-200">
                          {rec.attendance_sessions?.session_date || 'N/A'}
                        </td>
                        <td className="px-6 py-3.5 text-slate-300">
                          {rec.attendance_sessions?.subjects?.subject_code} —{' '}
                          {rec.attendance_sessions?.subjects?.subject_name}
                        </td>
                        <td className="px-6 py-3.5 text-slate-400 font-mono">
                          Session #{rec.attendance_sessions?.session_number || 1}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                              rec.status === 'present'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {rec.status === 'present' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            <span>{rec.status}</span>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
