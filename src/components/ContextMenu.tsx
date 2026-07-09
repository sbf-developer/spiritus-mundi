import { useEffect, useRef } from 'react'
import { FilePlus, FolderPlus } from 'lucide-react'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad
    if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad
    el.style.left = `${Math.max(pad, left)}px`
    el.style.top = `${Math.max(pad, top)}px`
  }, [x, y])

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] py-1 bg-surface-overlay border border-border-default rounded-lg shadow-lg animate-fade-in"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors text-left"
        >
          {item.icon && <span className="text-text-muted">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}

interface NamePromptProps {
  title: string
  placeholder: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

export function NamePrompt({ title, placeholder, onSubmit, onCancel }: NamePromptProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = () => {
    const name = inputRef.current?.value.trim()
    if (name) onSubmit(name)
    else onCancel()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="w-72 bg-surface-overlay border border-border-default rounded-lg p-4 shadow-xl animate-fade-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="text-[12px] font-medium text-text-primary mb-3">{title}</p>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          className="input-field mb-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost py-1.5 px-3">
            Cancel
          </button>
          <button onClick={submit} className="btn-primary py-1.5 px-3">
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

export function buildFolderMenuItems(
  onNewFile: () => void,
  onNewFolder: () => void
): ContextMenuItem[] {
  return [
    {
      id: 'new-file',
      label: 'New File',
      icon: <FilePlus size={13} strokeWidth={1.5} />,
      onClick: onNewFile,
    },
    {
      id: 'new-folder',
      label: 'New Folder',
      icon: <FolderPlus size={13} strokeWidth={1.5} />,
      onClick: onNewFolder,
    },
  ]
}
