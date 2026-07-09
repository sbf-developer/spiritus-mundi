import { ChevronDown, Infinity, MessageCircle } from 'lucide-react'
import { useIDEStore, type ChatMode } from '../store/ideStore'
import { useState, useRef, useEffect } from 'react'

const MODES: { id: ChatMode; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: 'agent',
    label: 'Agent',
    icon: <Infinity size={12} strokeWidth={1.5} />,
    desc: 'Edit files in your project',
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageCircle size={12} strokeWidth={1.5} />,
    desc: 'Ask questions, no file changes',
  },
]

export function ChatModeSelector({ inline = false }: { inline?: boolean }) {
  const { chatMode, setChatMode, settings } = useIDEStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = MODES.find((m) => m.id === chatMode)!

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          inline
            ? 'flex items-center gap-1 px-1.5 py-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors'
            : 'flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-default bg-surface-overlay hover:bg-surface-hover transition-colors'
        }
      >
        <span className={inline ? 'opacity-70' : 'text-text-muted'}>{current.icon}</span>
        <span className={`text-[11px] font-medium ${inline ? 'text-text-secondary' : 'text-text-primary'}`}>
          {current.label}
        </span>
        <ChevronDown size={10} strokeWidth={2} className="opacity-50" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-48 py-1 bg-surface-overlay border border-border-default rounded-lg shadow-lg z-50 animate-fade-in">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                setChatMode(mode.id)
                setOpen(false)
              }}
              className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                chatMode === mode.id ? 'bg-surface-active' : 'hover:bg-surface-hover'
              }`}
            >
              <span className="mt-0.5 text-text-muted">{mode.icon}</span>
              <div>
                <div className="text-[12px] font-medium text-text-primary">{mode.label}</div>
                <div className="text-[10px] text-text-muted">{mode.desc}</div>
              </div>
            </button>
          ))}
          <div className="mx-3 mt-1 pt-1.5 border-t border-border-subtle">
            <span className="text-[10px] text-text-muted truncate block">{settings.model}</span>
          </div>
        </div>
      )}
    </div>
  )
}
