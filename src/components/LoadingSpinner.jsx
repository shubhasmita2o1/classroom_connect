import { GraduationCap } from 'lucide-react'

export default function LoadingSpinner({ message = 'Loading institutional portal...' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 text-slate-100">
      <div className="relative mb-6 flex items-center justify-center">
        {/* Outer pulse circle */}
        <div className="absolute h-20 w-20 animate-ping rounded-full bg-blue-500/20" />
        
        {/* Rotating ring */}
        <div className="h-20 w-20 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500 border-r-blue-400" />
        
        {/* Institutional Icon */}
        <div className="absolute flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-blue-400 shadow-md">
          <GraduationCap className="h-6 w-6" />
        </div>
      </div>

      <h2 className="text-lg font-semibold tracking-wide text-slate-100">
        Classroom Connect
      </h2>
      <p className="mt-1 text-sm text-slate-400 animate-pulse">{message}</p>
    </div>
  )
}
