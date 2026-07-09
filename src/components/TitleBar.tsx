import { FolderOpen, Minus, Square, X, Sun, Moon } from 'lucide-react'
import type { Theme } from '../vite-env.d'

interface TitleBarProps {
  onOpenFolder: () => void
  theme: Theme
  onToggleTheme: () => void
}

export function TitleBar({ onOpenFolder, theme, onToggleTheme }: TitleBarProps) {
  return (
    <header
      className="h-9 flex items-center justify-between px-3 bg-surface-raised border-b border-border-subtle shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-2 min-w-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="text-[12px] font-medium text-text-primary tracking-tight truncate">
          Spiritus Mundi
        </span>
        <span className="text-border-default">·</span>
        <button
          onClick={onOpenFolder}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text-secondary rounded transition-colors"
        >
          <FolderOpen size={11} strokeWidth={1.5} />
          Open folder
        </button>
      </div>

      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-secondary rounded-md transition-colors"
        >
          {theme === 'dark' ? <Sun size={14} strokeWidth={1.5} /> : <Moon size={14} strokeWidth={1.5} />}
        </button>
        <WindowButton icon={<Minus size={13} strokeWidth={1.5} />} onClick={() => window.spiritus.window.minimize()} />
        <WindowButton icon={<Square size={11} strokeWidth={1.5} />} onClick={() => window.spiritus.window.maximize()} />
        <WindowButton icon={<X size={13} strokeWidth={1.5} />} onClick={() => window.spiritus.window.close()} danger />
      </div>
    </header>
  )
}

function WindowButton({
  icon,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
        danger
          ? 'text-text-muted hover:bg-red-500/15 hover:text-red-400'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
      }`}
    >
      {icon}
    </button>
  )
}
