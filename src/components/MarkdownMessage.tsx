import { useState } from 'react'
import { Copy, Check, FileCode } from 'lucide-react'

interface MarkdownMessageProps {
  content: string
  isUser?: boolean
  onApplyCode?: (code: string, language: string) => void
  showApply?: boolean
}

interface Block {
  type: 'text' | 'code'
  content: string
  language?: string
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = []
  const re = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    blocks.push({ type: 'code', language: match[1] || 'plaintext', content: match[2].replace(/\n$/, '') })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    blocks.push({ type: 'text', content: content.slice(lastIndex) })
  }

  return blocks.length ? blocks : [{ type: 'text', content }]
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-surface-active text-[11px] font-mono text-text-primary">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-medium text-text-primary">{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function CodeBlock({
  code,
  language,
  onApply,
  showApply,
}: {
  code: string
  language: string
  onApply?: (code: string, language: string) => void
  showApply?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-2 rounded-md border border-border-default overflow-hidden bg-surface-overlay">
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-border-subtle bg-surface-active">
        <span className="text-[10px] font-mono text-text-muted uppercase">{language || 'code'}</span>
        <div className="flex items-center gap-1">
          {showApply && onApply && (
            <button
              onClick={() => onApply(code, language)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text-primary rounded transition-colors"
              title="Apply to new file"
            >
              <FileCode size={10} />
              Apply
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-0.5 text-text-muted hover:text-text-secondary rounded transition-colors"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
          </button>
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] leading-[1.55] font-mono text-text-primary max-h-80">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function MarkdownMessage({ content, isUser, onApplyCode, showApply }: MarkdownMessageProps) {
  const display = content.replace(/<file\s+path=["'][^"']+["']\s*>[\s\S]*?<\/file>/gi, (m) => {
    const pathMatch = m.match(/path=["']([^"']+)["']/)
    return `\n📄 **${pathMatch?.[1] ?? 'file'}** *(applied to project)*\n`
  })

  const blocks = parseBlocks(display)

  return (
    <div className={`space-y-1 ${isUser ? 'text-text-primary' : 'text-text-secondary'}`}>
      {blocks.map((block, i) =>
        block.type === 'code' ? (
          <CodeBlock
            key={i}
            code={block.content}
            language={block.language || 'code'}
            onApply={onApplyCode}
            showApply={showApply && !isUser}
          />
        ) : (
          <div key={i} className="text-[12px] leading-[1.65] whitespace-pre-wrap break-words">
            {renderInline(block.content)}
          </div>
        )
      )}
    </div>
  )
}
