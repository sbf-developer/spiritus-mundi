import { useState } from 'react'
import { Copy, Check, ChevronRight } from 'lucide-react'
import { extBadge } from '../lib/agentMessageParser'

export interface CodeBoxMeta {
  language: string
  filename?: string
  code: string
}

const LANG_LABEL: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  yml: 'yaml',
  md: 'markdown',
}

export function parseFenceInfo(rawLang: string, code: string): CodeBoxMeta {
  let language = rawLang || 'plaintext'
  let filename: string | undefined

  if (rawLang.includes(':')) {
    const [lang, file] = rawLang.split(':')
    language = lang || 'plaintext'
    filename = file
  }

  const diffFile = code.match(/^\+\+\+ [ab]\/?(.+)$/m)
  if (diffFile?.[1]) filename = diffFile[1].trim()

  if (!filename && language !== 'plaintext' && language !== 'diff') {
    const ext = language.length <= 4 ? language : LANG_LABEL[language] ? language : 'txt'
    filename = `snippet.${ext === 'typescript' ? 'ts' : ext === 'javascript' ? 'js' : ext}`
  }

  return { language: LANG_LABEL[language] ?? language, filename, code }
}

function diffStats(code: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of code.split('\n')) {
    if (/^\+(?!\+)/.test(line)) added++
    else if (/^-(?!-)/.test(line)) removed++
  }
  return { added, removed }
}

type LineKind = 'add' | 'del' | 'ctx' | 'meta'

function lineKind(line: string): LineKind {
  if (/^\+{3}/.test(line) || /^-{3}/.test(line) || /^@@/.test(line)) return 'meta'
  if (/^\+/.test(line)) return 'add'
  if (/^-/.test(line)) return 'del'
  return 'ctx'
}

function displayLine(line: string, kind: LineKind): string {
  if (kind === 'add' || kind === 'del') return line.slice(1)
  if (kind === 'meta') return line
  return line.startsWith(' ') ? line.slice(1) : line
}

function highlightCode(line: string, language: string): React.ReactNode[] {
  if (!line) return ['']

  const parts: React.ReactNode[] = []
  let remaining = line
  let key = 0

  const push = (text: string, cls?: string) => {
    if (!text) return
    parts.push(cls ? <span key={key++} className={cls}>{text}</span> : text)
  }

  const keywords =
    language.match(/typescript|javascript|tsx|jsx/)
      ? /\b(import|export|from|const|let|var|function|return|if|else|async|await|type|interface|class|new|this|true|false|null|undefined|void)\b/g
      : language.match(/python|py/)
        ? /\b(def|class|import|from|return|if|elif|else|async|await|True|False|None|with|as)\b/g
        : language.match(/html/)
          ? /\b(div|span|class|id|href|src|type|script|style|html|head|body|meta|link)\b/g
          : null

  if (keywords) {
    let last = 0
    let m: RegExpExecArray | null
    const re = new RegExp(keywords.source, keywords.flags)
    while ((m = re.exec(line)) !== null) {
      push(line.slice(last, m.index))
      push(m[0], 'codebox-kw')
      last = m.index + m[0].length
    }
    remaining = line.slice(last)
  } else {
    remaining = line
  }

  const strRe = /('[^']*'|"[^"]*"|`[^`]*`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = strRe.exec(remaining)) !== null) {
    push(remaining.slice(last, m.index))
    push(m[0], 'codebox-str')
    last = m.index + m[0].length
  }
  push(remaining.slice(last))

  if (parts.length === 0) return [line]
  return parts
}

interface CodeBoxProps {
  meta: CodeBoxMeta
  onApply?: (code: string, language: string) => void
  showApply?: boolean
  defaultCollapsed?: boolean
  variant?: 'default' | 'agent'
}

export function CodeBox({
  meta,
  onApply,
  showApply,
  defaultCollapsed,
  variant = 'default',
}: CodeBoxProps) {
  const lines = meta.code.split('\n')
  const lineCount = lines.filter((l) => l.length > 0).length || lines.length
  const { added, removed } = diffStats(meta.code)
  const isDiff = added > 0 || removed > 0 || meta.language === 'diff'
  const displayName = meta.filename?.split(/[/\\]/).pop() ?? meta.language
  const badge = extBadge(displayName)

  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(
    defaultCollapsed ?? (variant === 'agent' ? lineCount > 6 : false)
  )

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(meta.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`codebox ${variant === 'agent' ? 'codebox-agent' : ''}`}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="codebox-header w-full"
      >
        <ChevronRight size={11} className={`codebox-chevron ${collapsed ? '' : 'codebox-chevron-open'}`} />
        <span className="codebox-ext">{badge}</span>
        <span className="codebox-filename">{displayName}</span>
        <span className="codebox-stats">
          {isDiff ? (
            <>
              {added > 0 && <span className="codebox-stat-add">+{added}</span>}
              {removed > 0 && <span className="codebox-stat-del">-{removed}</span>}
            </>
          ) : (
            lineCount > 0 && <span className="codebox-stat-add">+{lineCount}</span>
          )}
        </span>
        <span className="codebox-actions" onClick={(e) => e.stopPropagation()}>
          {showApply && onApply && (
            <button
              type="button"
              onClick={() => onApply(meta.code, meta.language)}
              className="codebox-action-btn"
            >
              Apply
            </button>
          )}
          <button type="button" onClick={handleCopy} className="codebox-action-btn" title="Copy">
            {copied ? <Check size={11} /> : <Copy size={11} />}
          </button>
        </span>
      </button>

      {!collapsed && (
        <div className="codebox-body">
          <pre className="codebox-pre">
            {lines.map((line, i) => {
              const kind = isDiff ? lineKind(line) : 'ctx'
              const text = isDiff ? displayLine(line, kind) : line
              return (
                <div key={i} className={`codebox-line codebox-line-${kind}`}>
                  <code>{kind === 'meta' ? text : highlightCode(text, meta.language)}</code>
                </div>
              )
            })}
          </pre>
        </div>
      )}
    </div>
  )
}
