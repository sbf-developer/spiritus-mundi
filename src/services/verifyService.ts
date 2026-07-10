/**
 * Post-edit verification — run after agent writes files.
 *
 * Checks: Python py_compile, npm typecheck/lint (if package.json has script).
 * Failures trigger auto-fix retry in ChatPanel (fix phase).
 */

import { normalizeShellCommand } from './agentService'

export interface VerifyResult {
  ok: boolean
  lines: string[]
}

export async function verifyAppliedFiles(rootPath: string, relativePaths: string[]): Promise<VerifyResult> {
  const lines: string[] = []
  let ok = true

  // Python: syntax check each .py file the agent wrote
  const pyFiles = relativePaths.filter((p) => p.endsWith('.py'))
  for (const rel of pyFiles) {
    const cmd = normalizeShellCommand(`python -m py_compile "${rel.replace(/"/g, '""')}"`)
    const result = await window.ontology.terminal.exec(rootPath, cmd)
    if (!result.success) {
      ok = false
      const err = (result.stderr || result.stdout || 'syntax error').trim().slice(0, 400)
      lines.push(`Python syntax: ${rel} — ${err}`)
    } else {
      lines.push(`✓ Python syntax OK: ${rel}`)
    }
  }

  // TypeScript: run package.json typecheck/lint script if present
  const tsFiles = relativePaths.filter((p) => /\.(ts|tsx)$/.test(p))
  if (tsFiles.length > 0) {
    const sep = rootPath.includes('\\') ? '\\' : '/'
    const pkg = await window.ontology.readFile(`${rootPath}${sep}package.json`)
    if (pkg.success) {
      try {
        const json = JSON.parse(pkg.content) as { scripts?: Record<string, string> }
        const script = json.scripts?.typecheck || json.scripts?.['type-check'] || json.scripts?.lint
        if (script) {
          const result = await window.ontology.terminal.exec(rootPath, normalizeShellCommand(script))
          if (!result.success) {
            ok = false
            lines.push(`Typecheck/lint failed:\n${(result.stderr || result.stdout).trim().slice(0, 600)}`)
          } else {
            lines.push('✓ Typecheck/lint passed')
          }
        }
      } catch {
        // invalid package.json
      }
    }
  }

  if (relativePaths.length > 0 && lines.length === 0) {
    lines.push(`✓ Wrote ${relativePaths.length} file${relativePaths.length > 1 ? 's' : ''} (no automated checks for this file type)`)
  }

  return { ok, lines }
}
