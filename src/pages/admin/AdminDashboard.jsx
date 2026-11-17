import { useState, useEffect, useCallback } from 'react'
import Navbar from '../../components/Navbar'
import AlertBanner from '../../components/AlertBanner'
import DeleteAccountModal from '../../components/DeleteAccountModal'
import AcademicManagementPanel from '../../components/AcademicManagementPanel'
import CreateAnnouncementModal from '../../components/CreateAnnouncementModal'
import NotificationDetailModal from '../../components/NotificationDetailModal'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  fetchAdminAnnouncements,
  deleteAnnouncement,
  CATEGORY_STYLES,
} from '../../services/notificationService'
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
  Megaphone,
  Flame,
  Eye,
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

  // Announcements state
  const [adminAnnouncements, setAdminAnnouncements] = useState([])
  const [loadingAdminAnnouncements, setLoadingAdminAnnouncements] = useState(false)
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false)
  const [selectedAdminAnnouncement, setSelectedAdminAnnouncement] = useState(null)
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState(null)
  const [announcementCategoryFilter, setAnnouncementCategoryFilter] = useState('ALL')
  const [announcementSearch, setAnnouncementSearch] = useState('')
  const [subjectsList, setSubjectsList] = useState([])

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

  // Load admin announcements
  const loadAdminAnnouncements = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAdminAnnouncements(true)
    try {
      const [
        { data: notifs },
        { data: subs },
      ] = await Promise.all([
        fetchAdminAnnouncements(),
        supabase.from('subjects').select('id, subject_code, subject_name').eq('is_active', true).order('subject_code'),
      ])
      if (notifs) setAdminAnnouncements(notifs)
      if (subs) setSubjectsList(subs)
    } catch (err) {
      console.error('Error loading admin announcements:', err)
    } finally {
      setLoadingAdminAnnouncements(false)
    }
  }, [])

  const handleDeleteAnnouncement = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this announcement? This will remove it for all users.')) return
    setDeletingAnnouncementId(id)
    try {
      await deleteAnnouncement(id)
      setAdminAnnouncements((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      console.error(err)
      alert(`Failed to delete announcement: ${err.message}`)
    } finally {
      setDeletingAnnouncementId(null)
    }
  }

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

  // Filtered announcements
  const filteredAnnouncements = adminAnnouncements.filter((item) => {
    if (announcementCategoryFilter !== 'ALL') {
      if (
        announcementCategoryFilter === 'GENERAL' &&
        !item.category.includes('General') &&
        !item.category.includes('Holiday') &&
        !item.category.includes('Important')
      ) {
        return false
      }
      if (
        announcementCategoryFilter === 'ACADEMIC' &&
        !item.category.includes('Academic') &&
        !item.category.includes('Examination')
      ) {
        return false
      }
      if (
        announcementCategoryFilter === 'URGENT' &&
        !item.category.includes('Urgent') &&
        item.priority !== 'Urgent'
      ) {
        return false
      }
    }
    if (announcementSearch.trim()) {
      const q = announcementSearch.toLowerCase()
      const matchTitle = item.title?.toLowerCase().includes(q)
      const matchDesc = item.description?.toLowerCase().includes(q)
      const matchSender = item.sender_name?.toLowerCase().includes(q)
      const matchSub =
        item.subjects?.subject_code?.toLowerCase().includes(q) ||
        item.subjects?.subject_name?.toLowerCase().includes(q)
      if (!matchTitle && !matchDesc && !matchSender && !matchSub) return false
    }
    return true
  })

  return (
    <div className="min-h-screen bg-[#F5F6F3] text-[#252B27]">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="md:pl-64 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* Page Header (Donezo Template Format) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#252B27]">
                Dashboard
              </h1>
              <span className="rounded-full bg-[#EAF3ED] border border-[#21845A]/20 px-2.5 py-0.5 text-xs font-semibold text-[#145C3A]">
                Institutional Administration
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-[#78817B]">
              Manage user accounts, curriculum allocations, campus circulars, and system audit records.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setAnnouncementModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#145C3A] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#21845A] shadow-sm transition-colors"
            >
              <Megaphone className="h-4 w-4" />
              <span>Publish Announcement</span>
            </button>

            <button
              type="button"
              onClick={() => {
                loadStats()
                if (activeTab === 'directory') loadProfiles()
                if (activeTab === 'audit') loadAuditLogs()
                if (activeTab === 'announcements') loadAdminAnnouncements()
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[#E8ECE7] bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#252B27] hover:bg-[#F5F6F3] shadow-sm transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#78817B]" />
              <span>Refresh Data</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Pill Bar */}
        <div className="overflow-x-auto pb-1">
          <nav className="flex space-x-2 whitespace-nowrap">
            <button
              onClick={() => setActiveTab('overview')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all shadow-sm ${
                activeTab === 'overview'
                  ? 'bg-[#145C3A] text-white'
                  : 'bg-white border border-[#E8ECE7] text-[#78817B] hover:text-[#252B27] hover:bg-[#F5F6F3]'
              }`}
            >
              System Overview
            </button>
            <button
              onClick={() => setActiveTab('provisioning')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm ${
                activeTab === 'provisioning'
                  ? 'bg-[#145C3A] text-white'
                  : 'bg-white border border-[#E8ECE7] text-[#78817B] hover:text-[#252B27] hover:bg-[#F5F6F3]'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Account Provisioning</span>
            </button>
            <button
              onClick={() => setActiveTab('directory')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm ${
                activeTab === 'directory'
                  ? 'bg-[#145C3A] text-white'
                  : 'bg-white border border-[#E8ECE7] text-[#78817B] hover:text-[#252B27] hover:bg-[#F5F6F3]'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Roster & Users</span>
            </button>
            <button
              onClick={() => setActiveTab('academics')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm ${
                activeTab === 'academics'
                  ? 'bg-[#145C3A] text-white'
                  : 'bg-white border border-[#E8ECE7] text-[#78817B] hover:text-[#252B27] hover:bg-[#F5F6F3]'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Academic Management</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('announcements')
                loadAdminAnnouncements(true)
              }}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm ${
                activeTab === 'announcements'
                  ? 'bg-[#145C3A] text-white'
                  : 'bg-white border border-[#E8ECE7] text-[#78817B] hover:text-[#252B27] hover:bg-[#F5F6F3]'
              }`}
            >
              <Megaphone className="h-3.5 w-3.5" />
              <span>Announcements</span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm ${
                activeTab === 'audit'
                  ? 'bg-[#145C3A] text-white'
                  : 'bg-white border border-[#E8ECE7] text-[#78817B] hover:text-[#252B27] hover:bg-[#F5F6F3]'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Audit Logs</span>
            </button>
          </nav>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* 4-Card Hero Grid (Donezo Pattern) */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Hero Deep Forest Green Card */}
              <div className="rounded-2xl bg-[#145C3A] text-white p-5 sm:p-6 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/90">
                    Active Students
                  </span>
                  <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                    <BookOpen className="h-4 w-4" />
                  </div>
                </div>
                <div className="my-2">
                  <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                    {loadingStats ? '...' : stats.activeStudents}
                  </div>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#21845A] px-2.5 py-0.5 text-[11px] font-semibold text-white/95">
                    <span>Classroom Roster: 25 Target</span>
                  </span>
                </div>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
              </div>

              {/* Card 2: White Card - Active Faculty */}
              <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#78817B]">
                    Active Faculty
                  </span>
                  <div className="h-8 w-8 rounded-full border border-[#E8ECE7] flex items-center justify-center text-[#78817B]">
                    <Award className="h-4 w-4" />
                  </div>
                </div>
                <div className="my-2">
                  <div className="text-3xl sm:text-4xl font-bold text-[#252B27] tracking-tight">
                    {loadingStats ? '...' : stats.activeFaculty}
                  </div>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF3ED] px-2.5 py-0.5 text-[11px] font-semibold text-[#145C3A]">
                    <span>Assigned Department Instructors</span>
                  </span>
                </div>
              </div>

              {/* Card 3: White Card - Active Subjects */}
              <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#78817B]">
                    Active Subjects
                  </span>
                  <div className="h-8 w-8 rounded-full border border-[#E8ECE7] flex items-center justify-center text-[#78817B]">
                    <Calendar className="h-4 w-4" />
                  </div>
                </div>
                <div className="my-2">
                  <div className="text-3xl sm:text-4xl font-bold text-[#252B27] tracking-tight">
                    {loadingStats ? '...' : stats.activeSubjects}
                  </div>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F6F3] border border-[#E8ECE7] px-2.5 py-0.5 text-[11px] font-semibold text-[#78817B]">
                    <span>Curriculum courses active</span>
                  </span>
                </div>
              </div>

              {/* Card 4: White Card - Attendance Sessions */}
              <div className="rounded-2xl border border-[#E8ECE7] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#78817B]">
                    Attendance Sessions
                  </span>
                  <div className="h-8 w-8 rounded-full border border-[#E8ECE7] flex items-center justify-center text-[#78817B]">
                    <Activity className="h-4 w-4" />
                  </div>
                </div>
                <div className="my-2">
                  <div className="text-3xl sm:text-4xl font-bold text-[#252B27] tracking-tight">
                    {loadingStats ? '...' : stats.totalSessions}
                  </div>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF3ED] px-2.5 py-0.5 text-[11px] font-semibold text-[#145C3A]">
                    <span>Recorded lecture sessions</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Institutional Security Policy Status Card */}
            <div className="rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-[#EAF3ED] text-[#145C3A] flex items-center justify-center">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#252B27]">Institutional Security Status</h2>
                  <p className="text-xs text-[#78817B]">
                    Security hardening parameters enforced at the database and application layer:
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#E8ECE7] bg-[#F5F6F3]/50 p-4">
                  <p className="text-xs font-semibold text-[#78817B]">Authentication Model</p>
                  <p className="mt-1 font-mono text-sm font-bold text-[#145C3A]">
                    College Login ID
                  </p>
                  <p className="mt-1 text-[11px] text-[#78817B]">
                    Internal mapping; zero external email dependency
                  </p>
                </div>

                <div className="rounded-2xl border border-[#E8ECE7] bg-[#F5F6F3]/50 p-4">
                  <p className="text-xs font-semibold text-[#78817B]">Public Self-Registration</p>
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#145C3A]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Strictly Disabled</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#78817B]">
                    Admin-controlled account provisioning only
                  </p>
                </div>

                <div className="rounded-2xl border border-[#E8ECE7] bg-[#F5F6F3]/50 p-4">
                  <p className="text-xs font-semibold text-[#78817B]">Row Level Security (RLS)</p>
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#145C3A]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Active on all 12 Tables</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#78817B]">
                    Zero anonymous access, role authorization
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACCOUNT PROVISIONING */}
        {activeTab === 'provisioning' && (
          <div className="max-w-2xl">
            <div className="rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EAF3ED] text-[#145C3A] border border-[#21845A]/20">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#252B27]">
                    Provision College Account
                  </h2>
                  <p className="text-xs text-[#78817B]">
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
                  <label className="block text-xs font-semibold text-[#252B27]">
                    College Login ID *
                  </label>
                  <div className="relative mt-1">
                    <input
                      type="text"
                      required
                      placeholder="e.g. ADMIN002, FAC002, STU002"
                      value={provForm.loginId}
                      onChange={(e) => setProvForm({ ...provForm, loginId: e.target.value.toUpperCase() })}
                      className="block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3.5 py-2 font-mono text-sm uppercase tracking-wider text-[#252B27] placeholder-[#78817B] placeholder:normal-case placeholder:tracking-normal focus:border-[#145C3A] focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-[#78817B]">
                    Admin format: ADMIN001... • Faculty format: FAC001... • Student format: STU001...
                  </p>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-[#252B27]">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Robert Davis or Sarah Miller"
                    value={provForm.fullName}
                    onChange={(e) => setProvForm({ ...provForm, fullName: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3.5 py-2 text-sm text-[#252B27] placeholder-[#78817B] focus:border-[#145C3A] focus:bg-white focus:outline-none transition-colors"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-[#252B27]">
                    Temporary Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 8 characters"
                    value={provForm.password}
                    onChange={(e) => setProvForm({ ...provForm, password: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3.5 py-2 text-sm text-[#252B27] placeholder-[#78817B] focus:border-[#145C3A] focus:bg-white focus:outline-none transition-colors"
                  />
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-xs font-semibold text-[#252B27]">
                    Account Role *
                  </label>
                  <select
                    value={provForm.role}
                    onChange={(e) => setProvForm({ ...provForm, role: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3 py-2 text-xs font-semibold text-[#252B27] focus:border-[#145C3A] focus:outline-none transition-colors"
                  >
                    <option value="student">Student (Classroom Roster)</option>
                    <option value="faculty">Faculty (Academic Instructor)</option>
                    <option value="admin">Administrator (Full Access)</option>
                  </select>
                </div>

                {/* Conditional Roll Number / Employee ID */}
                {provForm.role === 'student' && (
                  <div>
                    <label className="block text-xs font-semibold text-[#252B27]">
                      Roll Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. STU002 or CS-2026-02"
                      value={provForm.rollNumber}
                      onChange={(e) => setProvForm({ ...provForm, rollNumber: e.target.value })}
                      className="mt-1 block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3.5 py-2 text-sm text-[#252B27] placeholder-[#78817B] focus:border-[#145C3A] focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                )}

                {provForm.role === 'faculty' && (
                  <div>
                    <label className="block text-xs font-semibold text-[#252B27]">
                      Faculty Employee ID *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. FAC002"
                      value={provForm.employeeId}
                      onChange={(e) => setProvForm({ ...provForm, employeeId: e.target.value })}
                      className="mt-1 block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3.5 py-2 text-sm text-[#252B27] placeholder-[#78817B] focus:border-[#145C3A] focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                )}

                {/* Submit */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={provSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#145C3A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#21845A] disabled:opacity-50 transition-colors shadow-sm"
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

              <div className="mt-6 rounded-2xl border border-[#E8ECE7] bg-[#F5F6F3] p-4 text-xs text-[#78817B]">
                <p className="font-semibold text-[#252B27] flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#145C3A]" />
                  <span>Security &amp; Service Role Isolation:</span>
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
          <div className="space-y-6">
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
                <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-[#78817B]" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border border-[#E8ECE7] bg-white py-2 pl-10 pr-4 text-xs text-[#252B27] placeholder-[#78817B] focus:border-[#145C3A] focus:outline-none shadow-sm transition-colors"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[#78817B]">Role Filter:</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="rounded-full border border-[#E8ECE7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#252B27] focus:border-[#145C3A] focus:outline-none shadow-sm"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="faculty">Faculty</option>
                  <option value="student">Student</option>
                </select>
              </div>
            </div>

            {/* Profiles Table */}
            <div className="overflow-hidden rounded-2xl border border-[#E8ECE7] bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#E8ECE7] text-left text-sm text-[#252B27]">
                  <thead className="bg-[#F5F6F3] text-xs font-semibold uppercase tracking-wider text-[#78817B]">
                    <tr>
                      <th className="px-6 py-3.5">Login ID</th>
                      <th className="px-6 py-3.5">User Profile</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8ECE7] font-normal">
                    {loadingProfiles ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-[#78817B]">
                          Loading user directory...
                        </td>
                      </tr>
                    ) : filteredProfiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-[#78817B]">
                          No matching profiles found in database.
                        </td>
                      </tr>
                    ) : (
                      filteredProfiles.map((p) => (
                        <tr key={p.id} className="hover:bg-[#F5F6F3]/50 transition-colors">
                          <td className="px-6 py-4 font-mono text-sm font-bold text-[#145C3A] whitespace-nowrap">
                            {p.login_id || p.email?.split('@')[0]?.toUpperCase() || '-'}
                          </td>
                          <td className="px-6 py-4 font-medium whitespace-nowrap">
                            <div className="font-semibold text-[#252B27]">{p.full_name || 'Academic User'}</div>
                            <div className="text-[11px] font-mono text-[#78817B]">{p.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                                p.role === 'admin'
                                  ? 'bg-[#EAF3ED] text-[#145C3A] border border-[#21845A]/30'
                                  : p.role === 'faculty'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              }`}
                            >
                              {p.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {p.is_active ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#145C3A]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Active</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC2626]">
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
                                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors shadow-sm ${
                                  p.is_active
                                    ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                    : 'border-[#21845A]/30 bg-[#EAF3ED] text-[#145C3A] hover:bg-[#145C3A] hover:text-white'
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
                                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-[#DC2626] transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:border-[#E8ECE7] shadow-sm"
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
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#252B27]">Attendance Audit Trail</h2>
                <p className="text-xs text-[#78817B]">
                  Immutable record of session starts, attendance marks, finalizations, and admin corrections.
                </p>
              </div>
              <button
                type="button"
                onClick={loadAuditLogs}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8ECE7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#252B27] hover:bg-[#F5F6F3] shadow-sm"
              >
                <RefreshCw className="h-3.5 w-3.5 text-[#78817B]" />
                <span>Refresh Logs</span>
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#E8ECE7] bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#E8ECE7] text-left text-sm text-[#252B27]">
                  <thead className="bg-[#F5F6F3] text-xs font-semibold uppercase tracking-wider text-[#78817B]">
                    <tr>
                      <th className="px-6 py-3.5">Timestamp</th>
                      <th className="px-6 py-3.5">Action</th>
                      <th className="px-6 py-3.5">Session ID</th>
                      <th className="px-6 py-3.5">Status Transition</th>
                      <th className="px-6 py-3.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8ECE7] font-normal">
                    {loadingLogs ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-[#78817B]">
                          Loading audit trail...
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-[#78817B]">
                          No audit log records found.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-[#F5F6F3]/50 text-xs">
                          <td className="px-6 py-3.5 whitespace-nowrap text-[#78817B]">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5 whitespace-nowrap font-semibold">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                                log.action === 'session_finalized'
                                  ? 'bg-[#EAF3ED] text-[#145C3A] border-[#21845A]/30'
                                  : log.action === 'session_started'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : log.action === 'attendance_corrected'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-[#F5F6F3] text-[#78817B] border border-[#E8ECE7]'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 font-mono text-[11px] text-[#78817B]">
                            {log.session_id ? log.session_id.slice(0, 8) + '...' : '-'}
                          </td>
                          <td className="px-6 py-3.5 whitespace-nowrap">
                            {log.old_status ? (
                              <span>
                                {log.old_status} →{' '}
                                <strong className="text-[#252B27]">{log.new_status}</strong>
                              </span>
                            ) : log.new_status ? (
                              <span className="text-[#252B27] font-semibold">{log.new_status}</span>
                            ) : (
                              <span className="text-[#78817B]">-</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-[11px] text-[#78817B] truncate max-w-xs">
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

        {/* TAB 6: ANNOUNCEMENTS & NOTICES */}
        {activeTab === 'announcements' && (
          <div className="space-y-6">
            {/* Header & Actions */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#252B27] flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-[#145C3A]" />
                  <span>Institution Announcements &amp; Circulars</span>
                </h2>
                <p className="text-xs text-[#78817B]">
                  Publish campus-wide announcements, review notices from faculty, and manage broadcast communications.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAnnouncementModalOpen(true)}
                className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#145C3A] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#21845A] transition-colors"
              >
                <Megaphone className="h-4 w-4" />
                <span>Publish Announcement</span>
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="rounded-2xl border border-[#E8ECE7] bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: 'ALL', label: 'All Notices' },
                    { id: 'GENERAL', label: 'General' },
                    { id: 'ACADEMIC', label: 'Academic' },
                    { id: 'URGENT', label: 'Urgent' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setAnnouncementCategoryFilter(tab.id)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                        announcementCategoryFilter === tab.id
                          ? 'bg-[#145C3A] text-white shadow-sm'
                          : 'bg-white border border-[#E8ECE7] text-[#78817B] hover:bg-[#F5F6F3] hover:text-[#252B27]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="text-xs font-semibold text-[#78817B]">
                  Total Announcements: <span className="font-bold text-[#252B27]">{adminAnnouncements.length}</span>
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-[#78817B]" />
                <input
                  type="text"
                  value={announcementSearch}
                  onChange={(e) => setAnnouncementSearch(e.target.value)}
                  placeholder="Search announcements by title, content, publisher, or subject code..."
                  className="w-full rounded-full border border-[#E8ECE7] bg-[#F5F6F3] py-2 pl-10 pr-4 text-xs text-[#252B27] placeholder-[#78817B] focus:border-[#145C3A] focus:bg-white focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Announcements Table */}
            <div className="overflow-hidden rounded-2xl border border-[#E8ECE7] bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#E8ECE7] text-left text-xs text-[#252B27]">
                  <thead className="bg-[#F5F6F3] uppercase tracking-wider text-[#78817B] font-semibold">
                    <tr>
                      <th className="px-6 py-3.5">Title &amp; Message</th>
                      <th className="px-6 py-3.5">Category</th>
                      <th className="px-6 py-3.5">Target Course</th>
                      <th className="px-6 py-3.5">Published By</th>
                      <th className="px-6 py-3.5">Published Date</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8ECE7]">
                    {loadingAdminAnnouncements ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-[#78817B]">
                          Loading institutional announcements...
                        </td>
                      </tr>
                    ) : filteredAnnouncements.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-[#78817B]">
                          No announcements match your search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredAnnouncements.map((ann) => {
                        const catStyle = CATEGORY_STYLES[ann.category] || CATEGORY_STYLES['General Announcement']
                        const isUrgent = ann.priority === 'Urgent' || ann.category === 'Urgent Notice'

                        return (
                          <tr key={ann.id} className="hover:bg-[#F5F6F3]/50 transition-colors">
                            <td className="px-6 py-4 max-w-sm">
                              <div className="font-bold text-[#252B27] truncate text-sm">
                                {ann.title}
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-[#78817B]">
                                {ann.description}
                              </p>
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${catStyle.badge}`}>
                                  {ann.category}
                                </span>
                                {isUrgent && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700 border border-rose-200">
                                    <Flame className="h-2.5 w-2.5" />
                                    Urgent
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">
                              {ann.subjects ? (
                                <span className="rounded-full bg-[#F5F6F3] border border-[#E8ECE7] px-2.5 py-0.5 text-[#252B27]">
                                  {ann.subjects.subject_code}
                                </span>
                              ) : (
                                <span className="text-[#78817B]">General</span>
                              )}
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap text-[#252B27]">
                              <div className="font-semibold">{ann.sender_name}</div>
                              {ann.profiles?.login_id && (
                                <span className="text-[10px] font-mono text-[#78817B]">
                                  {ann.profiles.login_id}
                                </span>
                              )}
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap text-[#78817B]">
                              <div>{ann.publication_date || 'Date'}</div>
                              <div className="text-[10px] text-[#78817B]">{ann.relative_time}</div>
                            </td>

                            <td className="px-6 py-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAdminAnnouncement(ann)}
                                  className="inline-flex items-center gap-1 rounded-full border border-[#E8ECE7] bg-white px-3 py-1 text-xs font-semibold text-[#252B27] hover:bg-[#F5F6F3] shadow-sm transition-colors"
                                >
                                  <Eye className="h-3 w-3" />
                                  <span>View</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteAnnouncement(e, ann.id)}
                                  disabled={deletingAnnouncementId === ann.id}
                                  className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-[#DC2626] hover:bg-red-100 disabled:opacity-50 transition-colors shadow-sm"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
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

      <CreateAnnouncementModal
        isOpen={announcementModalOpen}
        onClose={() => setAnnouncementModalOpen(false)}
        currentUser={profile}
        subjects={subjectsList}
        onSuccess={() => {
          loadAdminAnnouncements()
        }}
      />

      <NotificationDetailModal
        isOpen={Boolean(selectedAdminAnnouncement)}
        notification={selectedAdminAnnouncement}
        onClose={() => setSelectedAdminAnnouncement(null)}
      />
    </div>
  )
}
