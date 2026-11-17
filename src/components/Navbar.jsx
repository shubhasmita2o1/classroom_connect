import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getStudentUnreadCount } from '../services/notificationService'
import ChangePasswordModal from './ChangePasswordModal'
import {
  GraduationCap,
  Shield,
  Award,
  BookOpen,
  LogOut,
  Menu,
  X,
  User,
  KeyRound,
  Bell,
  Search,
  LayoutDashboard,
  CalendarCheck,
  Megaphone,
  UserPlus,
  Users,
  Activity,
} from 'lucide-react'

export default function Navbar({ activeTab, onTabChange }) {
  const { profile, role, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let ignore = false
    async function updateCount() {
      if (role === 'student' && user?.id) {
        const { data: stu } = await supabase
          .from('students')
          .select('id')
          .eq('profile_id', user.id)
          .maybeSingle()
        if (stu?.id && !ignore) {
          const count = await getStudentUnreadCount(stu.id)
          if (!ignore) setUnreadCount(count)
        }
      }
    }

    updateCount()

    const handleUpdate = () => {
      updateCount()
    }
    window.addEventListener('classroom:notifications-updated', handleUpdate)
    return () => {
      ignore = true
      window.removeEventListener('classroom:notifications-updated', handleUpdate)
    }
  }, [role, user])

  const handleNotificationClick = () => {
    const el = document.getElementById('announcements-section')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate('/student')
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
    navigate('/login', { replace: true })
  }

  const roleBadgeConfig = {
    admin: {
      label: 'Administrator',
      bg: 'bg-[#EAF3ED] border-[#21845A]/30 text-[#145C3A]',
      icon: <Shield className="h-3.5 w-3.5 mr-1 text-[#145C3A]" />,
    },
    faculty: {
      label: 'Faculty',
      bg: 'bg-[#EAF3ED] border-[#21845A]/30 text-[#145C3A]',
      icon: <Award className="h-3.5 w-3.5 mr-1 text-[#145C3A]" />,
    },
    student: {
      label: 'Student',
      bg: 'bg-[#EAF3ED] border-[#21845A]/30 text-[#145C3A]',
      icon: <BookOpen className="h-3.5 w-3.5 mr-1 text-[#145C3A]" />,
    },
  }[role] || {
    label: role || 'User',
    bg: 'bg-[#F5F6F3] border-[#E8ECE7] text-[#78817B]',
    icon: <User className="h-3.5 w-3.5 mr-1 text-[#78817B]" />,
  }

  // Navigation Links Definition by Role
  const getNavLinks = () => {
    if (role === 'admin') {
      return [
        { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { id: 'academics', label: 'Academic Mgmt', icon: <BookOpen className="h-4 w-4" /> },
        { id: 'directory', label: 'Roster & Users', icon: <Users className="h-4 w-4" /> },
        { id: 'provisioning', label: 'Provision User', icon: <UserPlus className="h-4 w-4" /> },
        { id: 'announcements', label: 'Announcements', icon: <Megaphone className="h-4 w-4" /> },
        { id: 'audit', label: 'System Logs', icon: <Activity className="h-4 w-4" /> },
      ]
    }
    if (role === 'faculty') {
      return [
        { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, href: '#top' },
        { id: 'workspace', label: 'Attendance Sheet', icon: <CalendarCheck className="h-4 w-4" />, href: '#attendance-workspace' },
        { id: 'sessions', label: 'Recent Sessions', icon: <BookOpen className="h-4 w-4" />, href: '#recent-sessions' },
        { id: 'announcements', label: 'Announcements', icon: <Megaphone className="h-4 w-4" />, href: '#announcements-section' },
      ]
    }
    // Student
    return [
      { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, href: '#top' },
      { id: 'courses', label: 'Subject Breakdown', icon: <BookOpen className="h-4 w-4" />, href: '#subjects-breakdown' },
      { id: 'history', label: 'Lecture Log', icon: <CalendarCheck className="h-4 w-4" />, href: '#attendance-history' },
      {
        id: 'announcements',
        label: 'Announcements',
        icon: <Megaphone className="h-4 w-4" />,
        href: '#announcements-section',
        badge: unreadCount,
      },
    ]
  }

  const navLinks = getNavLinks()

  const handleLinkClick = (link) => {
    setMobileMenuOpen(false)
    if (role === 'admin' && onTabChange) {
      onTabChange(link.id)
    } else if (link.href) {
      if (link.href === '#top') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        const el = document.querySelector(link.href)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  const isLinkActive = (link) => {
    if (role === 'admin') {
      return activeTab === link.id
    }
    return link.id === 'overview'
  }

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'CC'

  return (
    <>
      {/* Desktop Fixed Left Sidebar (Donezo Visual Blueprint) */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-[#E8ECE7] z-40 flex-col justify-between p-5 select-none">
        <div>
          {/* Brand Header */}
          <div className="flex items-center gap-3 px-2 py-1 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#145C3A] text-white shadow-sm shrink-0">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-[#252B27]">
                  Classroom Connect
                </span>
              </div>
              <p className="text-[11px] text-[#78817B] font-medium leading-tight">
                Academic Management
              </p>
            </div>
          </div>

          {/* MENU Section */}
          <div className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#78817B] mb-2">
              Menu
            </p>
            {navLinks.map((link) => {
              const active = isLinkActive(link)
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => handleLinkClick(link)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                    active
                      ? 'bg-[#145C3A] text-white shadow-sm'
                      : 'text-[#78817B] hover:bg-[#F5F6F3] hover:text-[#252B27]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={active ? 'text-white' : 'text-[#78817B]'}>{link.icon}</span>
                    <span>{link.label}</span>
                  </div>
                  {link.badge > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        active ? 'bg-white text-[#145C3A]' : 'bg-[#145C3A] text-white'
                      }`}
                    >
                      {link.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* GENERAL Section */}
          <div className="mt-8 space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#78817B] mb-2">
              General
            </p>
            <button
              type="button"
              onClick={() => setPasswordModalOpen(true)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-[#78817B] hover:bg-[#F5F6F3] hover:text-[#252B27] transition-all"
            >
              <KeyRound className="h-4 w-4 text-[#78817B]" />
              <span>Change Password</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-[#78817B] hover:bg-[#FEF2F2] hover:text-[#DC2626] transition-all disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              <span>{signingOut ? 'Signing out...' : 'Logout'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Feature Card (Dark Green Pill/Card) */}
        <div className="rounded-2xl bg-[#145C3A] text-white p-4 shadow-sm relative overflow-hidden mt-6">
          <div className="relative z-10 space-y-1">
            <div className="inline-block rounded-full bg-[#21845A] px-2.5 py-0.5 text-[10px] font-semibold text-white/90">
              Department of CSE
            </div>
            <h4 className="text-sm font-bold text-white mt-1">Classroom Connect</h4>
            <p className="text-[11px] text-white/80 leading-snug">
              Single-classroom attendance &amp; academic notification platform.
            </p>
          </div>
          {/* Decorative subtle background wave circles */}
          <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute right-8 -bottom-8 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />
        </div>
      </aside>

      {/* Top Header Bar (Desktop & Mobile) */}
      <header className="sticky top-0 z-30 md:pl-64 border-b border-[#E8ECE7] bg-[#F5F6F3]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Mobile Brand / Desktop Search */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#145C3A] text-white shadow-sm">
                <GraduationCap className="h-5 w-5" />
              </div>
              <span className="text-base font-bold text-[#252B27]">Classroom Connect</span>
            </div>

            {/* Desktop Search Pill */}
            <div className="hidden md:flex items-center relative w-72 lg:w-80">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-[#78817B]" />
              <input
                type="text"
                placeholder="Search portal, subjects, students..."
                className="w-full rounded-full border border-[#E8ECE7] bg-white py-2 pl-10 pr-12 text-xs text-[#252B27] placeholder-[#78817B] focus:border-[#145C3A] focus:outline-none shadow-sm transition-all"
              />
              <span className="absolute right-3 top-2 rounded bg-[#F5F6F3] border border-[#E8ECE7] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#78817B]">
                ⌘K
              </span>
            </div>
          </div>

          {/* Desktop Right Utilities (Notifications + Profile) */}
          <div className="flex items-center gap-3">
            {/* Notification Bell Button */}
            <button
              type="button"
              onClick={handleNotificationClick}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E8ECE7] bg-white text-[#252B27] shadow-sm transition-colors hover:bg-[#F5F6F3]"
              title={
                role === 'student'
                  ? `Announcements (${unreadCount} unread)`
                  : 'Announcements & Circulars'
              }
              aria-label={`View announcements, ${unreadCount} unread`}
            >
              <Bell className="h-4 w-4 text-[#252B27]" />
              {role === 'student' && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#145C3A] px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* User Profile Pill */}
            {profile && (
              <div className="flex items-center gap-3 pl-2 sm:border-l sm:border-[#E8ECE7]">
                <div className="hidden sm:block text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs font-bold text-[#252B27]">
                      {profile.full_name || 'Academic User'}
                    </span>
                    <span className="rounded-full bg-[#F5F6F3] border border-[#E8ECE7] px-2 py-0.5 font-mono text-[10px] font-bold text-[#145C3A]">
                      {profile.login_id || 'ID'}
                    </span>
                  </div>
                  <p className="text-[10px] font-medium text-[#78817B]">
                    {roleBadgeConfig.label} • College ID: {profile.login_id}
                  </p>
                </div>

                <div className="h-10 w-10 rounded-full bg-[#145C3A] text-white flex items-center justify-center text-xs font-bold shadow-sm border-2 border-white">
                  {initials}
                </div>
              </div>
            )}

            {/* Mobile Hamburger Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E8ECE7] bg-white text-[#252B27] hover:bg-[#F5F6F3] shadow-sm"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-[#E8ECE7] bg-white px-4 py-4 md:hidden space-y-4 shadow-xl">
            {profile && (
              <div className="space-y-1 border-b border-[#E8ECE7] pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#252B27]">
                    {profile.full_name}
                  </span>
                  <span className="rounded-full bg-[#EAF3ED] px-2 py-0.5 font-mono text-xs font-bold text-[#145C3A] border border-[#21845A]/30">
                    {profile.login_id}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#78817B]">
                  <span>Role: {roleBadgeConfig.label}</span>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#78817B] px-1">
                Navigation
              </p>
              {navLinks.map((link) => {
                const active = isLinkActive(link)
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => handleLinkClick(link)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      active
                        ? 'bg-[#145C3A] text-white shadow-sm'
                        : 'text-[#78817B] hover:bg-[#F5F6F3] hover:text-[#252B27]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={active ? 'text-white' : 'text-[#78817B]'}>{link.icon}</span>
                      <span>{link.label}</span>
                    </div>
                    {link.badge > 0 && (
                      <span className="rounded-full bg-[#145C3A] text-white px-2 py-0.5 text-[10px] font-bold">
                        {link.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="border-t border-[#E8ECE7] pt-3 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false)
                  setPasswordModalOpen(true)
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[#E8ECE7] bg-[#F5F6F3] px-4 py-2.5 text-xs font-semibold text-[#252B27] hover:bg-[#E8ECE7]"
              >
                <KeyRound className="h-4 w-4 text-[#78817B]" />
                <span>Change Password</span>
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-[#DC2626] hover:bg-red-100"
              >
                <LogOut className="h-4 w-4" />
                <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </>
  )
}
