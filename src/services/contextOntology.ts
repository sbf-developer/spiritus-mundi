/**
 * AI Context Ontology — structured context assembly for LLM prompts.
 *
 * Inspired by Cursor/Windsurf: layered sources, priority tiers, token budgets.
 * Each layer maps to how models consume context (identity → rules → workspace → session → retrieval → user).
 */

import type { FileEntry } from '../vite-env.d'
import type { ChatMessage, ChatMode, OpenTab } from '../store/ideStore'
import type { ContextItem, EditorSelection, RecentEdit } from './contextService'
import {
  flattenTreeListing,
  formatContextForPrompt,
  relPath,
  stripAnsi,
  loadAutoSnippets,
  extractSearchTerms,
  pickGrepQuery,
  type GrepHit,
} from './contextService'
import {
  selectRulesForContext,
  selectSkillsForContext,
  formatRulesForPrompt,
  formatSkillsForPrompt,
  type HarnessRule,
  type HarnessSkill,
} from './harnessService'
import { runDeepResearch, formatResearchLayer } from './researchService'

export type { GrepHit }

export type AgentPhase = 'default' | 'plan' | 'execute' | 'fix'

export type ContextLayer =
  | 'identity'
  | 'rules'
  | 'skills'
  | 'research'
  | 'workspace'
  | 'session'
  | 'retrieval'
  | 'attached'
  | 'history'

export interface GitContext {
  branch: string
  status: string
  diffStat: string
  diff: string
  untracked: string[]
}

export interface ContextAssemblyInput {
  chatMode: ChatMode
  rootPath: string | null
  fileTree: FileEntry[]
  tabs: OpenTab[]
  activeTabPath: string | null
  terminalBuffer: string
  editorSelection: EditorSelection | null
  recentEdits: RecentEdit[]
  userQuery: string
  attachedItems: ContextItem[]
  chatHistory: ChatMessage[]
  rules: HarnessRule[]
  skills: HarnessSkill[]
  git: GitContext | null
  grepHits: GrepHit[]
  autoSnippets: { rel: string; language: string; content: string }[]
  researchBlock: string
}

/** Character budgets per mode (~4 chars ≈ 1 token). */
const BUDGET: Record<ChatMode, number> = {
  agent: 32000,
  chat: 22000,
}

const LAYER_CAPS: Record<ContextLayer, number> = {
  identity: 2500,
  rules: 4500,
  skills: 3500,
  research: 8000,
  workspace: 5000,
  session: 12000,
  retrieval: 10000,
  attached: 14000,
  history: 6000,
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '\n...(truncated)'
}

function activeTab(input: ContextAssemblyInput): OpenTab | null {
  if (!input.activeTabPath) return null
  const tab = input.tabs.find((t) => t.path === input.activeTabPath)
  return tab?.viewMode !== 'image' ? tab ?? null : null
}

function buildIdentityLayer(
  mode: ChatMode,
  rootPath: string | null,
  phase: AgentPhase = 'default'
): string {
  const rootName = rootPath?.split(/[/\\]/).pop() ?? 'project'

  if (mode === 'agent' && phase === 'plan') {
    return `You are a coding agent in Ontology IDE (PLAN mode).

Do NOT write files yet. Output ONLY a markdown plan:
1. **Goal** — what the user wants (1 sentence)
2. **Files to create/modify** — bullet list with paths
3. **Steps** — ordered implementation steps
4. **Commands** — any install/run commands needed (one per line)

Do NOT use <file>, <run>, or other action tags. The user will approve before execution.`
  }

  if (mode === 'agent' && phase === 'fix') {
    return `You are a coding agent in Ontology IDE (FIX mode).

Verification failed after your last edit. Fix ONLY the reported errors.
Use <file path="..."> tags with complete corrected file contents. Brief explanation first.`
  }

  if (mode === 'agent') {
    return `You are a coding agent in Ontology IDE (AGENT mode).

OUTPUT FORMAT (mandatory — files are only created via tags):
1. Write a brief plain-text plan (2–4 sentences max).
2. Create EVERY file with a tag — never paste raw code outside tags:
<file path="rct_simulation.py">
(full file contents here)
</file>
3. Optional folders: <mkdir path="src" />
4. Shell commands ONLY in: <run>pip install -r requirements.txt</run>
   - Windows PowerShell: NEVER use && — one command per <run> tag, or use cmd-style in one tag.

RULES:
- Opened folder "${rootName}" IS the project root. Paths are relative (e.g. path="main.py" not path="${rootName}/main.py").
- Do NOT create wrapper subfolders unless the user asked.
- Complete file contents only (not diffs). One <file> tag per file.
- Do NOT claim files were created unless you output the <file> tags.
- Applied order: mkdir → rename → file writes → delete → terminal.
- After file writes, the IDE runs automated checks (syntax, lint). Fix any reported errors.
- If no folder is open, tell the user to open one first (Ctrl+O).`
  }

  return `You are a helpful coding assistant in Ontology IDE (CHAT mode — read only).
Answer clearly with markdown and fenced code blocks. Do NOT use <file> tags or modify the project.
${rootPath ? `Project open: ${rootPath}` : 'No project folder open.'}`
}

function buildSkillsLayer(skills: HarnessSkill[]): string {
  return formatSkillsForPrompt(skills)
}

function buildWorkspaceLayer(
  rootPath: string | null,
  fileTree: FileEntry[],
  git: GitContext | null
): string {
  if (!rootPath) return '# Workspace\nNo folder open.'

  const rootName = rootPath.split(/[/\\]/).pop() ?? 'project'
  const listing = flattenTreeListing(fileTree).slice(0, 100).join('\n') || '(empty)'

  const parts = [
    `# Workspace`,
    `Root: ${rootName} (${rootPath})`,
    '',
    '## File tree',
    listing,
  ]

  if (git) {
    parts.push('', '## Git', `Branch: ${git.branch}`, '', '### Status', git.status || '(clean)')
    if (git.diffStat) parts.push('', '### Changed files', git.diffStat)
    if (git.untracked.length) parts.push('', '### Untracked', git.untracked.join('\n'))
    if (git.diff) parts.push('', '### Diff (working tree vs HEAD)', '```diff', git.diff, '```')
  }

  return parts.join('\n')
}

function buildSessionLayer(input: ContextAssemblyInput): string {
  const tab = activeTab(input)
  const parts: string[] = ['# Session state']

  if (input.tabs.length > 0) {
    const tabLines = input.tabs
      .filter((t) => t.viewMode !== 'image')
      .map((t) => {
        const rel = input.rootPath ? relPath(input.rootPath, t.path) : t.name
        const flags = [
          t.path === input.activeTabPath ? 'active' : null,
          t.isDirty ? 'unsaved' : null,
        ].filter(Boolean)
        return `- ${rel}${flags.length ? ` (${flags.join(', ')})` : ''}`
      })
    parts.push('', '## Open tabs', tabLines.join('\n'))
  }

  if (tab && input.rootPath) {
    const rel = relPath(input.rootPath, tab.path)
    parts.push('', `## Active file: ${rel}`, '```' + tab.language, truncate(tab.content, 5000), '```')
  }

  if (input.editorSelection) {
    const sel = input.editorSelection
    const rel = input.rootPath ? relPath(input.rootPath, sel.path) : sel.name
    parts.push(
      '',
      `## Current selection: ${rel}:${sel.startLine}-${sel.endLine}`,
      '```' + sel.language,
      sel.content,
      '```'
    )
  }

  const term = stripAnsi(input.terminalBuffer).trim()
  if (term) {
    parts.push('', '## Recent terminal output', '```', truncate(term, 4000), '```')
  }

  if (input.recentEdits.length > 0) {
    const lines = input.recentEdits
      .slice(0, 8)
      .map((e) => `- ${e.rel} (${e.source}, ${new Date(e.timestamp).toLocaleTimeString()})`)
    parts.push('', '## Recently edited files', lines.join('\n'))
  }

  return parts.join('\n')
}

function buildRetrievalLayer(
  grepHits: GrepHit[],
  autoSnippets: { rel: string; language: string; content: string }[]
): string {
  if (grepHits.length === 0 && autoSnippets.length === 0) return ''

  const parts: string[] = [
    '# Retrieved context',
    'Relevant code found in the project (auto-retrieved for this message). Treat as ground truth.',
  ]

  if (grepHits.length > 0) {
    parts.push('', '## Search matches')
    for (const hit of grepHits.slice(0, 12)) {
      parts.push(`${hit.rel}:${hit.line}: ${hit.text}`)
    }
  }

  if (autoSnippets.length > 0) {
    parts.push('', '## Code snippets')
    for (const snip of autoSnippets) {
      parts.push(`### ${snip.rel}`, '```' + snip.language, snip.content, '```')
    }
  }

  return parts.join('\n')
}

function buildHistoryLayer(chatHistory: ChatMessage[]): string {
  const prior = chatHistory.filter((m) => m.role === 'user' && m.contextSnapshot?.length)
  const applied = chatHistory.filter((m) => m.role === 'assistant' && m.appliedFiles?.length)

  const parts: string[] = []

  if (applied.length > 0) {
    const recentApplied = applied.slice(-3)
    parts.push(
      '## Recent agent edits',
      ...recentApplied.map((m) => `- Applied: ${m.appliedFiles!.join(', ')}`)
    )
  }

  if (prior.length === 0 && parts.length === 0) return ''
  if (prior.length > 0) {
    const recent = prior.slice(-3)
    const sections = recent.map((msg) => {
      const labels = msg.contextSnapshot!.map((c) => c.label).join(', ')
      const snippets = msg.contextSnapshot!
        .slice(0, 4)
        .map((c) => `- **${c.label}** (${c.type}): ${truncate(c.content.replace(/\s+/g, ' '), 400)}`)
        .join('\n')
      return `### Earlier @context\nUser asked with: ${labels}\n${snippets}`
    })
    parts.push('## Prior @context', ...sections)
  }

  return `# Session memory\n${parts.join('\n\n')}`
}

export interface AssembleOptions {
  phase?: AgentPhase
  approvedPlan?: string
  fixErrors?: string
}

function buildPlanLayer(approvedPlan?: string): string {
  if (!approvedPlan?.trim()) return ''
  return `# Approved plan\nExecute this plan exactly:\n\n${approvedPlan}`
}

function buildFixLayer(fixErrors?: string): string {
  if (!fixErrors?.trim()) return ''
  return `# Verification errors (fix these)\n\`\`\`\n${fixErrors}\n\`\`\``
}

function packLayers(layers: { layer: ContextLayer; text: string }[], mode: ChatMode): string {
  const budget = BUDGET[mode]
  let used = 0
  const included: string[] = []

  for (const { layer, text } of layers) {
    if (!text.trim()) continue
    const cap = Math.min(LAYER_CAPS[layer], budget - used)
    if (cap <= 200) break

    const chunk = truncate(text, cap)
    included.push(chunk)
    used += chunk.length
    if (used >= budget) break
  }

  return included.join('\n\n---\n\n')
}

export function assembleContextPrompt(input: ContextAssemblyInput, options: AssembleOptions = {}): string {
  const phase = options.phase ?? 'default'
  const attachedBlock = formatContextForPrompt(input.attachedItems)

  const layers: { layer: ContextLayer; text: string }[] = [
    { layer: 'identity', text: buildIdentityLayer(input.chatMode, input.rootPath, phase) },
    { layer: 'rules', text: formatRulesForPrompt(input.rules) },
    { layer: 'skills', text: buildSkillsLayer(input.skills) },
    { layer: 'research', text: input.researchBlock },
    { layer: 'workspace', text: buildWorkspaceLayer(input.rootPath, input.fileTree, input.git) },
    { layer: 'session', text: buildSessionLayer(input) },
    { layer: 'retrieval', text: buildRetrievalLayer(input.grepHits, input.autoSnippets) },
    { layer: 'attached', text: attachedBlock },
    { layer: 'history', text: buildHistoryLayer(input.chatHistory) },
  ]

  const planBlock = buildPlanLayer(options.approvedPlan)
  const fixBlock = buildFixLayer(options.fixErrors)
  const extras = [planBlock, fixBlock].filter(Boolean).join('\n\n')

  const packed = packLayers(layers, input.chatMode)
  return extras ? `${packed}\n\n---\n\n${extras}` : packed
}

export { extractSearchTerms, pickGrepQuery }

export async function gatherContextInputs(
  base: Omit<
    ContextAssemblyInput,
    'rules' | 'skills' | 'git' | 'grepHits' | 'autoSnippets' | 'researchBlock'
  >
): Promise<ContextAssemblyInput> {
  let allRules: HarnessRule[] = []
  let allSkills: HarnessSkill[] = []
  let rules: HarnessRule[] = []
  let skills: HarnessSkill[] = []
  let git: GitContext | null = null
  let grepHits: GrepHit[] = []
  let autoSnippets: { rel: string; language: string; content: string }[] = []
  let researchBlock = ''

  const activeRel =
    base.rootPath && base.activeTabPath
      ? relPath(base.rootPath, base.activeTabPath)
      : null
  const attachedPaths = base.attachedItems
    .map((i) => i.path)
    .filter(Boolean) as string[]

  if (base.rootPath) {
    const [harnessRes, gitRes, research] = await Promise.all([
      window.ontology.loadHarness(base.rootPath, activeRel ?? undefined),
      window.ontology.gitContext(base.rootPath),
      runDeepResearch(base.rootPath, base.userQuery, activeRel, base.fileTree),
    ])

    researchBlock = formatResearchLayer(research)
    grepHits = research.grepHits
    autoSnippets = [
      ...research.autoSnippets,
      ...research.mentionedFiles.filter((m) => !research.autoSnippets.some((s) => s.rel === m.rel)),
    ]

    if (harnessRes.success) {
      allRules = harnessRes.rules
      allSkills = harnessRes.skills
      rules = selectRulesForContext(allRules, {
        activeRel,
        attachedPaths,
        userQuery: base.userQuery,
      })
      if (base.chatMode === 'agent') {
        skills = selectSkillsForContext(allSkills, base.userQuery, 2)
      }
    }

    if (gitRes.success && gitRes.isRepo) {
      git = {
        branch: gitRes.branch,
        status: gitRes.status,
        diffStat: gitRes.diffStat,
        diff: gitRes.diff,
        untracked: gitRes.untracked,
      }
    }

    const hasManualCodebase = base.attachedItems.some((i) => i.type === 'codebase')
    if (hasManualCodebase && base.rootPath) {
      const terms = extractSearchTerms(base.userQuery)
      const grepQuery = pickGrepQuery(terms)
      if (grepQuery) {
        const grepRes = await window.ontology.grep(base.rootPath, grepQuery, 20)
        if (grepRes.success) {
          grepHits = [...grepHits, ...grepRes.matches.filter((m) => !grepHits.some((h) => h.rel === m.rel && h.line === m.line))]
          const extra = await loadAutoSnippets(base.rootPath, grepRes.matches, 3, 1800)
          autoSnippets = [...autoSnippets, ...extra.filter((e) => !autoSnippets.some((s) => s.rel === e.rel))]
        }
      }
    }
  }

  return { ...base, rules, skills, git, grepHits, autoSnippets, researchBlock }
}

export async function createGitContextItem(rootPath: string): Promise<ContextItem | null> {
  const gitRes = await window.ontology.gitContext(rootPath)
  if (!gitRes.success || !gitRes.isRepo) {
    return {
      id: crypto.randomUUID(),
      type: 'git',
      label: 'Git',
      content: 'Not a git repository.',
    }
  }

  const parts = [
    `Branch: ${gitRes.branch}`,
    '',
    'Status:',
    gitRes.status || '(clean)',
  ]
  if (gitRes.diffStat) parts.push('', 'Changed:', gitRes.diffStat)
  if (gitRes.diff) parts.push('', 'Diff:', '```diff', gitRes.diff, '```')

  return {
    id: crypto.randomUUID(),
    type: 'git',
    label: 'Git',
    content: parts.join('\n'),
  }
}

export async function createRulesContextItem(rootPath: string): Promise<ContextItem | null> {
  const res = await window.ontology.loadHarness(rootPath)
  if (!res.success || res.rules.length === 0) {
    return {
      id: crypto.randomUUID(),
      type: 'rules',
      label: 'Rules',
      content:
        'No project rules found. Add `.ontology/rules/*.mdc`, `AGENTS.md`, or `.ontologyrules`.',
    }
  }

  const content = formatRulesForPrompt(res.rules)
  return {
    id: crypto.randomUUID(),
    type: 'rules',
    label: 'Rules',
    content,
  }
}
