/**
 * Harness layer — filter rules/skills for the current context (renderer-side).
 *
 * Raw files are loaded in electron/harnessLoader.ts via IPC.
 * This module selects which rules apply (alwaysApply + glob match on active file)
 * and which skills match the user's query keywords.
 */

export interface HarnessRule {
  id: string
  name: string
  content: string
  alwaysApply: boolean
  globs: string[]
  description: string
}

export interface HarnessSkill {
  id: string
  name: string
  description: string
  content: string
}

export interface HarnessBundle {
  rules: HarnessRule[]
  skills: HarnessSkill[]
}

export interface RuleSelectionContext {
  activeRel: string | null
  attachedPaths: string[]
  userQuery: string
}

function globMatch(pattern: string, filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  let re = pattern
    .replace(/\\/g, '/')
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
  if (!re.startsWith('**/') && !re.startsWith('/')) {
    re = `(^|/)${re}`
  }
  return new RegExp(`${re}$`, 'i').test(normalized) || normalized.endsWith(pattern.replace(/\\/g, '/'))
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
  )
}

function relevanceScore(corpus: string, query: string): number {
  const q = tokenize(query)
  const c = tokenize(corpus)
  if (q.size === 0 || c.size === 0) return 0
  let hits = 0
  for (const w of q) {
    if (c.has(w)) hits++
  }
  return hits / q.size
}

// ─── Rule/skill selection for contextOntology ────────────────────

export function selectRulesForContext(all: HarnessRule[], ctx: RuleSelectionContext): HarnessRule[] {
  const paths = [ctx.activeRel, ...ctx.attachedPaths].filter(Boolean) as string[]

  return all.filter((rule) => {
    if (rule.alwaysApply) return true

    if (rule.globs.length > 0 && paths.length > 0) {
      return paths.some((p) => rule.globs.some((g) => globMatch(g, p)))
    }

    if (rule.description) {
      return relevanceScore(`${rule.name} ${rule.description} ${rule.content.slice(0, 200)}`, ctx.userQuery) >= 0.25
    }

    return false
  })
}

export function selectSkillsForContext(
  all: HarnessSkill[],
  userQuery: string,
  max = 2
): HarnessSkill[] {
  if (all.length === 0) return []

  const scored = all
    .map((skill) => ({
      skill,
      score: relevanceScore(`${skill.name} ${skill.description} ${skill.content.slice(0, 300)}`, userQuery),
    }))
    .filter((s) => s.score >= 0.2)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, max).map((s) => s.skill)
}

// ─── Command safety (mirrors electron/harnessLoader) ─────────────

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

export function validateAgentCommand(command: string): { allowed: boolean; reason?: string } {
  const trimmed = command.trim()
  if (!trimmed) return { allowed: false, reason: 'Empty command' }

  for (const { pattern, reason } of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) return { allowed: false, reason }
  }

  return { allowed: true }
}

// ─── Format for LLM prompt layers ────────────────────────────────

export function formatRulesForPrompt(rules: HarnessRule[]): string {
  if (rules.length === 0) return ''
  const sections = rules.map((r) => {
    const scope =
      r.globs.length > 0 ? ` (scope: ${r.globs.join(', ')})` : r.alwaysApply ? ' (always)' : ''
    return `### ${r.name}${scope}\n${r.content}`
  })
  return `# Project rules\nFollow these instructions:\n\n${sections.join('\n\n')}`
}

export function formatSkillsForPrompt(skills: HarnessSkill[]): string {
  if (skills.length === 0) return ''
  const sections = skills.map((s) => `### Skill: ${s.name}\n${s.description ? `${s.description}\n\n` : ''}${s.content}`)
  return `# Active skills\nApply these workflows for this task:\n\n${sections.join('\n\n')}`
}
