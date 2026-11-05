
import { useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [email, setEmail] = useState('faculty@classroom.local')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [studentId, setStudentId] = useState(null)
  const [message, setMessage] = useState('Sign in with your local faculty account.')
  const [busy, setBusy] = useState(false)

  function showError(error) {
    setMessage(`Error: ${error.message}`)
  }

  async function signIn() {
    setBusy(true)
    setMessage('Signing in...')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      showError(error)
    } else {
      setUser(data.user)
      setMessage(`Signed in successfully: ${data.user.email}`)
    }

    setBusy(false)
  }

  async function createSession() {
    if (!user) return

    setBusy(true)
    setMessage('Creating attendance session...')

    try {
      const { data: faculty, error: facultyError } = await supabase
        .from('faculty')
        .select('id')
        .eq('profile_id', user.id)
        .single()

      if (facultyError) throw facultyError

      const { data: subject, error: subjectError } = await supabase
        .from('subjects')
        .select('id')
        .eq('subject_code', 'CS101')
        .eq('is_active', true)
        .single()

      if (subjectError) throw subjectError

      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('is_active', true)
        .order('roll_number')

      if (studentsError) throw studentsError
      if (!students.length) throw new Error('No active students found.')

      const now = new Date()
      const sessionDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-')

      const { data: existing, error: existingError } = await supabase
        .from('attendance_sessions')
        .select('session_number')
        .eq('subject_id', subject.id)
        .eq('session_date', sessionDate)
        .order('session_number', { ascending: false })
        .limit(1)

      if (existingError) throw existingError

      const nextNumber = existing?.length
        ? existing[0].session_number + 1
        : 1

      const { data: session, error: sessionError } = await supabase
        .from('attendance_sessions')
        .insert({
          faculty_id: faculty.id,
          subject_id: subject.id,
          session_date: sessionDate,
          session_number: nextNumber,
          status: 'draft',
        })
        .select()
        .single()

      if (sessionError) throw sessionError

      setSessionId(session.id)
      setStudentId(students[0].id)
      setMessage(
        `Draft session created. Session ${nextNumber} for CS101. Active students: ${students.length}. First student: ${students[0].full_name}.`
      )
    } catch (error) {
      showError(error)
    }

    setBusy(false)
  }

  async function startSession() {
    if (!sessionId) return

    setBusy(true)
    const { error } = await supabase.rpc('start_attendance_session', {
      target_session_id: sessionId,
    })

    setMessage(
      error ? `Error: ${error.message}` : 'Session started successfully.'
    )
    setBusy(false)
  }

  async function markPresent() {
    if (!sessionId || !studentId || !user) return

    setBusy(true)

    const { error } = await supabase.from('attendance_records').insert({
      session_id: sessionId,
      student_id: studentId,
      status: 'present',
      marked_by: user.id,
    })

    setMessage(
      error ? `Error: ${error.message}` : 'Student marked PRESENT successfully.'
    )
    setBusy(false)
  }

  async function finalizeSession() {
    if (!sessionId) return

    setBusy(true)

    const { error } = await supabase.rpc('finalize_attendance_session', {
      target_session_id: sessionId,
    })

    setMessage(
      error
        ? `Error: ${error.message}`
        : 'Attendance finalized successfully!'
    )
    setBusy(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSessionId(null)
    setStudentId(null)
    setPassword('')
    setMessage('Signed out.')
  }

  const buttonStyle =
    'rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50'

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Classroom Connect</h1>
          <p className="mt-2 text-slate-400">Local attendance workflow test</p>
        </header>

        <section className="space-y-3 rounded-xl border border-slate-700 p-5">
          <h2 className="text-xl font-semibold">1. Faculty login</h2>

          <input
            className="w-full rounded-lg bg-slate-800 p-3"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Faculty email"
            disabled={!!user}
          />

          <input
            className="w-full rounded-lg bg-slate-800 p-3"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Faculty password"
            disabled={!!user}
          />

          {user ? (
            <button className={buttonStyle} onClick={signOut} disabled={busy}>
              Sign out
            </button>
          ) : (
            <button className={buttonStyle} onClick={signIn} disabled={busy}>
              Sign in
            </button>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-slate-700 p-5">
          <h2 className="text-xl font-semibold">2. Attendance session</h2>

          <button
            className={buttonStyle}
            onClick={createSession}
            disabled={!user || busy || !!sessionId}
          >
            Create draft session
          </button>

          <button
            className={buttonStyle}
            onClick={startSession}
            disabled={!sessionId || busy}
          >
            Start session
          </button>

          <button
            className={buttonStyle}
            onClick={markPresent}
            disabled={!sessionId || busy}
          >
            Mark first student present
          </button>

          <button
            className={buttonStyle}
            onClick={finalizeSession}
            disabled={!sessionId || busy}
          >
            Finalize attendance
          </button>

          {sessionId && (
            <p className="break-all text-xs text-slate-400">
              Session ID: {sessionId}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-700 p-5">
          <h2 className="font-semibold">Test result</h2>
          <p className="mt-2 break-words text-sm text-green-400">{message}</p>
        </section>
      </div>
    </main>
  )
}

export default App
