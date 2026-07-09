import type { FileEntry } from '../vite-env.d'
import { detectLanguage, useIDEStore } from '../store/ideStore'
import { flattenTreeListing } from './contextService'

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

export function parseAgentCommands(content: string): string[] {
  const commands: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(RUN_TAG_RE.source, RUN_TAG_RE.flags)

  while ((match = re.exec(content)) !== null) {
    const lines = match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
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

function flattenTree(entries: FileEntry[], prefix = ''): string[] {
  return flattenTreeListing(entries, prefix)
}

export function buildAgentSystemPrompt(
  rootPath: string | null,
  fileTree: FileEntry[],
  activeFile: { path: string; content: string; language: string } | null
): string {
  const treeListing = rootPath
    ? flattenTree(fileTree).slice(0, 80).join('\n') || '(empty — no files yet)'
    : '(no folder open — tell user to open a folder first)'

  const rootName = rootPath?.split(/[/\\]/).pop() ?? 'project'
  const isEmptyProject = fileTree.length === 0

  const activeSection = activeFile
    ? `\nActive file: ${activeFile.path.split(/[/\\]/).pop()}\n\`\`\`${activeFile.language}\n${activeFile.content.slice(0, 4000)}\n\`\`\``
    : ''

  return `You are a coding agent inside Spiritus Mundi IDE. You EDIT files directly in the user's project.

WORKSPACE (critical):
- The user opened folder "${rootName}" — that IS the project root. Full path: ${rootPath ?? 'NOT OPEN'}
- You are already inside their project. Do NOT create a new wrapper folder for the whole app.
- Put files at the root or in purposeful subfolders (src/, css/) — never ${rootName}/some-app-name/... when the workspace is already "${rootName}".
${isEmptyProject ? '- The folder is empty: write index.html, package.json, etc. directly at the root (e.g. path="index.html").' : '- Extend the existing tree below; match its layout.'}

Project files:
${treeListing}
${activeSection}

The user may attach @context blocks (terminal output, code selections, files, folders). Treat attached context as ground truth.

PATH EXAMPLES (folder "${rootName}" is open):
- User asks for a Three.js app → <file path="index.html">, <file path="main.js">, <file path="package.json"> at root
- WRONG → <mkdir path="threejs-animation" /> then files inside that folder (unless user explicitly named that folder)
- OK subfolders → src/utils.ts, public/index.html when structure warrants it

AGENT MODE RULES:
1. Create/modify files with FULL content:
<file path="index.html">
...
</file>
2. Folders only when needed: <mkdir path="src/components" />
3. Rename: <rename from="old.ts" to="new.ts" />
4. Delete: <delete path="unused.js" />
5. Shell: <run>npm install</run>
6. All paths are relative to project root "${rootName}".
7. Complete file contents only (not diffs).
8. Applied order: mkdir → rename → file writes → delete → terminal.
9. Use tags for every change — do not claim changes without them.
10. If no folder is open, tell the user to open one first.`
}

export function buildChatSystemPrompt(
  activeFile: { path: string; content: string; language: string } | null,
  rootPath: string | null,
  fileTree: FileEntry[] = []
): string {
  const treeSection =
    rootPath && fileTree.length
      ? `\nProject files:\n${flattenTree(fileTree).slice(0, 60).join('\n')}`
      : ''

  if (!activeFile) {
    return `You are a helpful coding assistant in Spiritus Mundi IDE.
Answer questions clearly. Use markdown with fenced code blocks for code examples.
Do NOT use <file> tags — chat mode is read-only and does not modify the project.
The user can attach @context: terminal output, code selections, files, folders, or codebase snippets. Use attached context carefully.
${rootPath ? `Project is open at: ${rootPath}` : 'No project folder is open.'}${treeSection}`
  }

  const relativePath = rootPath
    ? activeFile.path.replace(rootPath, '').replace(/^[/\\]/, '')
    : activeFile.path

  return `You are a helpful coding assistant in Spiritus Mundi IDE (CHAT mode — read only).
Answer questions about the code. Use markdown with fenced code blocks.
Do NOT use <file> tags. Suggest code in markdown blocks only.
The user can attach @context: terminal output, code selections, files, folders, or codebase snippets.${treeSection}

Open file: ${relativePath}
\`\`\`${activeFile.language}
${activeFile.content.slice(0, 6000)}
\`\`\`

Be concise and practical.`
}

export async function applyAgentEdits(
  rootPath: string,
  edits: FileEdit[]
): Promise<{ applied: string[]; errors: string[] }> {
  const applied: string[] = []
  const errors: string[] = []

  for (const edit of edits) {
    const fullPath = resolveProjectPath(rootPath, edit.path)
    const result = await window.spiritus.writeFile(fullPath, edit.content)
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
    const result = await window.spiritus.terminal.exec(rootPath, command)
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
    const fullPath = resolveProjectPath(rootPath, op.path)
    const result = await window.spiritus.mkdirPath(fullPath)
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
    const result = await window.spiritus.deletePath(fullPath)
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
    const result = await window.spiritus.renamePath(fromPath, toPath)
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

  const edits = parseAgentEdits(content)
  if (edits.length > 0) {
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
