import { useState, useEffect, useCallback } from 'react'
import Navbar from '../../components/Navbar'
import AlertBanner from '../../components/AlertBanner'
import DeleteAccountModal from '../../components/DeleteAccountModal'
import AcademicManagementPanel from '../../components/AcademicManagementPanel'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  Users,
  Award,
  BookOpen,
  Calendar,
  Shield,
  UserPlus,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Lock,
  Trash2,
} from 'lucide-react'

export default function AdminDashboard() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')

  // Stats state
  const [stats, setStats] = useState({
    activeStudents: 0,
    activeFaculty: 0,
    activeSubjects: 0,
    totalSessions: 0,
  })
  const [loadingStats, setLoadingStats] = useState(true)

  // Directory state
  const [profilesList, setProfilesList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [directoryMessage, setDirectoryMessage] = useState(null)
  const [directoryError, setDirectoryError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Provisioning form state
  const [provForm, setProvForm] = useState({
    loginId: '',
    fullName: '',
    password: '',
    role: 'student',
    rollNumber: '',
    employeeId: '',
  })
  const [provSubmitting, setProvSubmitting] = useState(false)
  const [provMessage, setProvMessage] = useState(null)
  const [provError, setProvError] = useState(null)

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Load stats
  const loadStats = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingStats(true)
    try {
      const [
        { count: studentCount },
        { count: facultyCount },
        { count: subjectCount },
        { count: sessionCount },
      ] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('faculty').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('attendance_sessions').select('*', { count: 'exact', head: true }),
      ])

      setStats({
        activeStudents: studentCount || 0,
        activeFaculty: facultyCount || 0,
        activeSubjects: subjectCount || 0,
        totalSessions: sessionCount || 0,
      })
    } catch (err) {
      console.error('Error loading admin stats:', err)
    } finally {
      setLoadingStats(false)
    }
  }, [])

  // Load user directory
  const loadProfiles = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingProfiles(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_active, login_id, created_at')
        .order('created_at', { ascending: false })

      if (error) {
        setDirectoryError(`Failed to load directory: ${error.message}`)
      } else if (data) {
        setProfilesList(data)
      }
    } catch (err) {
      console.error('Error loading profiles:', err)
      setDirectoryError(err instanceof Error ? err.message : 'Failed to load user directory.')
    } finally {
      setLoadingProfiles(false)
    }
  }, [])

  // Load audit logs
  const loadAuditLogs = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingLogs(true)
    try {
      const { data, error } = await supabase
        .from('attendance_audit_logs')
        .select('id, session_id, action, old_status, new_status, performed_by, details, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

      if (!error && data) {
        setAuditLogs(data)
      }
    } catch (err) {
      console.error('Error loading audit logs:', err)
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function initOverview() {
      try {
        const [
          { count: studentCount },
          { count: facultyCount },
          { count: subjectCount },
          { count: sessionCount },
        ] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('faculty').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('attendance_sessions').select('*', { count: 'exact', head: true }),
        ])

        if (!ignore) {
          setStats({
            activeStudents: studentCount || 0,
            activeFaculty: facultyCount || 0,
            activeSubjects: subjectCount || 0,
            totalSessions: sessionCount || 0,
          })
          setLoadingStats(false)
        }
      } catch (err) {
        console.error(err)
        if (!ignore) setLoadingStats(false)
      }
    }

    initOverview()
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadTabData() {
      if (activeTab === 'directory') {
        setLoadingProfiles(true)
        try {
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, is_active, login_id, created_at')
            .order('created_at', { ascending: false })

          if (!ignore && data) setProfilesList(data)
        } catch (err) {
          console.error(err)
        } finally {
          if (!ignore) setLoadingProfiles(false)
        }
      } else if (activeTab === 'audit') {
        setLoadingLogs(true)
        try {
          const { data } = await supabase
            .from('attendance_audit_logs')
            .select('id, session_id, action, old_status, new_status, performed_by, details, created_at')
            .order('created_at', { ascending: false })
            .limit(20)

          if (!ignore && data) setAuditLogs(data)
        } catch (err) {
          console.error(err)
        } finally {
          if (!ignore) setLoadingLogs(false)
        }
      }
    }

    loadTabData()
    return () => { ignore = true }
  }, [activeTab])

  // Toggle account active status (Safe Inactive Account Handling)
  const handleToggleActive = async (targetProfile) => {
    setDirectoryMessage(null)
    setDirectoryError(null)

    if (targetProfile.id === profile?.id) {
      setDirectoryError('Administrators cannot deactivate their own account.')
      return
    }

    const nextState = !targetProfile.is_active
    const displayId = targetProfile.login_id || targetProfile.email
    const confirmMsg = nextState
      ? `Reactivate account for Login ID ${displayId}?`
      : `Deactivate account for Login ID ${displayId}? The user will be immediately denied access.`

    if (!window.confirm(confirmMsg)) return

    try {
      // Use RPC if available, or direct update (permitted by admin policy)
      const { error } = await supabase.rpc('admin_set_user_active', {
        target_profile_id: targetProfile.id,
        new_is_active: nextState,
      })

      if (error) {
        // Fallback to direct table update with admin RLS
        const { error: directErr } = await supabase
          .from('profiles')
          .update({ is_active: nextState })
          .eq('id', targetProfile.id)

        if (directErr) throw directErr
      }

      setDirectoryMessage(
        nextState
          ? `Account ${displayId} has been reactivated.`
          : `Account ${displayId} has been deactivated.`
      )
      await Promise.all([loadProfiles(), loadStats()])
    } catch (err) {
      setDirectoryError(`Failed to update status: ${err.message}`)
    }
  }

  // Open Permanent Account Deletion Confirmation Modal
  const handleOpenDeleteModal = (targetProfile) => {
    setDirectoryMessage(null)
    setDirectoryError(null)

    if (targetProfile.id === profile?.id) {
      setDirectoryError('Administrators cannot delete their own account.')
      return
    }

    if (targetProfile.is_active) {
      setDirectoryError('Only deactivated accounts can be permanently deleted. Deactivate the account first.')
      return
    }

    setDeleteTarget(targetProfile)
  }

  // Handle Successful Permanent Account Deletion
  const handleDeleteSuccess = async (result) => {
    setDeleteTarget(null)
    setDirectoryError(null)
    setDirectoryMessage(
      result?.message || 'Account permanently deleted and historical records preserved.'
    )
    await Promise.all([loadProfiles(), loadStats()])
  }

  // Handle Account Provisioning Submission
  const handleProvisionSubmit = async (e) => {
    e.preventDefault()
    setProvMessage(null)
    setProvError(null)

    const cleanLoginId = provForm.loginId.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,20}$/.test(cleanLoginId)) {
      setProvError('Login ID must be 3-20 alphanumeric characters (e.g. ADMIN002, FAC002, STU002).')
      return
    }

    if (provForm.password.length < 8) {
      setProvError('Password must be at least 8 characters long.')
      return
    }

    setProvSubmitting(true)

    try {
      // Call Supabase Edge Function: provision-user
      const { data, error } = await supabase.functions.invoke('provision-user', {
        body: {
          loginId: cleanLoginId,
          password: provForm.password,
          fullName: provForm.fullName.trim(),
          role: provForm.role,
          rollNumber: provForm.role === 'student' ? (provForm.rollNumber.trim() || cleanLoginId) : undefined,
          employeeId: provForm.role === 'faculty' ? (provForm.employeeId.trim() || cleanLoginId) : undefined,
        },
      })

      if (error) {
        throw new Error(error.message || 'Edge function error')
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      setProvMessage(data?.message || `User ${cleanLoginId} provisioned successfully!`)
      setProvForm({
        loginId: '',
        fullName: '',
        password: '',
        role: 'student',
        rollNumber: '',
        employeeId: '',
      })
      await loadStats()
    } catch (err) {
      setProvError(
        `${err.message}. If Edge Function is not yet deployed, accounts can also be provisioned via scripts/provision-user.js server-side.`
      )
    } finally {
      setProvSubmitting(false)
    }
  }

  // Filtered profiles for directory
  const filteredProfiles = profilesList.filter((p) => {
    const search = searchQuery.toLowerCase()
    const matchesSearch =
      (p.login_id && p.login_id.toLowerCase().includes(search)) ||
      (p.full_name && p.full_name.toLowerCase().includes(search)) ||
      (p.email && p.email.toLowerCase().includes(search))
    const matchesRole = roleFilter === 'all' || p.role === roleFilter
    return matchesSearch && matchesRole
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-indigo-950 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-400 border border-indigo-800/80">
                Institutional Administration
              </span>
              <span className="text-xs text-slate-500">• Single Classroom Model</span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
              Administrator Portal
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage accounts, verify roster allocations, enforce security policies, and review audit records.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              loadStats()
              if (activeTab === 'directory') loadProfiles()
              if (activeTab === 'audit') loadAuditLogs()
            }}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 border-b border-slate-800">
          <nav className="flex space-x-6 overflow-x-auto whitespace-nowrap text-sm font-medium">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              System Overview
            </button>
            <button
              onClick={() => setActiveTab('provisioning')}
              className={`pb-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'provisioning'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              <span>Account Provisioning</span>
            </button>
            <button
              onClick={() => setActiveTab('directory')}
              className={`pb-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'directory'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Roster & Users</span>
            </button>
            <button
              onClick={() => setActiveTab('academics')}
              className={`pb-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'academics'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Academic Management</span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`pb-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>Audit Logs</span>
            </button>
          </nav>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="mt-8 space-y-8">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Active Students
                  </span>
                  <div className="rounded-lg bg-sky-950/60 p-2 text-sky-400 border border-sky-800/40">
                    <BookOpen className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-bold text-white">
                    {loadingStats ? '...' : stats.activeStudents}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Classroom Roster: 25 Target</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Active Faculty
                  </span>
                  <div className="rounded-lg bg-emerald-950/60 p-2 text-emerald-400 border border-emerald-800/40">
                    <Award className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-bold text-white">
                    {loadingStats ? '...' : stats.activeFaculty}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Assigned Department Instructors</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Active Subjects
                  </span>
                  <div className="rounded-lg bg-indigo-950/60 p-2 text-indigo-400 border border-indigo-800/40">
                    <Calendar className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-bold text-white">
                    {loadingStats ? '...' : stats.activeSubjects}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Curriculum courses active</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Attendance Sessions
                  </span>
                  <div className="rounded-lg bg-amber-950/60 p-2 text-amber-400 border border-amber-800/40">
                    <Activity className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-bold text-white">
                    {loadingStats ? '...' : stats.totalSessions}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Recorded lecture sessions</p>
                </div>
              </div>
            </div>

            {/* Institutional Security Policy Status Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-blue-400" />
                <h2 className="text-lg font-bold text-white">Institutional Security Status</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Security hardening parameters enforced at the database and application layer:
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
                  <p className="text-xs font-medium text-slate-400">Authentication Model</p>
                  <p className="mt-1 font-mono text-base font-bold text-blue-400">
                    College Login ID
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Internal mapping; zero external email dependency
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
                  <p className="text-xs font-medium text-slate-400">Public Self-Registration</p>
                  <div className="mt-1 flex items-center gap-1.5 text-base font-bold text-emerald-400">
                    <XCircle className="h-4 w-4" />
                    <span>Strictly Disabled</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Admin-controlled account provisioning only
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
                  <p className="text-xs font-medium text-slate-400">Row Level Security (RLS)</p>
                  <div className="mt-1 flex items-center gap-1.5 text-base font-bold text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Active on all 12 Tables</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Zero anonymous access, role authorization
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACCOUNT PROVISIONING */}
        {activeTab === 'provisioning' && (
          <div className="mt-8 max-w-2xl">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Provision College Account
                  </h2>
                  <p className="text-xs text-slate-400">
                    Create verified student, faculty, or admin accounts with automatic roster synchronization.
                  </p>
                </div>
              </div>

              {provMessage && (
                <div className="mt-4">
                  <AlertBanner
                    type="success"
                    message={provMessage}
                    onClose={() => setProvMessage(null)}
                  />
                </div>
              )}

              {provError && (
                <div className="mt-4">
                  <AlertBanner
                    type="error"
                    message={provError}
                    onClose={() => setProvError(null)}
                  />
                </div>
              )}

              <form onSubmit={handleProvisionSubmit} className="mt-6 space-y-4">
                {/* Login ID */}
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    College Login ID *
                  </label>
                  <div className="relative mt-1">
                    <input
                      type="text"
                      required
                      placeholder="e.g. ADMIN002, FAC002, STU002"
                      value={provForm.loginId}
                      onChange={(e) => setProvForm({ ...provForm, loginId: e.target.value.toUpperCase() })}
                      className="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 font-mono text-sm uppercase tracking-wider text-slate-100 placeholder-slate-500 placeholder:normal-case placeholder:tracking-normal focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Admin format: ADMIN001... • Faculty format: FAC001... • Student format: STU001...
                  </p>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Robert Davis or Sarah Miller"
                    value={provForm.fullName}
                    onChange={(e) => setProvForm({ ...provForm, fullName: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Temporary Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 8 characters"
                    value={provForm.password}
                    onChange={(e) => setProvForm({ ...provForm, password: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Account Role *
                  </label>
                  <select
                    value={provForm.role}
                    onChange={(e) => setProvForm({ ...provForm, role: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="student">Student (Classroom Roster)</option>
                    <option value="faculty">Faculty (Academic Instructor)</option>
                    <option value="admin">Administrator (Full Access)</option>
                  </select>
                </div>

                {/* Conditional Roll Number / Employee ID */}
                {provForm.role === 'student' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Roll Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. STU002 or CS-2026-02"
                      value={provForm.rollNumber}
                      onChange={(e) => setProvForm({ ...provForm, rollNumber: e.target.value })}
                      className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                {provForm.role === 'faculty' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Faculty Employee ID *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. FAC002"
                      value={provForm.employeeId}
                      onChange={(e) => setProvForm({ ...provForm, employeeId: e.target.value })}
                      className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Submit */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={provSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {provSubmitting ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Provisioning Account...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        <span>Securely Provision Account</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">
                <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-blue-400" />
                  <span>Security & Service Role Isolation:</span>
                </p>
                <p className="mt-1 leading-relaxed">
                  Account provisioning invokes a server-side Supabase Edge Function using trusted
                  service-role credentials. Service keys are never exposed to browser client code.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ROSTER & DIRECTORY */}
        {activeTab === 'directory' && (
          <div className="mt-8 space-y-6">
            {directoryMessage && (
              <AlertBanner
                type="success"
                message={directoryMessage}
                onClose={() => setDirectoryMessage(null)}
              />
            )}

            {directoryError && (
              <AlertBanner
                type="error"
                message={directoryError}
                onClose={() => setDirectoryError(null)}
              />
            )}

            {/* Search and Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Role Filter:</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="faculty">Faculty</option>
                  <option value="student">Student</option>
                </select>
              </div>
            </div>

            {/* Profiles Table */}
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-3.5">Login ID</th>
                      <th className="px-6 py-3.5">User Profile</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-normal">
                    {loadingProfiles ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                          Loading user directory...
                        </td>
                      </tr>
                    ) : filteredProfiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                          No matching profiles found in database.
                        </td>
                      </tr>
                    ) : (
                      filteredProfiles.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-6 py-4 font-mono text-sm font-bold text-blue-400 whitespace-nowrap">
                            {p.login_id || p.email?.split('@')[0]?.toUpperCase() || '-'}
                          </td>
                          <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                            <div>{p.full_name || 'Academic User'}</div>
                            <div className="text-[11px] font-mono text-slate-500">{p.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                                p.role === 'admin'
                                  ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                                  : p.role === 'faculty'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-sky-950 text-sky-300 border border-sky-800'
                              }`}
                            >
                              {p.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {p.is_active ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Active</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400">
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Deactivated</span>
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleActive(p)}
                                disabled={p.id === profile?.id}
                                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                                  p.is_active
                                    ? 'border-amber-800/80 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60'
                                    : 'border-emerald-900 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                {p.is_active ? 'Deactivate' : 'Reactivate'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenDeleteModal(p)}
                                disabled={p.is_active || p.id === profile?.id}
                                title={
                                  p.id === profile?.id
                                    ? 'Administrators cannot delete their own account'
                                    : p.is_active
                                    ? 'Deactivate this account before permanently deleting'
                                    : 'Permanently delete this deactivated account'
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-red-800/90 bg-red-950/60 px-3 py-1 text-xs font-semibold text-red-300 transition-colors hover:border-red-600 hover:bg-red-900/80 hover:text-white disabled:cursor-not-allowed disabled:border-red-950 disabled:bg-red-950/20 disabled:text-red-400/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Permanently Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="mt-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Attendance Audit Trail</h2>
                <p className="text-xs text-slate-400">
                  Immutable record of session starts, attendance marks, finalizations, and admin corrections.
                </p>
              </div>
              <button
                type="button"
                onClick={loadAuditLogs}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh Logs</span>
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-3.5">Timestamp</th>
                      <th className="px-6 py-3.5">Action</th>
                      <th className="px-6 py-3.5">Session ID</th>
                      <th className="px-6 py-3.5">Status Transition</th>
                      <th className="px-6 py-3.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-normal">
                    {loadingLogs ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                          Loading audit trail...
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                          No audit log records found.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/40 text-xs">
                          <td className="px-6 py-3.5 whitespace-nowrap text-slate-400">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5 whitespace-nowrap font-semibold">
                            <span
                              className={`rounded px-2 py-0.5 ${
                                log.action === 'session_finalized'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : log.action === 'session_started'
                                  ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                  : log.action === 'attendance_corrected'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 font-mono text-[11px] text-slate-400">
                            {log.session_id ? log.session_id.slice(0, 8) + '...' : '-'}
                          </td>
                          <td className="px-6 py-3.5 whitespace-nowrap">
                            {log.old_status ? (
                              <span>
                                {log.old_status} →{' '}
                                <strong className="text-white">{log.new_status}</strong>
                              </span>
                            ) : log.new_status ? (
                              <span className="text-white font-medium">{log.new_status}</span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-[11px] text-slate-400 truncate max-w-xs">
                            {log.details && Object.keys(log.details).length > 0
                              ? JSON.stringify(log.details)
                              : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ACADEMIC MANAGEMENT */}
        {activeTab === 'academics' && (
          <AcademicManagementPanel onDataChanged={loadStats} />
        )}
      </main>

      {deleteTarget && (
        <DeleteAccountModal
          key={deleteTarget.id}
          targetProfile={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleteSuccess}
          onStaleAccount={() => {
            loadProfiles()
            loadStats()
          }}
        />
      )}
    </div>
  )
}
