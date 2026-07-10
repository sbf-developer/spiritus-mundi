/** Agent turn orchestration — apply, verify, run commands. */

import { useIDEStore } from '../store/ideStore'
import {
  parseAgentCommands,
  applyAgentCommands,
  applyAgentFilesystem,
  collectAgentFileEdits,
} from './agentService'
import { verifyAppliedFiles } from './verifyService'

export interface AgentTurnResult {
  fullContent: string
  appliedFiles: string[]
  summaryParts: string[]
  errors: string[]
  verifyFailed: boolean
  verifyDetail: string
  fsChanged: boolean
}

export async function finishAgentTurn(
  rootPath: string,
  fullContent: string,
  options: { skipApply?: boolean } = {}
): Promise<AgentTurnResult> {
  const summaryParts: string[] = []
  const errors: string[] = []
  let appliedFiles: string[] = []
  let verifyFailed = false
  let verifyDetail = ''
  let fsChanged = false

  if (!options.skipApply) {
    const fsResult = await applyAgentFilesystem(rootPath, fullContent)
    summaryParts.push(...fsResult.summaryParts)
    errors.push(...fsResult.errors)
    appliedFiles = fsResult.appliedFiles
    fsChanged = fsResult.changed

    if (appliedFiles.length > 0) {
      const verify = await verifyAppliedFiles(rootPath, appliedFiles)
      summaryParts.push(
        ...verify.lines.map((l) => (l.startsWith('✓') ? `✓ **Check:** ${l.slice(2).trim()}` : l))
      )
      if (!verify.ok) {
        verifyFailed = true
        verifyDetail = verify.lines.filter((l) => !l.startsWith('✓')).join('\n')
        errors.push('Automated verification failed — review errors above')
      }
    }

    const commands = parseAgentCommands(fullContent)
    if (commands.length > 0) {
      useIDEStore.setState({ showTerminal: true })
      await new Promise((r) => setTimeout(r, 200))
      const { results, errors: cmdErrors } = await applyAgentCommands(rootPath, commands)
      const ok = results.filter((r) => r.success).map((r) => r.command)
      if (ok.length) {
        summaryParts.push(
          `✓ **Ran ${ok.length} command${ok.length > 1 ? 's' : ''}:** ${ok.map((c) => `\`${c}\``).join(', ')}`
        )
      }
      errors.push(...cmdErrors)
    }

    if (appliedFiles.length === 0 && collectAgentFileEdits(fullContent).length === 0) {
      const claimedWork = /what was created|I've (created|set up|written|built)|files (created|written)/i.test(
        fullContent
      )
      if (claimedWork) {
        errors.push(
          'No files were written — use <file path="name.py">…</file> tags (or markdown blocks with filenames).'
        )
      }
    }
  }

  let output = fullContent
  if (summaryParts.length > 0 || errors.length > 0) {
    const errLine = errors.length ? `\n⚠ ${errors.join('; ')}` : ''
    output = fullContent + `\n\n---\n${summaryParts.join('\n')}${errLine}`
  }

  return {
    fullContent: output,
    appliedFiles,
    summaryParts,
    errors,
    verifyFailed,
    verifyDetail,
    fsChanged,
  }
}
