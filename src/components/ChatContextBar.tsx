import { useState, useRef, useEffect } from 'react'
import { Terminal, FileCode, FolderOpen, Search, X, Braces } from 'lucide-react'
import { useIDEStore } from '../store/ideStore'
import {
  buildContextPickerOptions,
  createFileContext,
  createFolderContext,
  createTerminalContext,
  searchCodebaseContext,
  createCodeContext,
  type ContextItem,
} from '../services/contextService'

interface ChatContextBarProps {
  input: string
  setInput: (value: string) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  userQuery: string
}

const TYPE_ICONS = {
  terminal: Terminal,
  code: Braces,
  file: FileCode,
  folder: FolderOpen,
  codebase: Search,
  selection: Braces,
}

export function ChatContextBar({ input, setInput, inputRef, userQuery }: ChatContextBarProps) {
  const {
    chatContextItems,
    removeContextItem,
    addContextItem,
    fileTree,
    rootPath,
    terminalBuffer,
    editorSelection,
    showChat,
  } = useIDEStore()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [highlight, setHighlight] = useState(0)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showChat) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        useIDEStore.getState().addSelectionToChat()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showChat])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return

    const checkAt = () => {
      const pos = el.selectionStart ?? 0
      const before = input.slice(0, pos)
      const atMatch = before.match(/@([\w./-]*)$/)
      if (atMatch) {
        setPickerOpen(true)
        setFilter(atMatch[1] ?? '')
        setHighlight(0)
      } else {
        setPickerOpen(false)
        setFilter('')
      }
    }

    checkAt()
  }, [input, inputRef])

  const options = buildContextPickerOptions(fileTree, terminalBuffer, editorSelection, filter)

  const removeAtToken = () => {
    const el = inputRef.current
    if (!el) return
    const pos = el.selectionStart ?? 0
    const before = input.slice(0, pos)
    const atMatch = before.match(/@([\w./-]*)$/)
    if (!atMatch) return
    const start = pos - atMatch[0].length
    const next = input.slice(0, start) + input.slice(pos)
    setInput(next)
    requestAnimationFrame(() => {
      el.setSelectionRange(start, start)
      el.focus()
    })
  }

  const pickOption = async (optionId: string, type: string) => {
    removeAtToken()
    setPickerOpen(false)

    if (type === 'terminal') {
      const item = createTerminalContext(terminalBuffer)
      if (item.content) addContextItem(item)
      return
    }

    if (type === 'selection' && editorSelection) {
      addContextItem(
        createCodeContext(
          editorSelection.path,
          editorSelection.name,
          editorSelection.startLine,
          editorSelection.endLine,
          editorSelection.content,
          editorSelection.language,
          rootPath
        )
      )
      return
    }

    if (type === 'codebase' && rootPath) {
      const item = await searchCodebaseContext(rootPath, fileTree, userQuery || filter || 'project')
      if (item) addContextItem(item)
      return
    }

    if (type === 'file') {
      const result = await window.spiritus.readFile(optionId)
      if (result.success) {
        const name = optionId.split(/[/\\]/).pop() || optionId
        addContextItem(createFileContext(optionId, name, result.content, rootPath))
      }
      return
    }

    if (type === 'folder') {
      const name = optionId.split(/[/\\]/).pop() || optionId
      const item = await createFolderContext(optionId, name, fileTree, rootPath)
      addContextItem(item)
    }
  }

  const handlePickerKeyDown = (e: React.KeyboardEvent | KeyboardEvent) => {
    if (!pickerOpen || options.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const opt = options[highlight]
      if (opt) pickOption(opt.id, opt.type)
    } else if (e.key === 'Escape') {
      setPickerOpen(false)
    }
  }

  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (e: KeyboardEvent) => handlePickerKeyDown(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerOpen, options, highlight])

  return (
    <div className="relative">
      {chatContextItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {chatContextItems.map((item) => (
            <ContextChip key={item.id} item={item} onRemove={() => removeContextItem(item.id)} />
          ))}
        </div>
      )}

      {pickerOpen && options.length > 0 && (
        <div
          ref={pickerRef}
          className="absolute bottom-full left-3 right-3 mb-1 max-h-48 overflow-y-auto py-1 bg-surface-overlay border border-border-default rounded-lg shadow-lg z-50 animate-fade-in"
        >
          {options.map((opt, i) => {
            const Icon = TYPE_ICONS[opt.type as keyof typeof TYPE_ICONS] ?? FileCode
            return (
              <button
                key={`${opt.type}-${opt.id}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickOption(opt.id, opt.type)
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  i === highlight ? 'bg-surface-active' : 'hover:bg-surface-hover'
                }`}
              >
                <Icon size={12} className="text-text-muted shrink-0" />
                <span className="text-[11px] font-medium text-text-primary truncate">{opt.label}</span>
                {opt.detail && (
                  <span className="text-[10px] text-text-muted truncate ml-auto">{opt.detail}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ContextChip({ item, onRemove }: { item: ContextItem; onRemove: () => void }) {
  const Icon = TYPE_ICONS[item.type] ?? FileCode
  return (
    <span className="inline-flex items-center gap-1 max-w-[180px] pl-2 pr-1 py-0.5 rounded-md bg-surface-hover border border-border-subtle text-[10px] text-text-secondary">
      <Icon size={10} className="shrink-0 opacity-70" />
      <span className="truncate">{item.label}</span>
      <button type="button" onClick={onRemove} className="p-0.5 rounded hover:bg-surface-active text-text-muted">
        <X size={10} />
      </button>
    </span>
  )
}

export function formatUserMessageWithContext(content: string, items: ContextItem[]): string {
  if (items.length === 0) return content
  const labels = items.map((i) => `@${i.label}`).join(', ')
  return `[Context: ${labels}]\n\n${content}`
}
