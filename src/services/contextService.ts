import type { FileEntry } from '../vite-env.d'
import { detectLanguage } from '../store/ideStore'

export type ContextItemType = 'terminal' | 'code' | 'file' | 'folder' | 'codebase'

export interface ContextItem {
  id: string
  type: ContextItemType
  label: string
  content: string
  path?: string
  startLine?: number
  endLine?: number
  language?: string
}

export interface EditorSelection {
  path: string
  name: string
  startLine: number
  endLine: number
  content: string
  language: string
}

const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'cs', 'rb', 'php',
  'html', 'css', 'scss', 'json', 'md', 'yaml', 'yml', 'xml', 'sql', 'sh', 'bash', 'ps1', 'toml',
  'vue', 'svelte', 'txt', 'env', 'gitignore',
])

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-electron', 'build', '.next', 'coverage'])

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

export function relPath(rootPath: string, fullPath: string): string {
  return fullPath.replace(rootPath, '').replace(/^[/\\]/, '').replace(/\\/g, '/')
}

export function flattenFiles(entries: FileEntry[], prefix = ''): { path: string; rel: string; name: string }[] {
  const files: { path: string; rel: string; name: string }[] = []
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory) {
      if (!SKIP_DIRS.has(e.name)) {
        files.push(...flattenFiles(e.children ?? [], rel))
      }
    } else {
      files.push({ path: e.path, rel, name: e.name })
    }
  }
  return files
}

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return TEXT_EXTENSIONS.has(ext)
}

export function flattenTreeListing(entries: FileEntry[], prefix = ''): string[] {
  const lines: string[] = []
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    lines.push(e.isDirectory ? `${rel}/` : rel)
    if (e.children?.length && !SKIP_DIRS.has(e.name)) {
      lines.push(...flattenTreeListing(e.children, rel))
    }
  }
  return lines
}

export function createTerminalContext(content: string): ContextItem {
  const cleaned = stripAnsi(content).trim()
  const trimmed = cleaned.length > 8000 ? cleaned.slice(-8000) : cleaned
  return {
    id: crypto.randomUUID(),
    type: 'terminal',
    label: 'Terminal',
    content: trimmed,
  }
}

export function createCodeContext(
  path: string,
  name: string,
  startLine: number,
  endLine: number,
  content: string,
  language: string,
  rootPath: string | null
): ContextItem {
  const rel = rootPath ? relPath(rootPath, path) : name
  return {
    id: crypto.randomUUID(),
    type: 'code',
    label: `${rel}:${startLine}-${endLine}`,
    path: rel,
    startLine,
    endLine,
    language,
    content,
  }
}

export function createFileContext(
  path: string,
  name: string,
  content: string,
  rootPath: string | null
): ContextItem {
  const rel = rootPath ? relPath(rootPath, path) : name
  const trimmed = content.length > 12000 ? content.slice(0, 12000) + '\n...(truncated)' : content
  return {
    id: crypto.randomUUID(),
    type: 'file',
    label: rel,
    path: rel,
    language: detectLanguage(name),
    content: trimmed,
  }
}

export async function createFolderContext(
  folderPath: string,
  folderName: string,
  fileTree: FileEntry[],
  rootPath: string | null
): Promise<ContextItem> {
  const folder = findFolder(fileTree, folderPath)
  const listing = folder ? flattenTreeListing(folder.children ?? []) : []
  const textFiles = listing.filter((f) => !f.endsWith('/') && isTextFile(f)).slice(0, 6)

  const parts: string[] = [`Folder: ${folderName}`, '', 'Contents:', ...listing.slice(0, 40)]

  for (const rel of textFiles) {
    const fullPath = rootPath
      ? rootPath + (rootPath.includes('\\') ? '\\' : '/') + rel.replace(/\//g, rootPath.includes('\\') ? '\\' : '/')
      : rel
    const result = await window.spiritus.readFile(fullPath)
    if (result.success) {
      const snippet = result.content.length > 3000 ? result.content.slice(0, 3000) + '\n...(truncated)' : result.content
      parts.push('', `--- ${rel} ---`, '```' + detectLanguage(rel), snippet, '```')
    }
  }

  return {
    id: crypto.randomUUID(),
    type: 'folder',
    label: folderName + '/',
    path: rootPath ? relPath(rootPath, folderPath) : folderName,
    content: parts.join('\n'),
  }
}

function findFolder(entries: FileEntry[], targetPath: string): FileEntry | null {
  for (const e of entries) {
    if (e.path === targetPath) return e
    if (e.children) {
      const found = findFolder(e.children, targetPath)
      if (found) return found
    }
  }
  return null
}

export async function searchCodebaseContext(
  rootPath: string,
  fileTree: FileEntry[],
  query: string
): Promise<ContextItem | null> {
  const keywords = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2)
    .slice(0, 6)

  if (keywords.length === 0) return null

  const candidates = flattenFiles(fileTree).filter((f) => isTextFile(f.name)).slice(0, 120)
  const scored: { rel: string; path: string; score: number; snippet: string; language: string }[] = []

  for (const file of candidates) {
    const result = await window.spiritus.readFile(file.path)
    if (!result.success) continue

    const lower = result.content.toLowerCase()
    let score = 0
    for (const kw of keywords) {
      if (file.rel.toLowerCase().includes(kw)) score += 3
      if (lower.includes(kw)) score += lower.split(kw).length - 1
    }
    if (score === 0) continue

    const idx = keywords.reduce((best, kw) => {
      const i = lower.indexOf(kw)
      return i >= 0 && (best < 0 || i < best) ? i : best
    }, -1)

    const start = Math.max(0, idx - 400)
    const snippet = result.content.slice(start, start + 1200)

    scored.push({
      rel: file.rel,
      path: file.path,
      score,
      snippet,
      language: detectLanguage(file.name),
    })
  }

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 5)
  if (top.length === 0) return null

  const content = top
    .map(
      (hit) =>
        `### ${hit.rel}\n\`\`\`${hit.language}\n${hit.snippet.trim()}\n\`\`\``
    )
    .join('\n\n')

  return {
    id: crypto.randomUUID(),
    type: 'codebase',
    label: 'Codebase',
    content,
  }
}

export function formatContextForPrompt(items: ContextItem[]): string {
  if (items.length === 0) return ''

  const sections = items.map((item) => {
    switch (item.type) {
      case 'terminal':
        return `## Terminal output\n\`\`\`\n${item.content}\n\`\`\``
      case 'code':
        return `## Code selection: ${item.label}\n\`\`\`${item.language ?? 'plaintext'}\n${item.content}\n\`\`\``
      case 'file':
        return `## File: ${item.label}\n\`\`\`${item.language ?? 'plaintext'}\n${item.content}\n\`\`\``
      case 'folder':
        return `## Folder: ${item.label}\n${item.content}`
      case 'codebase':
        return `## Relevant codebase snippets\n${item.content}`
      default:
        return item.content
    }
  })

  return `The user attached the following context (@ references):\n\n${sections.join('\n\n')}`
}

export function parsePastedCodeContext(text: string, rootPath: string | null): ContextItem | null {
  const trimmed = text.trim()
  if (trimmed.length < 10) return null

  const pathLineMatch = trimmed.match(/^(?:\/\/|#|<!--)\s*(?:file:\s*)?([^\s:]+\.[a-z0-9]+)\s*(?::\s*(\d+)(?:-(\d+))?)?/im)
  const hasCodeShape = trimmed.includes('\n') && (trimmed.includes('{') || trimmed.includes('function') || trimmed.includes('<') || trimmed.includes('const '))

  if (!hasCodeShape && !pathLineMatch) return null

  const path = pathLineMatch?.[1]
  const startLine = pathLineMatch?.[2] ? parseInt(pathLineMatch[2], 10) : 1
  const endLine = pathLineMatch?.[3] ? parseInt(pathLineMatch[3], 10) : startLine + trimmed.split('\n').length - 1

  return {
    id: crypto.randomUUID(),
    type: 'code',
    label: path ? `${path}:${startLine}-${endLine}` : `Pasted code (${trimmed.split('\n').length} lines)`,
    path: path ?? undefined,
    startLine,
    endLine,
    language: path ? detectLanguage(path) : 'plaintext',
    content: trimmed,
  }
}

export interface ContextPickerOption {
  id: string
  type: ContextItemType | 'selection'
  label: string
  detail?: string
}

export function buildContextPickerOptions(
  fileTree: FileEntry[],
  terminalBuffer: string,
  selection: EditorSelection | null,
  filter: string
): ContextPickerOption[] {
  const q = filter.toLowerCase()
  const options: ContextPickerOption[] = []

  if (!q || 'terminal'.includes(q)) {
    options.push({
      id: 'terminal',
      type: 'terminal',
      label: 'Terminal',
      detail: terminalBuffer.trim() ? `${stripAnsi(terminalBuffer).trim().split('\n').length} lines buffered` : 'No output yet',
    })
  }

  if (selection && (!q || 'selection'.includes(q) || selection.name.toLowerCase().includes(q))) {
    options.push({
      id: 'selection',
      type: 'selection',
      label: 'Selection',
      detail: `${selection.name}:${selection.startLine}-${selection.endLine}`,
    })
  }

  if (!q || 'codebase'.includes(q)) {
    options.push({ id: 'codebase', type: 'codebase', label: 'Codebase', detail: 'Search project for relevant files' })
  }

  const files = flattenFiles(fileTree)
  for (const f of files) {
    if (options.length > 40) break
    if (q && !f.rel.toLowerCase().includes(q) && !f.name.toLowerCase().includes(q)) continue
    options.push({ id: f.path, type: 'file', label: f.rel, detail: 'File' })
  }

  const addFolders = (entries: FileEntry[], prefix = '') => {
    for (const e of entries) {
      if (!e.isDirectory || SKIP_DIRS.has(e.name)) continue
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (!q || rel.toLowerCase().includes(q)) {
        options.push({ id: e.path, type: 'folder', label: rel + '/', detail: 'Folder' })
      }
      if (e.children) addFolders(e.children, rel)
    }
  }
  addFolders(fileTree)

  return options.slice(0, 30)
}
