import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [status, setStatus] = useState('Testing connection...')

  useEffect(() => {
    async function testConnection() {
      const { error } = await supabase
        .from('profiles')
        .select('id')
        .limit(1)

      if (error?.code === '42P01' || error?.code === 'PGRST205') {
        setStatus('Supabase connected! Database table not created yet.')
      } else if (error) {
        setStatus(`Connection error: ${error.message}`)
      } else {
        setStatus('Supabase connected successfully!')
      }
    }

    testConnection()
  }, [])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
      <h1 className="text-4xl font-bold">Classroom Connect</h1>
      <p className="mt-5 text-green-400">{status}</p>
    </main>
  )
}

export default App