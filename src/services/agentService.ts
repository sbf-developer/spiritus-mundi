import { detectLanguage, useIDEStore } from '../store/ideStore'

export interface FileEdit {
  path: string
  content: string
}

const FILE_TAG_RE = /<file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/file>/gi
const RUN_TAG_RE = /<run>([\s\S]*?)<\/run>/gi
const MKDIR_TAG_RE = /<mkdir\s+path=["']([^"']+)["']\s*\/?>/gi
const DELETE_TAG_RE = /<delete\s+path=["']([^"']+)["']\s*\/?>/gi
const RENAME_TAG_RE = /<(?:rename|move)\s+from=["']([^"']+)["']\s+to=["']([^"']+)["']\s*\/?>/gi

export interface FsMkdirOp {
  path: string
}

export interface FsDeleteOp {
  path: string
}

export interface FsRenameOp {
  from: string
  to: string
}

export interface CommandResult {
  command: string
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

export function parseAgentEdits(content: string): FileEdit[] {
  const edits: FileEdit[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(FILE_TAG_RE.source, FILE_TAG_RE.flags)

  while ((match = re.exec(content)) !== null) {
    edits.push({
      path: match[1].trim(),
      content: match[2].replace(/^\n/, '').replace(/\n$/, ''),
    })
  }

  return edits
}

const MARKDOWN_FILE_EXT = /\.(py|js|ts|tsx|jsx|html|css|json|md|txt|yaml|yml|toml|sh|rs|go|java|cpp|c|cs|rb|php|sql|env|gitignore)$/i

/** Fallback when models use markdown fences instead of <file> tags. */
export function parseMarkdownFileEdits(content: string): FileEdit[] {
  if (/<file\s+path=/i.test(content)) return []

  const edits: FileEdit[] = []
  const seen = new Set<string>()

  const add = (filePath: string, body: string) => {
    const path = filePath.trim().replace(/^["']|["']$/g, '')
    if (!path || !MARKDOWN_FILE_EXT.test(path) || seen.has(path)) return
    const code = body.replace(/^\n/, '').replace(/\n$/, '')
    if (code.length < 8) return
    seen.add(path)
    edits.push({ path, content: code })
  }

  let match: RegExpExecArray | null

  const langPathRe = /```([\w+-]*):([^\n`]+)\s*\n([\s\S]*?)```/g
  while ((match = langPathRe.exec(content)) !== null) {
    add(match[2], match[3])
  }
  if (edits.length) return edits

  const headerFenceRe =
    /(?:^|\n)(?:\*\*([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)\*\*|#{1,3}\s+([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)|`([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)`)\s*\n```[\w+-]*\n([\s\S]*?)```/g
  while ((match = headerFenceRe.exec(content)) !== null) {
    add(match[1] || match[2] || match[3], match[4])
  }
  if (edits.length) return edits

  const fenceRe = /```([\w+-]*)\n([\s\S]*?)```/g
  while ((match = fenceRe.exec(content)) !== null) {
    const before = content.slice(Math.max(0, match.index - 400), match.index)
    const nameMatch =
      before.match(/(?:\*\*|`|#{1,3}\s+|File:\s*|Create\s+)([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)\*?\s*$/i) ||
      before.match(/([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)\s*(?:\(|:|\n)\s*$/i)
    if (nameMatch) add(nameMatch[1], match[2])
  }

  return edits
}

export function collectAgentFileEdits(content: string): FileEdit[] {
  const fromTags = parseAgentEdits(content)
  if (fromTags.length > 0) return fromTags
  return parseMarkdownFileEdits(content)
}

export function normalizeShellCommand(command: string): string {
  const trimmed = command.trim()
  if (!trimmed.includes('&&')) return trimmed
  if (process.platform === 'win32') {
    const escaped = trimmed.replace(/"/g, '""')
    return `cmd.exe /c "${escaped}"`
  }
  return trimmed
}

export function parseAgentCommands(content: string): string[] {
  const commands: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(RUN_TAG_RE.source, RUN_TAG_RE.flags)

  while ((match = re.exec(content)) !== null) {
    const lines = match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(normalizeShellCommand)
    commands.push(...lines)
  }

  return commands
}

export function parseAgentMkdirs(content: string): FsMkdirOp[] {
  const ops: FsMkdirOp[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(MKDIR_TAG_RE.source, MKDIR_TAG_RE.flags)
  while ((match = re.exec(content)) !== null) {
    ops.push({ path: match[1].trim() })
  }
  return ops
}

export function parseAgentDeletes(content: string): FsDeleteOp[] {
  const ops: FsDeleteOp[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(DELETE_TAG_RE.source, DELETE_TAG_RE.flags)
  while ((match = re.exec(content)) !== null) {
    ops.push({ path: match[1].trim() })
  }
  return ops
}

export function parseAgentRenames(content: string): FsRenameOp[] {
  const ops: FsRenameOp[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(RENAME_TAG_RE.source, RENAME_TAG_RE.flags)
  while ((match = re.exec(content)) !== null) {
    ops.push({ from: match[1].trim(), to: match[2].trim() })
  }
  return ops
}

export function resolveProjectPath(rootPath: string, filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('/')) {
    return pathIsInsideRoot(rootPath, filePath) ? filePath : rootPath
  }
  const sep = rootPath.includes('\\') ? '\\' : '/'
  return rootPath + sep + normalized.replace(/\//g, sep)
}

function pathIsInsideRoot(rootPath: string, targetPath: string): boolean {
  const root = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const target = targetPath.replace(/\\/g, '/')
  return target === root || target.startsWith(root + '/')
}

/** Parent directory of a relative path, or null for root-level files. */
function parentDir(relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  if (idx < 0) return null
  return normalized.slice(0, idx) || null
}

/** Reject mkdir on bare filenames like main.py — those are files, not folders. */
function isLikelyFilePath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalized.includes('/')) return false
  return /\.[a-zA-Z0-9]{1,8}$/.test(normalized)
}

export async function applyAgentEdits(
  rootPath: string,
  edits: FileEdit[]
): Promise<{ applied: string[]; errors: string[] }> {
  const applied: string[] = []
  const errors: string[] = []

  for (const edit of edits) {
    const fullPath = resolveProjectPath(rootPath, edit.path)
    const result = await window.ontology.writeFile(fullPath, edit.content)
    if (result.success) {
      applied.push(edit.path)
    } else {
      errors.push(`${edit.path}: ${result.error ?? 'write failed'}`)
    }
  }

  return { applied, errors }
}

export async function applyAgentCommands(
  rootPath: string,
  commands: string[]
): Promise<{ results: CommandResult[]; errors: string[] }> {
  const results: CommandResult[] = []
  const errors: string[] = []

  for (const command of commands) {
    const result = await window.ontology.terminal.exec(rootPath, command)
    results.push({ command, ...result })
    if (!result.success) {
      errors.push(`\`${command}\` exited with code ${result.exitCode}`)
    }
  }

  return { results, errors }
}

export async function applyAgentMkdirs(
  rootPath: string,
  ops: FsMkdirOp[]
): Promise<{ applied: string[]; errors: string[] }> {
  const applied: string[] = []
  const errors: string[] = []

  for (const op of ops) {
    if (isLikelyFilePath(op.path)) {
      errors.push(`mkdir ${op.path}: looks like a file — use <file path="${op.path}"> instead`)
      continue
    }
    const fullPath = resolveProjectPath(rootPath, op.path)
    const result = await window.ontology.mkdirPath(fullPath)
    if (result.success) {
      applied.push(op.path)
    } else {
      errors.push(`mkdir ${op.path}: ${result.error ?? 'failed'}`)
    }
  }

  return { applied, errors }
}

export async function applyAgentDeletes(
  rootPath: string,
  ops: FsDeleteOp[]
): Promise<{ applied: string[]; errors: string[] }> {
  const applied: string[] = []
  const errors: string[] = []

  for (const op of ops) {
    const fullPath = resolveProjectPath(rootPath, op.path)
    if (fullPath === rootPath) {
      errors.push(`delete ${op.path}: cannot delete project root`)
      continue
    }
    const result = await window.ontology.deletePath(fullPath, rootPath)
    if (result.success) {
      applied.push(op.path)
      syncTabAfterDelete(fullPath)
    } else {
      errors.push(`delete ${op.path}: ${result.error ?? 'failed'}`)
    }
  }

  return { applied, errors }
}

export async function applyAgentRenames(
  rootPath: string,
  ops: FsRenameOp[]
): Promise<{ applied: string[]; errors: string[] }> {
  const applied: string[] = []
  const errors: string[] = []

  for (const op of ops) {
    const fromPath = resolveProjectPath(rootPath, op.from)
    const toPath = resolveProjectPath(rootPath, op.to)
    const result = await window.ontology.renamePath(fromPath, toPath)
    if (result.success) {
      applied.push(`${op.from} → ${op.to}`)
      syncTabAfterRename(fromPath, toPath)
    } else {
      errors.push(`rename ${op.from}: ${result.error ?? 'failed'}`)
    }
  }

  return { applied, errors }
}

function pathBasename(p: string): string {
  return p.split(/[/\\]/).pop() || p
}

function syncTabAfterDelete(fullPath: string) {
  const store = useIDEStore.getState()
  const sep = fullPath.includes('\\') ? '\\' : '/'
  const prefix = fullPath + sep
  const toClose = store.tabs
    .filter((t) => t.path === fullPath || t.path.startsWith(prefix))
    .map((t) => t.path)
  for (const p of toClose) store.closeTab(p)
}

function syncTabAfterRename(oldPath: string, newPath: string) {
  const sep = oldPath.includes('\\') ? '\\' : '/'
  const oldPrefix = oldPath + sep

  useIDEStore.setState((state) => ({
    tabs: state.tabs.map((t) => {
      if (t.path === oldPath) {
        const name = pathBasename(newPath)
        return { ...t, path: newPath, name, language: detectLanguage(name) }
      }
      if (t.path.startsWith(oldPrefix)) {
        const updated = newPath + sep + t.path.slice(oldPrefix.length)
        const name = pathBasename(updated)
        return { ...t, path: updated, name, language: detectLanguage(name) }
      }
      return t
    }),
    activeTabPath: (() => {
      const active = state.activeTabPath
      if (!active) return active
      if (active === oldPath) return newPath
      if (active.startsWith(oldPrefix)) return newPath + sep + active.slice(oldPrefix.length)
      return active
    })(),
  }))
}

export async function applyAgentFilesystem(
  rootPath: string,
  content: string
): Promise<{ summaryParts: string[]; errors: string[]; appliedFiles: string[] }> {
  const summaryParts: string[] = []
  const errors: string[] = []
  let appliedFiles: string[] = []

  const mkdirs = parseAgentMkdirs(content)
  if (mkdirs.length > 0) {
    const { applied, errors: mkdirErrors } = await applyAgentMkdirs(rootPath, mkdirs)
    if (applied.length) {
      summaryParts.push(
        `✓ **Created ${applied.length} folder${applied.length > 1 ? 's' : ''}:** ${applied.map((p) => `\`${p}\``).join(', ')}`
      )
    }
    errors.push(...mkdirErrors)
  }

  const renames = parseAgentRenames(content)
  if (renames.length > 0) {
    const { applied, errors: renameErrors } = await applyAgentRenames(rootPath, renames)
    if (applied.length) {
      summaryParts.push(`✓ **Renamed ${applied.length}:** ${applied.map((p) => `\`${p}\``).join(', ')}`)
    }
    errors.push(...renameErrors)
  }

  const edits = collectAgentFileEdits(content)
  if (edits.length > 0) {
    const implicitDirs = [
      ...new Set(edits.map((e) => parentDir(e.path)).filter((d): d is string => Boolean(d))),
    ]
    for (const dir of implicitDirs) {
      if (!mkdirs.some((m) => m.path === dir)) {
        const { applied } = await applyAgentMkdirs(rootPath, [{ path: dir }])
        if (applied.length) {
          summaryParts.push(`✓ **Created folder:** \`${dir}\``)
        }
      }
    }

    const { applied, errors: editErrors } = await applyAgentEdits(rootPath, edits)
    if (applied.length > 0) {
      openEditedFilesInEditor(rootPath, edits.filter((e) => applied.includes(e.path)))
      appliedFiles = applied
      summaryParts.push(
        `✓ **Applied ${applied.length} file${applied.length > 1 ? 's' : ''}:** ${applied.map((f) => `\`${f}\``).join(', ')}`
      )
    }
    errors.push(...editErrors)
  }

  const deletes = parseAgentDeletes(content)
  if (deletes.length > 0) {
    const { applied, errors: deleteErrors } = await applyAgentDeletes(rootPath, deletes)
    if (applied.length) {
      summaryParts.push(`✓ **Deleted ${applied.length}:** ${applied.map((p) => `\`${p}\``).join(', ')}`)
    }
    errors.push(...deleteErrors)
  }

  return { summaryParts, errors, appliedFiles }
}

export function openEditedFilesInEditor(rootPath: string, edits: FileEdit[]) {
  const store = useIDEStore.getState()

  for (const edit of edits) {
    const fullPath = resolveProjectPath(rootPath, edit.path)
    store.recordRecentEdit(fullPath, 'agent')
    const name = edit.path.split(/[/\\]/).pop() || edit.path
    const existing = store.tabs.find((t) => t.path === fullPath)

    if (existing) {
      useIDEStore.setState((state) => ({
        tabs: state.tabs.map((t) =>
          t.path === fullPath ? { ...t, content: edit.content, isDirty: false } : t
        ),
        activeTabPath: fullPath,
      }))
    } else {
      store.openTab({
        path: fullPath,
        name,
        content: edit.content,
        isDirty: false,
        language: detectLanguage(name),
        viewMode: 'code',
      })
    }
  }
}

export function stripFileTags(content: string): string {
  return content.replace(FILE_TAG_RE, '')
}

export function stripFsTags(content: string): string {
  return content
    .replace(MKDIR_TAG_RE, '')
    .replace(DELETE_TAG_RE, '')
    .replace(RENAME_TAG_RE, '')
}

export function stripAgentActionTags(content: string): string {
  return stripRunTags(stripFsTags(stripFileTags(content))).replace(/\n{3,}/g, '\n\n').trim()
}

export function stripRunTags(content: string): string {
  return content.replace(RUN_TAG_RE, '')
}
