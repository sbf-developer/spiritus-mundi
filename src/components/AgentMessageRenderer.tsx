/**
 * Renders agent assistant messages as structured blocks.
 *
 * Maps AgentMessageBlock → CodeBox (files/code), ActionCard (run/mkdir),
 * or MarkdownMessage (prose). Summary section shows ✓/⚠ apply results.
 */
import { CodeBox } from './CodeBox'
import { MarkdownMessage } from './MarkdownMessage'
import { parseAgentMessageBlocks } from '../lib/agentMessageParser'
import { detectLanguage } from '../store/ideStore'
import { ActionCard } from './ActionCard'

interface AgentMessageRendererProps {
  content: string
  onApplyCode?: (code: string, language: string) => void
  showApply?: boolean
}

export function AgentMessageRenderer({ content, onApplyCode, showApply }: AgentMessageRendererProps) {
  const blocks = parseAgentMessageBlocks(content)

  if (blocks.length === 1 && blocks[0].type === 'text') {
    return (
      <MarkdownMessage content={blocks[0].content} onApplyCode={onApplyCode} showApply={showApply} />
    )
  }

  return (
    <div className="space-y-2.5 agent-message">
      {blocks.map((block, i) => {
        switch (block.type) {
          // <file path="..."> from agent output
          case 'file': {
            const name = block.path.split(/[/\\]/).pop() || block.path
            const lang = detectLanguage(name)
            return (
              <CodeBox
                key={i}
                meta={{ language: lang, filename: block.path, code: block.content }}
                defaultCollapsed
                variant="agent"
              />
            )
          }
          // markdown ``` fence fallback
          case 'code': {
            const lang = block.path ? detectLanguage(block.path) : block.language
            return (
              <CodeBox
                key={i}
                meta={{ language: lang, filename: block.path, code: block.content }}
                defaultCollapsed
                variant="agent"
              />
            )
          }
          case 'mkdir':
            return (
              <ActionCard
                key={i}
                badge="DIR"
                label={block.path}
                stat={`+1`}
                statType="add"
              />
            )
          case 'delete':
            return (
              <ActionCard
                key={i}
                badge="DEL"
                label={block.path}
                stat={`-1`}
                statType="del"
              />
            )
          case 'rename':
            return (
              <ActionCard
                key={i}
                badge="MV"
                label={`${block.from} → ${block.to}`}
              />
            )
          case 'run':
            return (
              <ActionCard
                key={i}
                badge="RUN"
                label={block.commands.join(' · ')}
                detail={block.commands.length > 1 ? `${block.commands.length} commands` : undefined}
                expandable
                body={block.commands.map((c) => `$ ${c}`).join('\n')}
              />
            )
          // --- block appended after agent apply (✓/⚠ summary) ---
          case 'summary':
            return (
              <div key={i} className="agent-summary">
                {block.content.split('\n').map((line, j) => {
                  const isError = line.startsWith('⚠')
                  const cleaned = line
                    .replace(/^✓\s*\*\*/, '')
                    .replace(/\*\*/g, '')
                    .replace(/^⚠\s*/, '')
                  return (
                    <div
                      key={j}
                      className={`agent-summary-line ${isError ? 'agent-summary-line-error' : ''}`}
                    >
                      {isError ? `⚠ ${cleaned}` : cleaned}
                    </div>
                  )
                })}
              </div>
            )
          case 'text':
            return (
              <MarkdownMessage
                key={i}
                content={block.content}
                onApplyCode={onApplyCode}
                showApply={showApply}
              />
            )
          default:
            return null
        }
      })}
    </div>
  )
}
