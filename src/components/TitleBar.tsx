/**
 * Custom window title bar — branding, open folder, chat/theme toggles.
 * On Windows: includes minimize/maximize/close via window.ontology.window.*
 * On macOS: uses native traffic lights (frame: false inset style).
 */
import { FolderOpen, Minus, Square, X, Sun, Moon, MessageSquare } from 'lucide-react'
import type { Theme } from '../vite-env.d'

interface TitleBarProps {
  onOpenFolder: () => void
  theme: Theme
  onToggleTheme: () => void
  showChat: boolean
  onToggleChat: () => void
}

const isMac = window.ontology.platform === 'darwin'

export function TitleBar({
  onOpenFolder,
  theme,
  onToggleTheme,
  showChat,
  onToggleChat,
}: TitleBarProps) {
  return (
    <header
      className={`h-9 flex items-center justify-between bg-surface-raised border-b border-border-subtle shrink-0 select-none ${
        isMac ? 'pl-20 pr-3' : 'px-3'
      }`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-2 min-w-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {!isMac && (
          <>
            <span className="text-[12px] font-medium text-text-primary tracking-tight truncate">
              Ontology
            </span>
            <span className="text-border-default">·</span>
          </>
        )}
        <button
          onClick={onOpenFolder}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text-secondary rounded transition-colors"
        >
          <FolderOpen size={11} strokeWidth={1.5} />
          Open folder
        </button>
      </div>

      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={onToggleChat}
          title={showChat ? 'Hide chat' : 'Show chat'}
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
            showChat
              ? 'text-text-primary bg-surface-active'
              : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
          }`}
        >
          <MessageSquare size={13} strokeWidth={1.5} />
        </button>
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-secondary rounded-md transition-colors"
        >
          {theme === 'dark' ? <Sun size={13} strokeWidth={1.5} /> : <Moon size={13} strokeWidth={1.5} />}
        </button>
        {!isMac && (
          <>
            <WindowButton icon={<Minus size={13} strokeWidth={1.5} />} onClick={() => window.ontology.window.minimize()} />
            <WindowButton icon={<Square size={11} strokeWidth={1.5} />} onClick={() => window.ontology.window.maximize()} />
            <WindowButton icon={<X size={13} strokeWidth={1.5} />} onClick={() => window.ontology.window.close()} danger />
          </>
        )}
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
