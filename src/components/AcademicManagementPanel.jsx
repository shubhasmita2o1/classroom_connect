import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import AlertBanner from './AlertBanner'
import SubjectFormModal from './SubjectFormModal'
import {
  BookOpen,
  PlusCircle,
  Search,
  Pencil,
  CheckCircle2,
  XCircle,
  Trash2,
  Award,
  Link2,
  Unlink,
  RefreshCw,
  ArrowRightLeft,
  History,
} from 'lucide-react'

export default function AcademicManagementPanel({ onDataChanged }) {
  // Core academic data
  const [subjectsList, setSubjectsList] = useState([])
  const [activeFacultyList, setActiveFacultyList] = useState([])
  const [allocationsList, setAllocationsList] = useState([])
  const [loading, setLoading] = useState(true)

  // Feedback banners
  const [successMessage, setSuccessMessage] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  // Subject filters & modal state
  const [subjectSearch, setSubjectSearch] = useState('')
  const [subjectStatusFilter, setSubjectStatusFilter] = useState('all')
  const [subjectModalState, setSubjectModalState] = useState(null) // { mode: 'create' | 'edit', subject?: obj }
  const [busySubjectId, setBusySubjectId] = useState(null)

  // Faculty allocation form state
  const [selectedFacultyId, setSelectedFacultyId] = useState('')
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([])
  const [allocSubmitting, setAllocSubmitting] = useState(false)

  // Allocation view & reassignment state
  const [allocationViewMode, setAllocationViewMode] = useState('active') // 'active' | 'history'
  const [allocationFacultyFilter, setAllocationFacultyFilter] = useState('all')
  const [reassignTargetId, setReassignTargetId] = useState(null)
  const [reassignFacultyId, setReassignFacultyId] = useState('')
  const [busyAllocationId, setBusyAllocationId] = useState(null)

  const fetchAcademicSnapshot = useCallback(async () => {
    const [
      { data: subjectsData, error: subjectsErr },
      { data: facultyData, error: facultyErr },
      { data: allocationsData, error: allocationsErr },
    ] = await Promise.all([
      supabase
        .from('subjects')
        .select('id, subject_code, subject_name, description, is_active, created_at, updated_at')
        .order('subject_code', { ascending: true }),
      supabase
        .from('faculty')
        .select('id, employee_id, full_name, email, is_active, is_archived')
        .eq('is_active', true)
        .order('employee_id', { ascending: true }),
      supabase
        .from('faculty_subjects')
        .select(
          'id, faculty_id, subject_id, is_active, assigned_at, faculty(id, employee_id, full_name, is_active), subjects(id, subject_code, subject_name, is_active)'
        )
        .order('assigned_at', { ascending: false }),
    ])

    if (subjectsErr) throw subjectsErr
    if (facultyErr) throw facultyErr
    if (allocationsErr) throw allocationsErr

    return {
      subjectsData: subjectsData || [],
      validFaculty: (facultyData || []).filter((f) => f.is_archived !== true),
      allocationsData: allocationsData || [],
    }
  }, [])

  const applyAcademicSnapshot = useCallback(({ subjectsData, validFaculty, allocationsData }) => {
    setSubjectsList(subjectsData)
    setActiveFacultyList(validFaculty)
    setAllocationsList(allocationsData)
    setSelectedFacultyId((prev) =>
      validFaculty.some((f) => f.id === prev) ? prev : validFaculty[0]?.id || ''
    )
  }, [])

  const loadAcademicData = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true)
      try {
        const snapshot = await fetchAcademicSnapshot()
        applyAcademicSnapshot(snapshot)
      } catch (err) {
        setErrorMessage(`Failed to load academic data: ${err.message}`)
      } finally {
        setLoading(false)
      }
    },
    [fetchAcademicSnapshot, applyAcademicSnapshot]
  )

  useEffect(() => {
    let ignore = false

    async function init() {
      try {
        const snapshot = await fetchAcademicSnapshot()
        if (!ignore) applyAcademicSnapshot(snapshot)
      } catch (err) {
        if (!ignore) setErrorMessage(`Failed to load academic data: ${err.message}`)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    init()
    return () => {
      ignore = true
    }
  }, [fetchAcademicSnapshot, applyAcademicSnapshot])

  const notifyParentChanged = async () => {
    if (onDataChanged) {
      await onDataChanged()
    }
  }

  // Subject Activation / Deactivation
  const handleToggleSubjectActive = async (subject) => {
    setSuccessMessage(null)
    setErrorMessage(null)

    const nextState = !subject.is_active
    const confirmMsg = nextState
      ? `Activate subject ${subject.subject_code} (${subject.subject_name})? It will become available in the classroom curriculum and for faculty allocation.`
      : `Deactivate subject ${subject.subject_code} (${subject.subject_name})? New attendance sessions and allocations will be paused, while all historical attendance records remain preserved.`

    if (!window.confirm(confirmMsg)) return

    setBusySubjectId(subject.id)
    try {
      const { error } = await supabase
        .from('subjects')
        .update({ is_active: nextState })
        .eq('id', subject.id)

      if (error) throw error

      setSuccessMessage(
        nextState
          ? `Subject ${subject.subject_code} has been activated.`
          : `Subject ${subject.subject_code} has been deactivated. Historical attendance records remain intact.`
      )
      await Promise.all([loadAcademicData(), notifyParentChanged()])
    } catch (err) {
      setErrorMessage(`Failed to update subject status: ${err.message}`)
    } finally {
      setBusySubjectId(null)
    }
  }

  // Safe Subject Deletion (only when zero historical sessions, assignments, or allocations exist)
  const handleDeleteSubject = async (subject) => {
    setSuccessMessage(null)
    setErrorMessage(null)
    setBusySubjectId(subject.id)

    try {
      const [
        { count: sessionCount, error: sessErr },
        { count: assignmentCount, error: assignErr },
        { count: allocCount, error: allocErr },
      ] = await Promise.all([
        supabase
          .from('attendance_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('subject_id', subject.id),
        supabase
          .from('assignments')
          .select('*', { count: 'exact', head: true })
          .eq('subject_id', subject.id),
        supabase
          .from('faculty_subjects')
          .select('*', { count: 'exact', head: true })
          .eq('subject_id', subject.id),
      ])

      if (sessErr) throw sessErr
      if (assignErr) throw assignErr
      if (allocErr) throw allocErr

      if ((sessionCount || 0) > 0 || (assignmentCount || 0) > 0 || (allocCount || 0) > 0) {
        setErrorMessage(
          `Cannot delete ${subject.subject_code} because it has linked academic history (${sessionCount || 0} sessions, ${assignmentCount || 0} assignments, ${allocCount || 0} allocations). Deactivate the subject instead to preserve academic history.`
        )
        return
      }

      if (
        !window.confirm(
          `Permanently delete unused subject ${subject.subject_code} (${subject.subject_name})? This cannot be undone.`
        )
      ) {
        return
      }

      const { error: delErr } = await supabase.from('subjects').delete().eq('id', subject.id)
      if (delErr) throw delErr

      setSuccessMessage(`Unused subject ${subject.subject_code} was removed.`)
      await Promise.all([loadAcademicData(), notifyParentChanged()])
    } catch (err) {
      setErrorMessage(`Failed to delete subject: ${err.message}`)
    } finally {
      setBusySubjectId(null)
    }
  }

  // Toggle subject checkbox for batch faculty allocation
  const handleToggleSubjectSelection = (subjectId) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId) ? prev.filter((id) => id !== subjectId) : [...prev, subjectId]
    )
  }

  // Assign one or more active subjects to selected active faculty member
  const handleAssignSubjects = async (e) => {
    e.preventDefault()
    setSuccessMessage(null)
    setErrorMessage(null)

    if (!selectedFacultyId) {
      setErrorMessage('Please select an active faculty member.')
      return
    }

    if (selectedSubjectIds.length === 0) {
      setErrorMessage('Please select at least one active subject to allocate.')
      return
    }

    const targetFaculty = activeFacultyList.find((f) => f.id === selectedFacultyId)
    if (!targetFaculty || !targetFaculty.is_active) {
      setErrorMessage('Only active faculty members can receive subject allocations.')
      return
    }

    const existingActiveForFaculty = new Set(
      allocationsList
        .filter((a) => a.faculty_id === selectedFacultyId && a.is_active)
        .map((a) => a.subject_id)
    )

    const newSubjectIds = selectedSubjectIds.filter((id) => !existingActiveForFaculty.has(id))
    if (newSubjectIds.length === 0) {
      setErrorMessage('All selected subjects are already allocated to this faculty member.')
      return
    }

    setAllocSubmitting(true)
    try {
      const nowIso = new Date().toISOString()
      const rows = newSubjectIds.map((subjectId) => ({
        faculty_id: selectedFacultyId,
        subject_id: subjectId,
        is_active: true,
        assigned_at: nowIso,
      }))

      const { error } = await supabase
        .from('faculty_subjects')
        .upsert(rows, { onConflict: 'faculty_id,subject_id' })

      if (error) throw error

      setSelectedSubjectIds([])
      setSuccessMessage(
        `Allocated ${newSubjectIds.length} subject${newSubjectIds.length > 1 ? 's' : ''} to ${targetFaculty.full_name} (${targetFaculty.employee_id}).`
      )
      await loadAcademicData()
    } catch (err) {
      setErrorMessage(`Allocation failed: ${err.message}`)
    } finally {
      setAllocSubmitting(false)
    }
  }

  // Remove (deactivate) an allocation while preserving history & attendance records
  const handleRemoveAllocation = async (allocation) => {
    setSuccessMessage(null)
    setErrorMessage(null)

    const facName = allocation.faculty?.full_name || 'Faculty'
    const subCode = allocation.subjects?.subject_code || 'Subject'

    if (
      !window.confirm(
        `Remove allocation of ${subCode} from ${facName}? Historical attendance sessions and records will remain intact.`
      )
    ) {
      return
    }

    setBusyAllocationId(allocation.id)
    try {
      const { error } = await supabase
        .from('faculty_subjects')
        .update({ is_active: false })
        .eq('id', allocation.id)

      if (error) throw error

      setSuccessMessage(`Removed allocation of ${subCode} from ${facName}. Historical attendance preserved.`)
      await loadAcademicData()
    } catch (err) {
      setErrorMessage(`Failed to remove allocation: ${err.message}`)
    } finally {
      setBusyAllocationId(null)
    }
  }

  // Re-activate an inactive allocation from history
  const handleReactivateAllocation = async (allocation) => {
    setSuccessMessage(null)
    setErrorMessage(null)

    if (!allocation.faculty?.is_active || !allocation.subjects?.is_active) {
      setErrorMessage('Both the faculty member and the subject must be active to re-allocate.')
      return
    }

    setBusyAllocationId(allocation.id)
    try {
      const { error } = await supabase
        .from('faculty_subjects')
        .update({ is_active: true, assigned_at: new Date().toISOString() })
        .eq('id', allocation.id)

      if (error) throw error

      setSuccessMessage(
        `Re-allocated ${allocation.subjects.subject_code} to ${allocation.faculty.full_name}.`
      )
      await loadAcademicData()
    } catch (err) {
      setErrorMessage(`Failed to re-allocate subject: ${err.message}`)
    } finally {
      setBusyAllocationId(null)
    }
  }

  // Change / Reassign an allocation from one active faculty member to another
  const handleConfirmReassign = async (allocation) => {
    setSuccessMessage(null)
    setErrorMessage(null)

    if (!reassignFacultyId) {
      setErrorMessage('Please select a target faculty member for reassignment.')
      return
    }

    if (reassignFacultyId === allocation.faculty_id) {
      setErrorMessage('Select a different faculty member to reassign this subject.')
      return
    }

    const alreadyAllocated = allocationsList.some(
      (a) => a.faculty_id === reassignFacultyId && a.subject_id === allocation.subject_id && a.is_active
    )

    if (alreadyAllocated) {
      setErrorMessage('The selected faculty member already has an active allocation for this subject.')
      return
    }

    const targetFaculty = activeFacultyList.find((f) => f.id === reassignFacultyId)
    if (!targetFaculty || !allocation.subjects?.is_active) {
      setErrorMessage('Only active faculty and active subjects can be allocated.')
      return
    }

    setBusyAllocationId(allocation.id)
    try {
      const { error: upsertErr } = await supabase
        .from('faculty_subjects')
        .upsert(
          {
            faculty_id: reassignFacultyId,
            subject_id: allocation.subject_id,
            is_active: true,
            assigned_at: new Date().toISOString(),
          },
          { onConflict: 'faculty_id,subject_id' }
        )

      if (upsertErr) throw upsertErr

      const { error: deactivateErr } = await supabase
        .from('faculty_subjects')
        .update({ is_active: false })
        .eq('id', allocation.id)

      if (deactivateErr) throw deactivateErr

      setReassignTargetId(null)
      setReassignFacultyId('')
      setSuccessMessage(
        `Reassigned ${allocation.subjects.subject_code} to ${targetFaculty.full_name} (${targetFaculty.employee_id}).`
      )
      await loadAcademicData()
    } catch (err) {
      setErrorMessage(`Failed to reassign allocation: ${err.message}`)
    } finally {
      setBusyAllocationId(null)
    }
  }

  // Derived data
  const activeSubjects = subjectsList.filter((s) => s.is_active)
  const activeAllocations = allocationsList.filter((a) => a.is_active)

  const filteredSubjects = subjectsList.filter((s) => {
    const q = subjectSearch.trim().toLowerCase()
    const matchesSearch =
      !q ||
      s.subject_code.toLowerCase().includes(q) ||
      s.subject_name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    const matchesStatus =
      subjectStatusFilter === 'all' ||
      (subjectStatusFilter === 'active' && s.is_active) ||
      (subjectStatusFilter === 'inactive' && !s.is_active)
    return matchesSearch && matchesStatus
  })

  const alreadyAllocatedForSelectedFaculty = new Set(
    activeAllocations.filter((a) => a.faculty_id === selectedFacultyId).map((a) => a.subject_id)
  )

  const displayedAllocations = allocationsList.filter((a) => {
    const matchesView = allocationViewMode === 'active' ? a.is_active : true
    const matchesFaculty =
      allocationFacultyFilter === 'all' || a.faculty_id === allocationFacultyFilter
    return matchesView && matchesFaculty
  })

  return (
    <div className="mt-8 space-y-8">
      {/* Feedback Alerts */}
      {successMessage && (
        <AlertBanner
          type="success"
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
        />
      )}

      {errorMessage && (
        <AlertBanner
          type="error"
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}

      {/* SECTION 1: SUBJECT MANAGEMENT */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-600/20 text-blue-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Subject Management</h2>
              <p className="text-xs text-slate-400">
                Create, edit, search, and activate/deactivate single-classroom curriculum subjects.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => loadAcademicData(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSuccessMessage(null)
                setErrorMessage(null)
                setSubjectModalState({ mode: 'create', subject: null })
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Add Subject</span>
            </button>
          </div>
        </div>

        {/* Search & Status Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by code, name, or description..."
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="subject-status-filter" className="text-xs text-slate-400">
              Status Filter:
            </label>
            <select
              id="subject-status-filter"
              value={subjectStatusFilter}
              onChange={(e) => setSubjectStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Subjects ({subjectsList.length})</option>
              <option value="active">Active ({activeSubjects.length})</option>
              <option value="inactive">Inactive ({subjectsList.length - activeSubjects.length})</option>
            </select>
          </div>
        </div>

        {/* Subjects Table */}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
              <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Code</th>
                  <th className="px-5 py-3.5">Subject &amp; Description</th>
                  <th className="px-5 py-3.5">Allocated Faculty</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                      Loading curriculum subjects...
                    </td>
                  </tr>
                ) : filteredSubjects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                      {subjectsList.length === 0
                        ? 'No subjects configured yet. Click "Add Subject" to create your first curriculum subject.'
                        : 'No subjects match your current search or status filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredSubjects.map((sub) => {
                    const subAllocations = activeAllocations.filter((a) => a.subject_id === sub.id)
                    const isBusy = busySubjectId === sub.id
                    return (
                      <tr key={sub.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-4 font-mono text-sm font-bold text-blue-400 whitespace-nowrap">
                          {sub.subject_code}
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">{sub.subject_name}</div>
                          <div className="mt-0.5 text-xs text-slate-400 line-clamp-2 max-w-md">
                            {sub.description || 'No description provided'}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {subAllocations.length === 0 ? (
                            <span className="text-xs text-slate-500">Unassigned</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {subAllocations.map((alloc) => (
                                <span
                                  key={alloc.id}
                                  className="inline-flex items-center rounded-md border border-emerald-800/70 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
                                >
                                  {alloc.faculty?.employee_id || 'FAC'} — {alloc.faculty?.full_name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {sub.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400">
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Inactive</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setSuccessMessage(null)
                                setErrorMessage(null)
                                setSubjectModalState({ mode: 'edit', subject: sub })
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-700 disabled:opacity-50"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggleSubjectActive(sub)}
                              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                sub.is_active
                                  ? 'border-amber-800/80 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60'
                                  : 'border-emerald-900 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60'
                              }`}
                            >
                              {sub.is_active ? 'Deactivate' : 'Activate'}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteSubject(sub)}
                              title="Delete unused subject (blocked if historical records exist)"
                              className="inline-flex items-center gap-1 rounded-md border border-rose-900/70 bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-900/60 disabled:opacity-50"
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
      </section>

      {/* SECTION 2: FACULTY ALLOCATION */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-600/20 text-emerald-400">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Faculty Subject Allocation</h2>
              <p className="text-xs text-slate-400">
                Assign active subjects to active faculty members and manage allocation history.
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1 text-xs">
            <button
              type="button"
              onClick={() => setAllocationViewMode('active')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                allocationViewMode === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>Active Allocations ({activeAllocations.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setAllocationViewMode('history')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                allocationViewMode === 'history'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Allocation History ({allocationsList.length})</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Assign Subjects Form */}
          <form
            onSubmit={handleAssignSubjects}
            className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-4"
          >
            <div>
              <h3 className="text-sm font-bold text-white">Allocate Subjects to Faculty</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Only active faculty and active subjects are eligible for allocation.
              </p>
            </div>

            <div>
              <label htmlFor="alloc-faculty-select" className="block text-xs font-medium text-slate-300">
                Select Active Faculty *
              </label>
              <select
                id="alloc-faculty-select"
                value={selectedFacultyId}
                onChange={(e) => {
                  setSelectedFacultyId(e.target.value)
                  setSelectedSubjectIds([])
                }}
                disabled={allocSubmitting || activeFacultyList.length === 0}
                className="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              >
                {activeFacultyList.length === 0 ? (
                  <option value="">No active faculty available</option>
                ) : (
                  activeFacultyList.map((fac) => (
                    <option key={fac.id} value={fac.id}>
                      {fac.employee_id} — {fac.full_name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300">
                Select Active Subjects *
              </span>
              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                {activeSubjects.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No active subjects available. Create or activate a subject first.
                  </p>
                ) : (
                  activeSubjects.map((sub) => {
                    const isAlreadyAllocated = alreadyAllocatedForSelectedFaculty.has(sub.id)
                    const isChecked = selectedSubjectIds.includes(sub.id)
                    return (
                      <label
                        key={sub.id}
                        className={`flex items-start gap-2.5 rounded-lg border p-2 text-xs transition-colors ${
                          isAlreadyAllocated
                            ? 'border-slate-800 bg-slate-950/60 text-slate-500 cursor-not-allowed'
                            : isChecked
                            ? 'border-blue-500/60 bg-blue-950/30 text-slate-100 cursor-pointer'
                            : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isAlreadyAllocated || allocSubmitting}
                          checked={isAlreadyAllocated || isChecked}
                          onChange={() => handleToggleSubjectSelection(sub.id)}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold text-blue-300">
                              {sub.subject_code}
                            </span>
                            {isAlreadyAllocated && (
                              <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-800/70">
                                Allocated
                              </span>
                            )}
                          </div>
                          <div className="text-slate-300">{sub.subject_name}</div>
                        </div>
                      </label>
                    )
                  })
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={
                allocSubmitting ||
                !selectedFacultyId ||
                selectedSubjectIds.length === 0 ||
                activeFacultyList.length === 0 ||
                activeSubjects.length === 0
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
            >
              {allocSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Assigning Subjects...</span>
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" />
                  <span>
                    Assign Selected ({selectedSubjectIds.length})
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Allocations List & History Table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                {allocationViewMode === 'active'
                  ? 'Showing currently active teaching assignments.'
                  : 'Showing complete allocation timeline (active and previously removed).'}
              </p>

              <div className="flex items-center gap-2">
                <label htmlFor="alloc-faculty-filter" className="text-xs text-slate-400">
                  Faculty:
                </label>
                <select
                  id="alloc-faculty-filter"
                  value={allocationFacultyFilter}
                  onChange={(e) => setAllocationFacultyFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="all">All Faculty</option>
                  {activeFacultyList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.employee_id} — {f.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/90 uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Faculty</th>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Assigned</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-normal">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          Loading allocations...
                        </td>
                      </tr>
                    ) : displayedAllocations.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          No {allocationViewMode === 'active' ? 'active ' : ''}faculty allocations found.
                        </td>
                      </tr>
                    ) : (
                      displayedAllocations.map((alloc) => {
                        const isBusy = busyAllocationId === alloc.id
                        const isReassigning = reassignTargetId === alloc.id
                        return (
                          <tr key={alloc.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-white">
                                {alloc.faculty?.full_name || 'Faculty'}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400">
                                {alloc.faculty?.employee_id || '-'}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-mono font-bold text-blue-400">
                                {alloc.subjects?.subject_code || '-'}
                              </div>
                              <div className="text-slate-300">
                                {alloc.subjects?.subject_name || 'Unknown Subject'}
                                {alloc.subjects && !alloc.subjects.is_active && (
                                  <span className="ml-1.5 text-[10px] text-amber-400">(Inactive Subject)</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-400">
                              {alloc.assigned_at
                                ? new Date(alloc.assigned_at).toLocaleDateString()
                                : '-'}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {alloc.is_active ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                                  Removed
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              {alloc.is_active ? (
                                isReassigning ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <select
                                      value={reassignFacultyId}
                                      onChange={(e) => setReassignFacultyId(e.target.value)}
                                      disabled={isBusy}
                                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                                    >
                                      <option value="">Select faculty...</option>
                                      {activeFacultyList
                                        .filter((f) => f.id !== alloc.faculty_id)
                                        .map((f) => (
                                          <option key={f.id} value={f.id}>
                                            {f.employee_id} — {f.full_name}
                                          </option>
                                        ))}
                                    </select>
                                    <button
                                      type="button"
                                      disabled={isBusy || !reassignFacultyId}
                                      onClick={() => handleConfirmReassign(alloc)}
                                      className="rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => {
                                        setReassignTargetId(null)
                                        setReassignFacultyId('')
                                      }}
                                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-white"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      disabled={isBusy || activeFacultyList.length < 2 || !alloc.subjects?.is_active}
                                      onClick={() => {
                                        setReassignTargetId(alloc.id)
                                        setReassignFacultyId('')
                                      }}
                                      title="Reassign subject to another active faculty member"
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <ArrowRightLeft className="h-3 w-3" />
                                      <span>Change</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => handleRemoveAllocation(alloc)}
                                      className="inline-flex items-center gap-1 rounded-md border border-rose-900/70 bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-900/60 disabled:opacity-50"
                                    >
                                      <Unlink className="h-3 w-3" />
                                      <span>Remove</span>
                                    </button>
                                  </div>
                                )
                              ) : (
                                <button
                                  type="button"
                                  disabled={
                                    isBusy ||
                                    !alloc.faculty?.is_active ||
                                    !alloc.subjects?.is_active
                                  }
                                  onClick={() => handleReactivateAllocation(alloc)}
                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-900 bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Link2 className="h-3 w-3" />
                                  <span>Re-allocate</span>
                                </button>
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
      </section>

      {subjectModalState && (
        <SubjectFormModal
          key={subjectModalState.subject?.id || 'new-subject'}
          mode={subjectModalState.mode}
          initialSubject={subjectModalState.subject}
          existingSubjects={subjectsList}
          onClose={() => setSubjectModalState(null)}
          onSaved={async ({ message }) => {
            setSubjectModalState(null)
            setSuccessMessage(message)
            await Promise.all([loadAcademicData(), notifyParentChanged()])
          }}
        />
      )}
    </div>
  )
}
