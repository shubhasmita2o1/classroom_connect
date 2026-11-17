import { AlertTriangle, CheckCircle2, XCircle, Info, X } from 'lucide-react'

export default function AlertBanner({ type = 'error', message, onClose }) {
  if (!message) return null

  const config = {
    error: {
      bg: 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]',
      icon: <XCircle className="h-5 w-5 shrink-0 text-[#DC2626]" />,
      titleColor: 'text-[#991B1B]',
    },
    success: {
      bg: 'bg-[#EAF3ED] border-[#21845A]/30 text-[#145C3A]',
      icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-[#145C3A]" />,
      titleColor: 'text-[#145C3A]',
    },
    warning: {
      bg: 'bg-[#FFFBEB] border-[#FCD34D] text-[#92400E]',
      icon: <AlertTriangle className="h-5 w-5 shrink-0 text-[#D97706]" />,
      titleColor: 'text-[#92400E]',
    },
    info: {
      bg: 'bg-[#EAF3ED] border-[#21845A]/20 text-[#145C3A]',
      icon: <Info className="h-5 w-5 shrink-0 text-[#21845A]" />,
      titleColor: 'text-[#145C3A]',
    },
  }[type] || {
    bg: 'bg-[#F5F6F3] border-[#E8ECE7] text-[#252B27]',
    icon: <Info className="h-5 w-5 shrink-0 text-[#78817B]" />,
    titleColor: 'text-[#252B27]',
  }

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-xs sm:text-sm font-medium shadow-sm transition-all ${config.bg}`}
    >
      <div className="flex items-start gap-3">
        {config.icon}
        <div className="leading-relaxed">{message}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-[#78817B] hover:text-[#252B27] transition-colors rounded p-0.5"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
