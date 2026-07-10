/**
 * Chat history compaction — keep API calls within token limits.
 *
 * Long sessions: summarize older turns, keep last N messages verbatim.
 * Used by ChatPanel before calling streamChat().
 */

import type { ChatMessage } from '../store/ideStore'

const MAX_API_MESSAGES = 12
const MAX_TOTAL_CHARS = 16000

function summarizeTurn(msg: ChatMessage): string {
  const first = msg.content.split('\n').find((l) => l.trim() && !l.startsWith('[Context:'))
  const line = (first ?? msg.content).trim().replace(/\s+/g, ' ')
  return line.length > 120 ? line.slice(0, 120) + '…' : line
}

// ─── Summarize dropped messages when history exceeds limits ──────

function buildOlderSummary(messages: ChatMessage[]): string {
  const lines: string[] = []
  for (const m of messages) {
    if (m.role === 'user') lines.push(`- User: ${summarizeTurn(m)}`)
    else if (m.role === 'assistant' && m.appliedFiles?.length) {
      lines.push(`- Agent applied: ${m.appliedFiles.join(', ')}`)
    }
  }
  return lines.slice(-20).join('\n')
}

// ─── Public API ──────────────────────────────────────────────────

export function compactMessagesForApi(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_API_MESSAGES) {
    const total = messages.reduce((n, m) => n + m.content.length, 0)
    if (total <= MAX_TOTAL_CHARS) return messages
  }

  const recent = messages.slice(-MAX_API_MESSAGES)
  const older = messages.slice(0, -MAX_API_MESSAGES)

  if (older.length === 0) return recent

  const summary = buildOlderSummary(older)
  const summaryMsg: ChatMessage = {
    id: 'compact-summary',
    role: 'user',
    content: `[Earlier conversation summary — ${older.length} messages]\n${summary}`,
    timestamp: 0,
  }

  return [summaryMsg, ...recent]
}
