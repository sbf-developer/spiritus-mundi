/**
 * Parse agent assistant messages into typed UI blocks.
 *
 * Input: raw markdown + XML-like tags from the model
 * Output: AgentMessageBlock[] consumed by AgentMessageRenderer
 *
 * Block types: text | file | code | mkdir | delete | rename | run | summary
 */
export type AgentMessageBlock =
  | { type: 'text'; content: string }
  | { type: 'file'; path: string; content: string }
  | { type: 'code'; path?: string; language: string; content: string }
  | { type: 'mkdir'; path: string }
  | { type: 'delete'; path: string }
  | { type: 'rename'; from: string; to: string }
  | { type: 'run'; commands: string[] }
  | { type: 'summary'; content: string }

const AGENT_TAG_RE =
  /<file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/file>|<mkdir\s+path=["']([^"']+)["']\s*\/?>|<delete\s+path=["']([^"']+)["']\s*\/?>|<(?:rename|move)\s+from=["']([^"']+)["']\s+to=["']([^"']+)["']\s*\/?>|<run>([\s\S]*?)<\/run>/gi

const MARKDOWN_FILE_EXT = /\.(py|js|ts|tsx|jsx|html|css|json|md|txt|yaml|yml|toml|sh|rs|go|java|cpp|c|cs|rb|php|sql|env|gitignore)$/i

// ─── Helpers: infer filename from prose before a code fence ──────

function looksLikeCode(text: string): boolean {
  const t = text.trim()
  if (t.length < 40 || t.split('\n').length < 3) return false
  return /^(import |from |def |class |const |function |#include |package |use |<?xml|<!DOCTYPE)/m.test(t)
}

function inferFilename(before: string, lang: string): string | undefined {
  const nameMatch =
    before.match(/(?:\*\*|`|#{1,3}\s+|File:\s*|Create\s+)([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)\*?\s*$/i) ||
    before.match(/([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)\s*(?:\(|:|\n)\s*$/i)
  if (nameMatch && MARKDOWN_FILE_EXT.test(nameMatch[1])) return nameMatch[1]

  if (lang === 'python' || lang === 'py') return 'script.py'
  if (lang === 'javascript' || lang === 'js') return 'script.js'
  if (lang === 'typescript' || lang === 'ts') return 'script.ts'
  return undefined
}

// ─── Split prose segment into text + fenced code blocks ──────────

function expandTextSegment(text: string, globalOffset: number, fullContent: string): AgentMessageBlock[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const blocks: AgentMessageBlock[] = []
  const fenceRe = /```([\w.:+/\\-]*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const prose = text.slice(lastIndex, match.index).trim()
      if (prose) blocks.push({ type: 'text', content: prose })
    }

    const rawLang = match[1] || 'plaintext'
    let language = rawLang
    let path: string | undefined

    if (rawLang.includes(':')) {
      const [lang, file] = rawLang.split(':')
      language = lang || 'plaintext'
      path = file?.trim()
    } else {
      const before = fullContent.slice(Math.max(0, globalOffset + match.index - 400), globalOffset + match.index)
      path = inferFilename(before, language)
    }

    blocks.push({
      type: 'code',
      path,
      language,
      content: match[2].replace(/\n$/, ''),
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex).trim()
    if (rest) {
      if (blocks.length === 0 && looksLikeCode(rest)) {
        blocks.push({ type: 'code', language: 'python', content: rest })
      } else {
        blocks.push({ type: 'text', content: rest })
      }
    }
  }

  if (blocks.length === 0 && looksLikeCode(trimmed)) {
    blocks.push({ type: 'code', language: 'python', content: trimmed })
  } else if (blocks.length === 0) {
    blocks.push({ type: 'text', content: trimmed })
  }

  return blocks
}

// ─── Main parser: split full message into renderable blocks ──────

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
      const text = main.slice(lastIndex, match.index)
      blocks.push(...expandTextSegment(text, lastIndex, main))
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
    blocks.push(...expandTextSegment(main.slice(lastIndex), lastIndex, main))
  }

  if (blocks.length === 0 && main.trim()) {
    blocks.push(...expandTextSegment(main, 0, main))
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
