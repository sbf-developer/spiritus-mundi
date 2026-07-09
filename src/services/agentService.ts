import type { FileEntry } from '../vite-env.d'
import { detectLanguage, useIDEStore } from '../store/ideStore'
import { flattenTreeListing } from './contextService'

export interface FileEdit {
  path: string
  content: string
}

const FILE_TAG_RE = /<file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/file>/gi
const RUN_TAG_RE = /<run>([\s\S]*?)<\/run>/gi

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

export function resolveProjectPath(rootPath: string, filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('/')) {
    return filePath
  }
  const sep = rootPath.includes('\\') ? '\\' : '/'
  return rootPath + sep + normalized.replace(/\//g, sep)
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
    ? flattenTree(fileTree).slice(0, 80).join('\n') || '(empty project)'
    : '(no folder open — tell user to open a folder first)'

  const activeSection = activeFile
    ? `\nActive file: ${activeFile.path.split(/[/\\]/).pop()}\n\`\`\`${activeFile.language}\n${activeFile.content.slice(0, 4000)}\n\`\`\``
    : ''

  return `You are a coding agent inside Spiritus Mundi IDE. You EDIT files directly in the user's project.

Project root: ${rootPath ?? 'NOT OPEN'}
Project files:
${treeListing}
${activeSection}

The user may attach @context blocks (terminal output, code selections, files, folders). Treat attached context as ground truth for debugging and edits.

AGENT MODE RULES:
1. To create or modify files, wrap FULL file content in tags exactly like this:
<file path="relative/path/to/file.ext">
full file content here
</file>
2. To run shell commands (git, npm, etc.), wrap each command in <run> tags:
<run>git init</run>
<run>git add .</run>
Commands run in the project root. One command per tag (or one per line inside a tag).
3. Use paths relative to the project root. You may edit multiple files in one response.
4. Always write COMPLETE file contents (not diffs or snippets) inside each <file> tag.
5. After file tags and run tags, add a brief summary of what you changed or ran.
6. Do NOT claim you ran commands unless you include <run> tags — the IDE executes those automatically.
7. If no folder is open, tell the user to open a folder first — do not invent paths.
8. For runnable apps, create all needed files (HTML, CSS, JS, etc.) in the project.`
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
  return content.replace(FILE_TAG_RE, (_m, path: string) => `\n📄 \`${path}\` *(applied to project)*\n`)
}

export function stripRunTags(content: string): string {
  return content.replace(RUN_TAG_RE, (_m, cmd: string) => {
    const lines = cmd.trim().split('\n').map((l) => l.trim()).filter(Boolean)
    return lines.map((line) => `\n\`$\` ${line} *(ran in terminal)*\n`).join('')
  })
}
