import { useState } from 'react'
import { supabase } from '../lib/supabase'
import AlertBanner from './AlertBanner'
import { BookOpen, X, Save, PlusCircle } from 'lucide-react'

const SUBJECT_CODE_REGEX = /^[A-Z0-9._-]{2,20}$/

export default function SubjectFormModal({
  mode = 'create',
  initialSubject = null,
  existingSubjects = [],
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit' && Boolean(initialSubject)

  const [subjectCode, setSubjectCode] = useState(initialSubject?.subject_code || '')
  const [subjectName, setSubjectName] = useState(initialSubject?.subject_name || '')
  const [description, setDescription] = useState(initialSubject?.description || '')
  const [isActive, setIsActive] = useState(initialSubject ? initialSubject.is_active : true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage(null)

    const cleanCode = subjectCode.trim().toUpperCase()
    const cleanName = subjectName.trim()
    const cleanDesc = description.trim()

    if (!cleanCode) {
      setErrorMessage('Subject code is mandatory (e.g. CS101).')
      return
    }

    if (!SUBJECT_CODE_REGEX.test(cleanCode)) {
      setErrorMessage(
        'Subject code must be 2-20 characters using uppercase letters, numbers, ".", "_", or "-" (no spaces).'
      )
      return
    }

    if (!cleanName || cleanName.length < 2) {
      setErrorMessage('Subject name is mandatory and must be at least 2 characters.')
      return
    }

    const duplicateCode = existingSubjects.find(
      (s) =>
        s.subject_code?.trim().toUpperCase() === cleanCode &&
        (!isEdit || s.id !== initialSubject.id)
    )
    if (duplicateCode) {
      setErrorMessage(`A subject with code "${cleanCode}" already exists (${duplicateCode.subject_name}).`)
      return
    }

    const duplicateName = existingSubjects.find(
      (s) =>
        s.subject_name?.trim().toLowerCase() === cleanName.toLowerCase() &&
        (!isEdit || s.id !== initialSubject.id)
    )
    if (duplicateName) {
      setErrorMessage(
        `A subject named "${duplicateName.subject_name}" already exists (${duplicateName.subject_code}).`
      )
      return
    }

    setSubmitting(true)

    try {
      if (isEdit) {
        const { data, error } = await supabase
          .from('subjects')
          .update({
            subject_code: cleanCode,
            subject_name: cleanName,
            description: cleanDesc || null,
            is_active: isActive,
          })
          .eq('id', initialSubject.id)
          .select('id, subject_code, subject_name, description, is_active, created_at, updated_at')
          .single()

        if (error) {
          if (error.code === '23505') {
            throw new Error(`Subject code "${cleanCode}" is already in use.`)
          }
          throw error
        }

        onSaved({
          subject: data,
          message: `Subject ${data.subject_code} (${data.subject_name}) updated successfully.`,
        })
      } else {
        const { data, error } = await supabase
          .from('subjects')
          .insert({
            subject_code: cleanCode,
            subject_name: cleanName,
            description: cleanDesc || null,
            is_active: isActive,
          })
          .select('id, subject_code, subject_name, description, is_active, created_at, updated_at')
          .single()

        if (error) {
          if (error.code === '23505') {
            throw new Error(`Subject code "${cleanCode}" is already in use.`)
          }
          throw error
        }

        onSaved({
          subject: data,
          message: `Subject ${data.subject_code} (${data.subject_name}) created successfully.`,
        })
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save subject.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subject-form-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-600/20 text-blue-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 id="subject-form-modal-title" className="text-base font-bold text-white">
                {isEdit ? 'Edit Subject Details' : 'Add New Curriculum Subject'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? 'Update subject metadata without affecting historical attendance records.'
                  : 'Create an active or inactive subject for the classroom curriculum.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
            aria-label="Close subject modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4">
            <AlertBanner
              type="error"
              message={errorMessage}
              onClose={() => setErrorMessage(null)}
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="subject-code-input" className="block text-xs font-medium text-slate-300">
              Subject Code *
            </label>
            <input
              id="subject-code-input"
              type="text"
              required
              disabled={submitting}
              placeholder="e.g. CS101, MATH-201"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
              className="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 font-mono text-sm uppercase tracking-wider text-slate-100 placeholder-slate-500 placeholder:normal-case placeholder:tracking-normal focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Unique uppercase identifier (2-20 characters, letters, numbers, ., _, -).
            </p>
          </div>

          <div>
            <label htmlFor="subject-name-input" className="block text-xs font-medium text-slate-300">
              Subject Name *
            </label>
            <input
              id="subject-name-input"
              type="text"
              required
              disabled={submitting}
              placeholder="e.g. Data Structures and Algorithms"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="subject-description-input" className="block text-xs font-medium text-slate-300">
              Description
            </label>
            <textarea
              id="subject-description-input"
              rows={3}
              disabled={submitting}
              placeholder="Optional course scope, credits, or classroom notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5">
            <div>
              <p className="text-xs font-semibold text-slate-200">Subject Active Status</p>
              <p className="text-[11px] text-slate-400">
                Active subjects are visible in curriculum and available for faculty allocation.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                disabled={submitting}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
              />
              <span className={`text-xs font-semibold ${isActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Saving...</span>
                </>
              ) : isEdit ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Save Changes</span>
                </>
              ) : (
                <>
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>Create Subject</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
