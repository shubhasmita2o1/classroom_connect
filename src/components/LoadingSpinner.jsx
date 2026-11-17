import { GraduationCap } from 'lucide-react'

export default function LoadingSpinner({ message = 'Loading institutional portal...' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F6F3] p-6 text-[#252B27]">
      <div className="relative mb-6 flex items-center justify-center">
        {/* Outer pulse circle */}
        <div className="absolute h-20 w-20 animate-ping rounded-full bg-[#145C3A]/10" />

        {/* Rotating ring */}
        <div className="h-20 w-20 animate-spin rounded-full border-4 border-[#E8ECE7] border-t-[#145C3A] border-r-[#21845A]" />

        {/* Institutional Icon */}
        <div className="absolute flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#145C3A] shadow-md border border-[#E8ECE7]">
          <GraduationCap className="h-6 w-6" />
        </div>
      </div>

      <h2 className="text-base font-bold tracking-tight text-[#252B27]">
        Classroom Connect
      </h2>
      <p className="mt-1 text-xs text-[#78817B] animate-pulse">{message}</p>
    </div>
  )
}
