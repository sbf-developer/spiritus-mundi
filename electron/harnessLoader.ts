/**
 * Project harness loader — runs in Electron main (Node fs access).
 *
 * Loads agent instructions from the opened workspace:
 *   .ontology/rules/*.mdc   — scoped rules (alwaysApply + globs)
 *   .ontology/skills/<name>/SKILL.md — skill playbooks
 *   AGENTS.md, .ontologyrules, .cursor/rules — legacy / compat
 *
 * Also exports validateCommand / validateDeletePath for agent safety.
 */
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'

export interface RawHarnessRule {
  id: string
  name: string
  content: string
  alwaysApply: boolean
  globs: string[]
  description: string
}

export interface RawHarnessSkill {
  id: string
  name: string
  description: string
  content: string
}

export interface RawHarnessBundle {
  rules: RawHarnessRule[]
  skills: RawHarnessSkill[]
}

// ─── Frontmatter parsing (.mdc / SKILL.md) ───────────────────────

function parseFrontmatter(raw: string): { meta: Record<string, string | boolean>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw.trim() }

  const end = raw.indexOf('\n---', 3)
  if (end < 0) return { meta: {}, body: raw.trim() }

  const yamlBlock = raw.slice(raw.indexOf('\n') + 1, end)
  const body = raw.slice(end + 4).trim()
  const meta: Record<string, string | boolean> = {}

  for (const line of yamlBlock.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if (val === 'true') meta[key] = true
    else if (val === 'false') meta[key] = false
    else meta[key] = val.replace(/^["']|["']$/g, '')
  }

  return { meta, body }
}

function parseGlobs(meta: Record<string, string | boolean>): string[] {
  const g = meta.globs
  if (typeof g !== 'string' || !g.trim()) return []
  return g.split(',').map((s) => s.trim()).filter(Boolean)
}

async function readTextFile(filePath: string, maxBytes = 48 * 1024): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || stat.size > maxBytes) return null
    return (await fs.readFile(filePath, 'utf-8')).trim()
  } catch {
    return null
  }
}

// ─── Load .ontology/rules and .cursor/rules ────────────────────

async function loadRulesDir(dirPath: string, prefix: string): Promise<RawHarnessRule[]> {
  if (!fsSync.existsSync(dirPath)) return []

  const rules: RawHarnessRule[] = []
  let entries: string[]
  try {
    entries = await fs.readdir(dirPath)
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!/\.(mdc|md)$/i.test(entry)) continue
    const content = await readTextFile(path.join(dirPath, entry))
    if (!content) continue

    const { meta, body } = parseFrontmatter(content)
    const alwaysApply = meta.alwaysApply === true || meta.always_apply === true
    const description = String(meta.description ?? '')

    rules.push({
      id: `${prefix}/${entry}`,
      name: entry.replace(/\.(mdc|md)$/i, ''),
      content: body || content,
      alwaysApply,
      globs: parseGlobs(meta),
      description,
    })
  }

  return rules
}

// ─── Load .ontology/skills/*/SKILL.md ────────────────────────────

async function loadSkillsDir(dirPath: string): Promise<RawHarnessSkill[]> {
  if (!fsSync.existsSync(dirPath)) return []

  const skills: RawHarnessSkill[] = []
  let entries: fsSync.Dirent[]
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(dirPath, entry.name, 'SKILL.md')
    const content = await readTextFile(skillPath)
    if (!content) continue

    const { meta, body } = parseFrontmatter(content)
    skills.push({
      id: entry.name,
      name: String(meta.name ?? entry.name),
      description: String(meta.description ?? ''),
      content: body || content,
    })
  }

  return skills
}

// ─── Legacy rule files (root-level markdown) ─────────────────────

async function loadLegacyRules(rootPath: string): Promise<RawHarnessRule[]> {
  const candidates = [
    { file: '.ontologyrules', always: true },
    { file: '.spiritusrules', always: true },
    { file: 'AGENTS.md', always: true },
    { file: '.cursorrules', always: true },
    { file: 'CLAUDE.md', always: true },
  ]

  const rules: RawHarnessRule[] = []
  for (const { file, always } of candidates) {
    const content = await readTextFile(path.join(rootPath, file), 32 * 1024)
    if (content) {
      rules.push({
        id: `legacy/${file}`,
        name: file,
        content,
        alwaysApply: always,
        globs: [],
        description: '',
      })
    }
  }

  return rules
}

async function loadNestedAgentsMd(rootPath: string, activeRel?: string): Promise<RawHarnessRule[]> {
  if (!activeRel) return []

  const rules: RawHarnessRule[] = []
  const parts = activeRel.replace(/\\/g, '/').split('/')
  const relDirs = ['', ...parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))]

  for (const dir of relDirs) {
    const filePath = path.join(rootPath, dir, 'AGENTS.md')
    const content = await readTextFile(filePath, 24 * 1024)
    if (!content) continue

    const label = dir ? `AGENTS.md (${dir}/)` : 'AGENTS.md (root)'
    rules.push({
      id: `nested/${dir || 'root'}/AGENTS.md`,
      name: label,
      content,
      alwaysApply: true,
      globs: [],
      description: '',
    })
  }

  return rules
}

// ─── Public API: load full harness bundle ────────────────────────

export async function loadProjectHarness(rootPath: string, activeRel?: string): Promise<RawHarnessBundle> {
  const [ontologyRules, cursorRules, ontologySkills, legacy, nested] = await Promise.all([
    loadRulesDir(path.join(rootPath, '.ontology', 'rules'), '.ontology/rules'),
    loadRulesDir(path.join(rootPath, '.cursor', 'rules'), '.cursor/rules'),
    loadSkillsDir(path.join(rootPath, '.ontology', 'skills')),
    loadLegacyRules(rootPath),
    loadNestedAgentsMd(rootPath, activeRel),
  ])

  const byId = new Map<string, RawHarnessRule>()
  for (const r of [...legacy, ...nested, ...cursorRules, ...ontologyRules]) {
    byId.set(r.id, r)
  }

  return {
    rules: [...byId.values()],
    skills: ontologySkills,
  }
}

// ─── Agent safety: block destructive commands / deletes ──────────

const BLOCKED_COMMAND_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\brm\s+-rf\s+\/(?!tmp\b|var\/tmp)/i, reason: 'Recursive delete of system root is blocked' },
  { pattern: /\brmdir\s+\/s\s+\/q\s+[a-z]:\\/i, reason: 'Drive wipe commands are blocked' },
  { pattern: /\bformat\s+[a-z]:/i, reason: 'Format commands are blocked' },
  { pattern: /\bdiskpart\b/i, reason: 'diskpart is blocked' },
  { pattern: /\bmkfs\./i, reason: 'Filesystem format commands are blocked' },
  { pattern: />\s*\/dev\/sd/i, reason: 'Direct disk writes are blocked' },
  { pattern: /\bcurl\b.*\|\s*(ba)?sh/i, reason: 'Piping curl to shell is blocked' },
  { pattern: /\bwget\b.*\|\s*(ba)?sh/i, reason: 'Piping wget to shell is blocked' },
]

export function validateCommand(command: string): { allowed: boolean; reason?: string } {
  const trimmed = command.trim()
  if (!trimmed) return { allowed: false, reason: 'Empty command' }

  for (const { pattern, reason } of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) return { allowed: false, reason }
  }

  return { allowed: true }
}

export function validateDeletePath(rootPath: string, targetPath: string): { allowed: boolean; reason?: string } {
  const normalized = targetPath.replace(/\\/g, '/').toLowerCase()
  const root = rootPath.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')

  if (normalized === root || normalized === `${root}/.git`) {
    return { allowed: false, reason: 'Cannot delete project root or .git' }
  }

  if (normalized.includes('/node_modules/') && normalized.endsWith('/node_modules')) {
    return { allowed: false, reason: 'Deleting node_modules via agent is blocked — use a terminal command instead' }
  }

  return { allowed: true }
}
