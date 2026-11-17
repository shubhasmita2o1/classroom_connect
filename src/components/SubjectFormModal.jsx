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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#252B27]/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subject-form-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#E8ECE7] bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E8ECE7] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#21845A]/20 bg-[#EAF3ED] text-[#145C3A]">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 id="subject-form-modal-title" className="text-base font-bold text-[#252B27]">
                {isEdit ? 'Edit Subject Details' : 'Add New Curriculum Subject'}
              </h3>
              <p className="text-xs text-[#78817B]">
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
            className="rounded-lg p-1.5 text-[#78817B] hover:bg-[#F5F6F3] hover:text-[#252B27] disabled:opacity-50"
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
            <label htmlFor="subject-code-input" className="block text-xs font-semibold text-[#252B27]">
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
              className="mt-1.5 block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3.5 py-2 font-mono text-sm uppercase tracking-wider text-[#252B27] placeholder-[#78817B] placeholder:normal-case placeholder:tracking-normal focus:border-[#145C3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145C3A] disabled:opacity-50"
            />
            <p className="mt-1 text-[11px] text-[#78817B]">
              Unique uppercase identifier (2-20 characters, letters, numbers, ., _, -).
            </p>
          </div>

          <div>
            <label htmlFor="subject-name-input" className="block text-xs font-semibold text-[#252B27]">
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
              className="mt-1.5 block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3.5 py-2 text-sm text-[#252B27] placeholder-[#78817B] focus:border-[#145C3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145C3A] disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="subject-description-input" className="block text-xs font-semibold text-[#252B27]">
              Description
            </label>
            <textarea
              id="subject-description-input"
              rows={3}
              disabled={submitting}
              placeholder="Optional course scope, credits, or classroom notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 block w-full rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3.5 py-2 text-sm text-[#252B27] placeholder-[#78817B] focus:border-[#145C3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145C3A] disabled:opacity-50"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#E8ECE7] bg-[#F5F6F3] px-3.5 py-2.5">
            <div>
              <p className="text-xs font-semibold text-[#252B27]">Subject Active Status</p>
              <p className="text-[11px] text-[#78817B]">
                Active subjects are visible in curriculum and available for faculty allocation.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                disabled={submitting}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-[#E8ECE7] text-[#145C3A] focus:ring-[#145C3A]"
              />
              <span className={`text-xs font-semibold ${isActive ? 'text-[#145C3A]' : 'text-[#78817B]'}`}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#E8ECE7] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-[#E8ECE7] bg-white px-4 py-2 text-xs font-semibold text-[#252B27] hover:bg-[#F5F6F3] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#145C3A] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#21845A] disabled:opacity-50 transition-colors"
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
