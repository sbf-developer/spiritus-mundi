import { CodeBox, parseFenceInfo } from './CodeBox'

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
  const re = /```([\w.:+/\\-]*)\n?([\s\S]*?)```/g
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

export function MarkdownMessage({ content, isUser, onApplyCode, showApply }: MarkdownMessageProps) {
  const blocks = parseBlocks(content)

  return (
    <div className={`space-y-1.5 ${isUser ? 'text-text-primary' : 'text-text-primary/90'}`}>
      {blocks.map((block, i) =>
        block.type === 'code' ? (
          <CodeBox
            key={i}
            meta={parseFenceInfo(block.language || '', block.content)}
            onApply={onApplyCode}
            showApply={showApply && !isUser}
          />
        ) : (
          <div key={i} className="text-[12px] leading-[1.65] whitespace-pre-wrap break-words">
            {renderInline(block.content.trim())}
          </div>
        )
      )}
    </div>
  )
}
