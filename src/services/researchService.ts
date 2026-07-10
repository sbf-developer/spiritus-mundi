/**
 * Pre-flight research — gather context before the model responds.
 *
 * Reads manifest files (package.json, etc.), grep for query terms,
 * and loads files mentioned in the user's message. Fed into contextOntology
 * as the "research" layer.
 */

import type { FileEntry } from '../vite-env.d'
import { extractSearchTerms, pickGrepQuery, type GrepHit } from './contextService'
import { loadAutoSnippets, relPath } from './contextService'

const MANIFEST_FILES = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'README.md',
  'readme.md',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
]

const PATH_IN_QUERY_RE = /\b([a-zA-Z0-9_./\\-]+\.(?:py|ts|tsx|js|jsx|json|md|html|css|rs|go|toml|yaml|yml))\b/g

// ─── Read key config files from project root ─────────────────────

export async function gatherProjectManifest(rootPath: string): Promise<string> {
  const sep = rootPath.includes('\\') ? '\\' : '/'
  const parts: string[] = []

  for (const name of MANIFEST_FILES) {
    const full = rootPath + sep + name.replace(/\//g, sep)
    const res = await window.ontology.readFile(full)
    if (!res.success || !res.content.trim()) continue

    const trimmed =
      res.content.length > 2000 ? res.content.slice(0, 2000) + '\n...(truncated)' : res.content
    parts.push(`### ${name}\n\`\`\`\n${trimmed}\n\`\`\``)
  }

  if (parts.length === 0) return ''
  return `# Project manifest\nKey config files in this workspace:\n\n${parts.join('\n\n')}`
}

function extractMentionedPaths(query: string): string[] {
  const found = new Set<string>()
  let m: RegExpExecArray | null
  const re = new RegExp(PATH_IN_QUERY_RE.source, PATH_IN_QUERY_RE.flags)
  while ((m = re.exec(query)) !== null) {
    found.add(m[1].replace(/\\/g, '/'))
  }
  return [...found].slice(0, 6)
}

export interface ResearchResult {
  manifest: string
  grepHits: GrepHit[]
  autoSnippets: { rel: string; language: string; content: string }[]
  mentionedFiles: { rel: string; language: string; content: string }[]
}

// ─── Main entry: parallel manifest + grep + mentioned files ────────

export async function runDeepResearch(
  rootPath: string,
  userQuery: string,
  activeRel: string | null,
  _fileTree: FileEntry[]
): Promise<ResearchResult> {
  const sep = rootPath.includes('\\') ? '\\' : '/'
  const manifest = await gatherProjectManifest(rootPath)

  const terms = extractSearchTerms(userQuery)
  const grepQuery = pickGrepQuery(terms)
  let grepHits: GrepHit[] = []

  if (grepQuery) {
    const grepRes = await window.ontology.grep(rootPath, grepQuery, 16)
    if (grepRes.success) grepHits = grepRes.matches
  }

  const autoSnippets = await loadAutoSnippets(rootPath, grepHits, 5, 1800)

  const mentionedFiles: { rel: string; language: string; content: string }[] = []
  const pathsToRead = new Set(extractMentionedPaths(userQuery))
  if (activeRel) pathsToRead.add(activeRel)

  for (const rel of pathsToRead) {
    if (mentionedFiles.length >= 4) break
    if (autoSnippets.some((s) => s.rel === rel)) continue

    const full = rootPath + sep + rel.replace(/\//g, sep)
    const res = await window.ontology.readFile(full)
    if (!res.success) continue

    const ext = rel.split('.').pop() ?? 'txt'
    mentionedFiles.push({
      rel,
      language: ext,
      content: res.content.length > 2500 ? res.content.slice(0, 2500) + '\n...(truncated)' : res.content,
    })
  }

  return { manifest, grepHits, autoSnippets, mentionedFiles }
}

// ─── Format research results as contextOntology "research" layer ─

export function formatResearchLayer(research: ResearchResult): string {
  const parts: string[] = [
    '# Pre-flight research',
    'The IDE gathered this context before your turn. Use it — do not re-guess project structure.',
  ]

  if (research.manifest) parts.push('', research.manifest)

  if (research.mentionedFiles.length > 0) {
    parts.push('', '## Files referenced in request')
    for (const f of research.mentionedFiles) {
      parts.push(`### ${f.rel}`, '```' + f.language, f.content, '```')
    }
  }

  if (research.grepHits.length > 0) {
    parts.push('', '## Code search')
    for (const h of research.grepHits.slice(0, 10)) {
      parts.push(`${h.rel}:${h.line}: ${h.text}`)
    }
  }

  return parts.join('\n')
}
