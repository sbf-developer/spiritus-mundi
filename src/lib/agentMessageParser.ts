export type AgentMessageBlock =
  | { type: 'text'; content: string }
  | { type: 'file'; path: string; content: string }
  | { type: 'mkdir'; path: string }
  | { type: 'delete'; path: string }
  | { type: 'rename'; from: string; to: string }
  | { type: 'run'; commands: string[] }
  | { type: 'summary'; content: string }

const AGENT_TAG_RE =
  /<file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/file>|<mkdir\s+path=["']([^"']+)["']\s*\/?>|<delete\s+path=["']([^"']+)["']\s*\/?>|<(?:rename|move)\s+from=["']([^"']+)["']\s+to=["']([^"']+)["']\s*\/?>|<run>([\s\S]*?)<\/run>/gi

export function parseAgentMessageBlocks(content: string): AgentMessageBlock[] {
  const blocks: AgentMessageBlock[] = []
  const summarySplit = content.split(/\n---\n/)
  const main = summarySplit[0] ?? content
  const summary = summarySplit.slice(1).join('\n---\n').trim()

  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(AGENT_TAG_RE.source, AGENT_TAG_RE.flags)

  while ((match = re.exec(main)) !== null) {
    if (match.index > lastIndex) {
      const text = main.slice(lastIndex, match.index).trim()
      if (text) blocks.push({ type: 'text', content: text })
    }

    if (match[1] !== undefined) {
      blocks.push({
        type: 'file',
        path: match[1].trim(),
        content: match[2].replace(/^\n/, '').replace(/\n$/, ''),
      })
    } else if (match[3] !== undefined) {
      blocks.push({ type: 'mkdir', path: match[3].trim() })
    } else if (match[4] !== undefined) {
      blocks.push({ type: 'delete', path: match[4].trim() })
    } else if (match[5] !== undefined && match[6] !== undefined) {
      blocks.push({ type: 'rename', from: match[5].trim(), to: match[6].trim() })
    } else if (match[7] !== undefined) {
      const commands = match[7]
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (commands.length) blocks.push({ type: 'run', commands })
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < main.length) {
    const text = main.slice(lastIndex).trim()
    if (text) blocks.push({ type: 'text', content: text })
  }

  if (blocks.length === 0 && main.trim()) {
    blocks.push({ type: 'text', content: main.trim() })
  }

  if (summary) blocks.push({ type: 'summary', content: summary })

  return blocks
}

export function extBadge(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'TS',
    tsx: 'TS',
    js: 'JS',
    jsx: 'JS',
    py: 'PY',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    md: 'MD',
    rs: 'RS',
    go: 'GO',
  }
  if (map[ext]) return map[ext]
  if (!ext) return 'FILE'
  return ext.toUpperCase().slice(0, 4)
}
