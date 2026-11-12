import { AlertTriangle, CheckCircle2, XCircle, Info, X } from 'lucide-react'

export default function AlertBanner({ type = 'error', message, onClose }) {
  if (!message) return null

  const config = {
    error: {
      bg: 'bg-rose-950/40 border-rose-800/60 text-rose-200',
      icon: <XCircle className="h-5 w-5 shrink-0 text-rose-400" />,
      titleColor: 'text-rose-300',
    },
    success: {
      bg: 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200',
      icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />,
      titleColor: 'text-emerald-300',
    },
    warning: {
      bg: 'bg-amber-950/40 border-amber-800/60 text-amber-200',
      icon: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />,
      titleColor: 'text-amber-300',
    },
    info: {
      bg: 'bg-blue-950/40 border-blue-800/60 text-blue-200',
      icon: <Info className="h-5 w-5 shrink-0 text-blue-400" />,
      titleColor: 'text-blue-300',
    },
  }[type] || {
    bg: 'bg-slate-800 border-slate-700 text-slate-200',
    icon: <Info className="h-5 w-5 shrink-0 text-slate-400" />,
    titleColor: 'text-slate-300',
  }

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-lg border p-4 text-sm shadow-sm transition-all ${config.bg}`}
    >
      <div className="flex items-start gap-3">
        {config.icon}
        <div className="leading-snug">{message}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
