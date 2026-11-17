import { useState, useEffect, useCallback } from 'react'
import Navbar from '../../components/Navbar'
import StudentNotificationsPanel from '../../components/StudentNotificationsPanel'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Award,
  ArrowUpRight,
  Sparkles,
  Megaphone,
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
    if (pct === null) return 'text-[#78817B]'
    if (pct >= 75) return 'text-[#145C3A]'
    if (pct >= 65) return 'text-amber-700'
    return 'text-[#DC2626]'
  }

  const getStatusBadge = (pct) => {
    if (pct === null) {
      return (
        <span className="rounded-full bg-[#F5F6F3] border border-[#E8ECE7] px-2.5 py-0.5 text-[11px] text-[#78817B] font-medium">
          No Sessions
        </span>
      )
    }
    if (pct >= 75) {
      return (
        <span className="rounded-full bg-[#EAF3ED] border border-[#21845A]/30 px-2.5 py-0.5 text-[11px] text-[#145C3A] font-semibold">
          Compliant (≥ 75%)
        </span>
      )
    }
    if (pct >= 65) {
      return (
        <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] text-amber-800 font-semibold">
          Warning (65-74%)
        </span>
      )
    }
    return (
      <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] text-rose-700 font-semibold">
        Shortage (&lt; 65%)
      </span>
    )
  }

  // Semi-circle gauge calculation (radius 50, circumference = pi * 50 = 157.08)
  const gaugePercent = attendancePercentage !== null ? attendancePercentage : 0
  const gaugeStrokeDash = (gaugePercent / 100) * 157.08

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
                Student Portal
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-[#78817B]">
              Track your course attendance compliance, lecture history, and official announcements.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={loadStudentData}
              className="inline-flex items-center gap-2 rounded-full border border-[#E8ECE7] bg-white px-4 py-2 text-xs font-semibold text-[#252B27] hover:bg-[#F5F6F3] transition-colors shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#78817B] ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Attendance</span>
            </button>
          </div>
        </div>

        {/* Top 4 KPI Metrics Grid (Donezo 4-Card Hero Pattern) */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Hero Deep Forest Green Card */}
          <div className="rounded-2xl bg-[#145C3A] text-white p-5 sm:p-6 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/90">
                Aggregate Attendance
              </span>
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                {loading ? '...' : attendancePercentage !== null ? `${attendancePercentage}%` : '—'}
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#21845A] px-2.5 py-0.5 text-[11px] font-semibold text-white/95">
                <Sparkles className="h-3 w-3" />
                <span>
                  {attendancePercentage === null
                    ? 'No records yet'
                    : attendancePercentage >= 75
                    ? 'Compliant (≥ 75%)'
                    : attendancePercentage >= 65
                    ? 'Warning (65-74%)'
                    : 'Shortage (< 65%)'}
                </span>
              </span>
            </div>
            {/* Subtle decorative curves */}
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
          </div>

          {/* Card 2: White Card - Attended */}
          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#78817B]">
                Sessions Attended
              </span>
              <div className="h-8 w-8 rounded-full border border-[#E8ECE7] flex items-center justify-center text-[#78817B]">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-3xl sm:text-4xl font-bold text-[#252B27] tracking-tight">
                {loading ? '...' : totalPresent}
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF3ED] px-2.5 py-0.5 text-[11px] font-semibold text-[#145C3A]">
                <CheckCircle2 className="h-3 w-3" />
                <span>Present in lectures</span>
              </span>
            </div>
          </div>

          {/* Card 3: White Card - Total Conducted */}
          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#78817B]">
                Conducted Sessions
              </span>
              <div className="h-8 w-8 rounded-full border border-[#E8ECE7] flex items-center justify-center text-[#78817B]">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-3xl sm:text-4xl font-bold text-[#252B27] tracking-tight">
                {loading ? '...' : totalSessions}
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F6F3] border border-[#E8ECE7] px-2.5 py-0.5 text-[11px] font-semibold text-[#78817B]">
                <Calendar className="h-3 w-3" />
                <span>Finalized in curriculum</span>
              </span>
            </div>
          </div>

          {/* Card 4: White Card - Missed */}
          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#78817B]">
                Missed Lectures
              </span>
              <div className="h-8 w-8 rounded-full border border-[#E8ECE7] flex items-center justify-center text-[#78817B]">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-3xl sm:text-4xl font-bold text-[#252B27] tracking-tight">
                {loading ? '...' : totalAbsent}
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                <XCircle className="h-3 w-3" />
                <span>Recorded absences</span>
              </span>
            </div>
          </div>
        </div>

        {/* Warning Notification if Attendance < 75% */}
        {attendancePercentage !== null && attendancePercentage < 75 && totalSessions > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-[#FFFBEB] p-4 text-xs text-[#92400E] shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-[#D97706]">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-[#92400E] text-sm">
                  Attendance Regulation Notice: Below 75% Threshold
                </p>
                <p className="mt-0.5 text-[#92400E]/90 leading-relaxed">
                  Institutional regulations require students to maintain a minimum of 75% attendance to qualify for semester examinations. Please attend upcoming lectures to raise your aggregate.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Middle Visual Section (Donezo Layout: Analytics Capsule Chart + Profile Reminder + Progress Gauge) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Card A: Weekly Attendance Activity Capsule Chart ("Project Analytics") */}
          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[#252B27]">Attendance Analytics</h3>
                <span className="text-[11px] text-[#78817B] font-medium">Weekly Breakdown</span>
              </div>
              <p className="text-xs text-[#78817B] mb-6">
                Relative lecture frequency distribution across teaching days.
              </p>
            </div>

            {/* Rounded vertical capsule bars */}
            <div className="flex items-end justify-between gap-2 px-2 h-36">
              {[
                { day: 'M', height: '65%', active: false },
                { day: 'T', height: '85%', active: true, pct: '85%' },
                { day: 'W', height: '70%', active: false },
                { day: 'T', height: '90%', active: true, pct: '90%' },
                { day: 'F', height: '50%', active: false },
                { day: 'S', height: '30%', active: false },
                { day: 'S', height: '0%', active: false },
              ].map((bar, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-full flex items-end justify-center h-28">
                    <div
                      style={{ height: bar.height === '0%' ? '6px' : bar.height }}
                      className={`w-full max-w-[28px] rounded-full transition-all duration-300 ${
                        bar.height === '0%'
                          ? 'bg-[#E8ECE7]'
                          : bar.active
                          ? 'bg-[#145C3A] shadow-sm'
                          : 'bg-[#21845A]/30'
                      }`}
                    />
                  </div>
                  <span className="text-xs font-semibold text-[#78817B]">{bar.day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card B: Student Profile & Enrolled Curriculum ("Reminders") */}
          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-[#78817B] uppercase tracking-wider">
                  Academic Record
                </span>
                <span className="rounded-full bg-[#EAF3ED] px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#145C3A] border border-[#21845A]/20">
                  {studentRecord?.roll_number ? `Roll: ${studentRecord.roll_number}` : 'Registered'}
                </span>
              </div>
              <h3 className="text-base font-bold text-[#252B27]">
                {profile?.full_name || studentRecord?.full_name || 'Student'}
              </h3>
              <p className="mt-1 text-xs text-[#78817B]">
                Department of Computer Science &amp; Engineering
              </p>

              <div className="mt-4 space-y-2.5 text-xs border-t border-[#E8ECE7] pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[#78817B]">College Login ID</span>
                  <span className="font-mono font-bold text-[#252B27]">{profile?.login_id || 'ID'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#78817B]">Curriculum Courses</span>
                  <span className="font-bold text-[#252B27]">{subjectsList.length} Active Subjects</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#78817B]">Status</span>
                  <span className="rounded-full bg-[#EAF3ED] px-2 py-0.5 text-[10px] font-semibold text-[#145C3A]">
                    Active Enrollment
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-[#E8ECE7]">
              <a
                href="#announcements-section"
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#145C3A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#21845A] shadow-sm transition-colors"
              >
                <Megaphone className="h-3.5 w-3.5" />
                <span>View Circulars &amp; Notices</span>
              </a>
            </div>
          </div>

          {/* Card C: Semi-Circular Progress Gauge ("Project Progress") */}
          <div className="rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-sm flex flex-col justify-between items-center text-center">
            <div className="w-full text-left">
              <h3 className="text-sm font-bold text-[#252B27]">Attendance Compliance</h3>
              <p className="text-xs text-[#78817B]">Cumulative institutional threshold</p>
            </div>

            {/* SVG Semi-Circle Gauge */}
            <div className="relative my-4 flex items-center justify-center">
              <svg className="w-44 h-24 overflow-visible" viewBox="0 0 120 65">
                {/* Background track */}
                <path
                  d="M 10 60 A 50 50 0 0 1 110 60"
                  fill="none"
                  stroke="#E8ECE7"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                {/* Colored fill */}
                <path
                  d="M 10 60 A 50 50 0 0 1 110 60"
                  fill="none"
                  stroke="#145C3A"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray="157.08"
                  strokeDashoffset={157.08 - gaugeStrokeDash}
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute bottom-0 text-center">
                <span className="text-2xl font-extrabold text-[#252B27] tracking-tight">
                  {attendancePercentage !== null ? `${attendancePercentage}%` : '—'}
                </span>
                <p className="text-[10px] text-[#78817B] font-semibold">Requirement: 75%</p>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-[#78817B] pt-2 border-t border-[#E8ECE7] w-full">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#145C3A]" />
                <span>Compliant</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Warning</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
                <span>Shortage</span>
              </div>
            </div>
          </div>
        </div>

        {/* Announcements & Academic Notices */}
        <StudentNotificationsPanel studentId={studentRecord?.id} />

        {/* Course-Wise Attendance Breakdown Table */}
        <div id="subjects-breakdown" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-[#252B27] flex items-center gap-2">
              <Award className="h-5 w-5 text-[#145C3A]" />
              <span>Course-Wise Attendance Breakdown</span>
            </h2>
            <span className="text-xs text-[#78817B] font-medium">
              {subjectStats.length} Registered Courses
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#E8ECE7] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#E8ECE7] text-left text-sm text-[#252B27]">
                <thead className="bg-[#F5F6F3] uppercase text-xs font-semibold tracking-wider text-[#78817B]">
                  <tr>
                    <th className="px-6 py-3.5">Course Code</th>
                    <th className="px-6 py-3.5">Subject Name</th>
                    <th className="px-6 py-3.5 text-center">Conducted</th>
                    <th className="px-6 py-3.5 text-center">Attended</th>
                    <th className="px-6 py-3.5 text-center">Percentage</th>
                    <th className="px-6 py-3.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8ECE7] font-normal">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-[#78817B]">
                        Calculating subject attendance records...
                      </td>
                    </tr>
                  ) : subjectStats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-[#78817B]">
                        No active subjects found in curriculum.
                      </td>
                    </tr>
                  ) : (
                    subjectStats.map((sub) => (
                      <tr key={sub.id} className="hover:bg-[#F5F6F3]/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-[#145C3A]">
                          {sub.subject_code}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-[#252B27]">{sub.subject_name}</div>
                          {sub.description && (
                            <p className="mt-0.5 text-xs text-[#78817B] line-clamp-1">{sub.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-xs font-medium text-[#78817B]">
                          {sub.total}
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-xs text-[#145C3A] font-bold">
                          {sub.present}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`font-mono text-xs font-extrabold ${getPctColor(sub.percentage)}`}>
                              {sub.percentage !== null ? `${sub.percentage}%` : '—'}
                            </span>
                            {sub.percentage !== null && (
                              <div className="w-16 h-2 rounded-full bg-[#E8ECE7] overflow-hidden hidden sm:block">
                                <div
                                  style={{ width: `${sub.percentage}%` }}
                                  className={`h-full rounded-full ${
                                    sub.percentage >= 75
                                      ? 'bg-[#145C3A]'
                                      : sub.percentage >= 65
                                      ? 'bg-amber-500'
                                      : 'bg-[#DC2626]'
                                  }`}
                                />
                              </div>
                            )}
                          </div>
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

        {/* Detailed Lecture Attendance Log */}
        <div id="attendance-history" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-[#252B27] flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#145C3A]" />
              <span>Finalized Lecture Attendance Log</span>
            </h2>
            <span className="text-xs text-[#78817B] font-medium">
              {finalizedRecords.length} Finalized Records
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#E8ECE7] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#E8ECE7] text-left text-xs text-[#252B27]">
                <thead className="bg-[#F5F6F3] uppercase tracking-wider text-[#78817B] font-semibold">
                  <tr>
                    <th className="px-6 py-3.5">Lecture Date</th>
                    <th className="px-6 py-3.5">Course Code &amp; Title</th>
                    <th className="px-6 py-3.5">Session #</th>
                    <th className="px-6 py-3.5 text-right">Marked Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8ECE7]">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-[#78817B]">
                        Loading attendance history...
                      </td>
                    </tr>
                  ) : finalizedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-[#78817B]">
                        No finalized attendance records recorded yet.
                      </td>
                    </tr>
                  ) : (
                    finalizedRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-[#F5F6F3]/50 transition-colors">
                        <td className="px-6 py-3.5 font-semibold text-[#252B27]">
                          {rec.attendance_sessions?.session_date || 'N/A'}
                        </td>
                        <td className="px-6 py-3.5 text-[#252B27]">
                          <span className="font-mono font-bold text-[#145C3A]">
                            {rec.attendance_sessions?.subjects?.subject_code}
                          </span>
                          {' — '}
                          <span>{rec.attendance_sessions?.subjects?.subject_name}</span>
                        </td>
                        <td className="px-6 py-3.5 text-[#78817B] font-mono">
                          Session #{rec.attendance_sessions?.session_number || 1}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold capitalize ${
                              rec.status === 'present'
                                ? 'bg-[#EAF3ED] text-[#145C3A] border border-[#21845A]/30'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
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
