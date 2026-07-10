/**
 * Chat panel — user ↔ LLM interaction and agent pipeline entry point.
 *
 * Flow for each message:
 *   handleSend → runStream → streamChat (aiService)
 *   → finishAgentTurn (agent mode) → refresh explorer
 *
 * Sub-components: ChatContextBar (@ attachments), PlanModeToggle, AgentMessageRenderer
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUp, Trash2, Copy, Check, FileCheck } from 'lucide-react'
import { useIDEStore, detectLanguage } from '../store/ideStore'
import { streamChat } from '../services/aiService'
import { assembleContextPrompt, gatherContextInputs, type AgentPhase } from '../services/contextOntology'
import { compactMessagesForApi } from '../services/chatHistoryService'
import { finishAgentTurn } from '../services/agentRunnerService'
import { PanelHeader, IconButton } from './PanelHeader'
import { MarkdownMessage } from './MarkdownMessage'
import { AgentMessageRenderer } from './AgentMessageRenderer'
import { ChatModeSelector } from './ChatModeSelector'
import { PlanModeToggle, PendingPlanBar } from './PlanModeToggle'
import { ChatContextBar, formatUserMessageWithContext } from './ChatContextBar'
import { parsePastedCodeContext } from '../services/contextService'

export function ChatPanel() {
  const {
    chatMessages,
    addChatMessage,
    updateLastAssistantMessage,
    setMessageAppliedFiles,
    setIsStreaming,
    isStreaming,
    clearChat,
    settings,
    tabs,
    activeTabPath,
    rootPath,
    fileTree,
    chatMode,
    agentPlanMode,
    pendingPlan,
    setPendingPlan,
    openTab,
    setFileTree,
    chatContextItems,
    addContextItem,
    clearContextItems,
    terminalBuffer,
    editorSelection,
    recentEdits,
  } = useIDEStore()

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const assistantIdRef = useRef<string>('')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ─── Core: stream one user message to the model (+ agent apply) ─

  const runStream = useCallback(
    async (
      userText: string,
      displayText: string,
      phase: AgentPhase,
      options: { approvedPlan?: string; fixErrors?: string; skipApply?: boolean; contextSnapshot?: typeof chatContextItems } = {}
    ) => {
      const contextSnapshot = options.contextSnapshot ?? []

      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: displayText,
        timestamp: Date.now(),
        contextSnapshot: contextSnapshot.length > 0 ? contextSnapshot : undefined,
      }
      addChatMessage(userMsg)

      const assistantMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now(),
      }
      assistantIdRef.current = assistantMsg.id
      addChatMessage(assistantMsg)
      setIsStreaming(true)

      try {
        const contextInput = await gatherContextInputs({
          chatMode,
          rootPath,
          fileTree,
          tabs,
          activeTabPath,
          terminalBuffer,
          editorSelection,
          recentEdits,
          userQuery: userText,
          attachedItems: contextSnapshot,
          chatHistory: chatMessages,
        })

        const systemContext = assembleContextPrompt(contextInput, {
          phase,
          approvedPlan: options.approvedPlan,
          fixErrors: options.fixErrors,
        })

        const apiMessages = compactMessagesForApi([...chatMessages, { ...userMsg, content: userText }])
        let fullContent = ''

        for await (const chunk of streamChat(settings, apiMessages, systemContext, chatMode)) {
          fullContent += chunk
          updateLastAssistantMessage(fullContent)
        }

        if (chatMode === 'agent' && rootPath) {
          if (phase === 'plan') {
            setPendingPlan({ userRequest: userText, plan: fullContent })
            return fullContent
          }

          const turn = await finishAgentTurn(rootPath, fullContent, { skipApply: options.skipApply })
          updateLastAssistantMessage(turn.fullContent)

          if (turn.appliedFiles.length > 0) {
            setMessageAppliedFiles(assistantIdRef.current, turn.appliedFiles)
          }

          if (turn.fsChanged) {
            const tree = await window.ontology.refreshTree(rootPath)
            setFileTree(tree)
          }

          if (turn.verifyFailed && phase !== 'fix') {
            const fixDisplay = `[Auto-fix after verification failure]\n\nOriginal task: ${userText}`
            await runStream(userText, fixDisplay, 'fix', {
              fixErrors: turn.verifyDetail,
              contextSnapshot,
            })
          }

          return turn.fullContent
        }

        return fullContent
      } catch (err) {
        updateLastAssistantMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
        return null
      } finally {
        setIsStreaming(false)
        inputRef.current?.focus()
      }
    },
    [
      chatMode,
      rootPath,
      fileTree,
      tabs,
      activeTabPath,
      terminalBuffer,
      editorSelection,
      recentEdits,
      chatMessages,
      settings,
      addChatMessage,
      updateLastAssistantMessage,
      setMessageAppliedFiles,
      setFileTree,
      setIsStreaming,
      setPendingPlan,
    ]
  )

  // ─── Send button / Enter key ───────────────────────────────────

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    if (chatMode === 'agent' && !rootPath) {
      addChatMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      })
      addChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Open a project folder first (Ctrl+O) — Agent mode needs a workspace to edit files.',
        timestamp: Date.now(),
      })
      setInput('')
      return
    }

    setInput('')
    const contextSnapshot = [...chatContextItems]
    const displayText = formatUserMessageWithContext(text, contextSnapshot)
    clearContextItems()

    const phase: AgentPhase =
      chatMode === 'agent' && agentPlanMode ? 'plan' : 'default'

    await runStream(text, displayText, phase, { contextSnapshot })
  }

  const handleExecutePlan = useCallback(async () => {
    if (!pendingPlan || isStreaming) return
    const { userRequest, plan } = pendingPlan
    setPendingPlan(null)

    const displayText = `[Approved plan]\n\n${userRequest}`
    await runStream(userRequest, displayText, 'execute', { approvedPlan: plan })
  }, [pendingPlan, isStreaming, setPendingPlan, runStream])

  useEffect(() => {
    const onExecute = () => handleExecutePlan()
    window.addEventListener('ontology:execute-plan', onExecute)
    return () => window.removeEventListener('ontology:execute-plan', onExecute)
  }, [handleExecutePlan])

  // ─── Manual "Apply" from a code fence in chat ──────────────────

  const handleApplyCode = async (code: string, language: string) => {
    if (!rootPath) return
    const extMap: Record<string, string> = {
      html: 'html', css: 'css', javascript: 'js', typescript: 'ts', python: 'py', json: 'json',
    }
    const ext = extMap[language] || 'txt'
    const name = prompt('File name:', `untitled.${ext}`)
    if (!name) return
    const result = await window.ontology.createFile(rootPath, name)
    if (result.success && result.path) {
      await window.ontology.writeFile(result.path, code)
      openTab({
        path: result.path,
        name,
        content: code,
        isDirty: false,
        language: detectLanguage(name),
        viewMode: 'code',
      })
      const tree = await window.ontology.refreshTree(rootPath)
      setFileTree(tree)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const pos = e.currentTarget.selectionStart ?? 0
      if (input.slice(0, pos).match(/@([\w./-]*)$/)) return
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text')
    const codeCtx = parsePastedCodeContext(pasted, rootPath)
    if (codeCtx && pasted.split('\n').length >= 3) {
      e.preventDefault()
      addContextItem(codeCtx)
    }
  }

  const placeholder =
    chatMode === 'agent'
      ? agentPlanMode
        ? 'Describe what to build — agent will plan first...'
        : 'Build or edit something in your project...'
      : 'Ask a question...'

  // ─── Render: message list + input + mode controls ──────────────

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title={chatMode === 'agent' ? 'Agent' : 'Chat'}
        actions={
          chatMessages.length > 0 ? (
            <IconButton
              icon={<Trash2 size={13} strokeWidth={1.5} />}
              onClick={() => {
                clearChat()
                setPendingPlan(null)
              }}
              title="Clear"
            />
          ) : undefined
        }
      />

      {/* Message list — AgentMessageRenderer for agent, Markdown for chat/user */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-[12px] text-text-secondary mb-1">
              {chatMode === 'agent' ? 'Agent edits your project files' : 'Ask about your code'}
            </p>
            <p className="text-[11px] text-text-muted">
              {chatMode === 'agent'
                ? agentPlanMode
                  ? 'Plan mode — review before files are written'
                  : 'Try: "build a snake game and save it to index.html"'
                : `${settings.provider} · ${settings.model}`}
            </p>
          </div>
        )}

        {chatMessages.map((msg) => (
          <div key={msg.id} className="animate-fade-in group">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-text-muted">
                {msg.role === 'user' ? 'You' : chatMode === 'agent' ? 'Agent' : 'Assistant'}
              </span>
              {msg.appliedFiles && msg.appliedFiles.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                  <FileCheck size={10} />
                  {msg.appliedFiles.length} file{msg.appliedFiles.length > 1 ? 's' : ''} applied
                </span>
              )}
              {msg.content && (
                <button
                  onClick={() => handleCopy(msg.id, msg.content)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-text-secondary transition-opacity"
                >
                  {copiedId === msg.id ? <Check size={10} /> : <Copy size={10} strokeWidth={1.5} />}
                </button>
              )}
            </div>
            {msg.content ? (
              msg.role === 'assistant' && chatMode === 'agent' ? (
                <AgentMessageRenderer
                  content={msg.content}
                  onApplyCode={handleApplyCode}
                  showApply={false}
                />
              ) : (
                <MarkdownMessage
                  content={msg.content}
                  isUser={msg.role === 'user'}
                  onApplyCode={handleApplyCode}
                  showApply={chatMode === 'chat'}
                />
              )
            ) : (
              isStreaming && msg.role === 'assistant' && <TypingIndicator />
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <PendingPlanBar />

      {/* Input area: @ context bar + textarea + mode toggles + send */}
      <div className="p-3 border-t border-border-subtle shrink-0">
        <div className="relative bg-surface-overlay border border-border-default rounded-xl focus-within:border-text-muted/40 transition-colors">
          <ChatContextBar input={input} setInput={setInput} inputRef={inputRef} userQuery={input} />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={3}
            disabled={isStreaming}
            className="w-full bg-transparent px-3 pt-3 pb-10 text-[12px] leading-relaxed text-text-primary placeholder:text-text-muted resize-none focus:outline-none disabled:opacity-50"
          />
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-0.5">
              <ChatModeSelector inline />
              <PlanModeToggle />
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              title="Send"
              className={`pointer-events-auto flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 ${
                input.trim() && !isStreaming
                  ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:opacity-85 active:scale-95'
                  : 'bg-surface-hover text-text-muted opacity-35 cursor-not-allowed'
              }`}
            >
              <ArrowUp size={15} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Animated dots while assistant message is streaming. */
function TypingIndicator() {
  return (
    <span className="inline-flex gap-1 items-center py-0.5">
      <span className="typing-dot w-1 h-1 rounded-full bg-text-muted" />
      <span className="typing-dot w-1 h-1 rounded-full bg-text-muted" />
      <span className="typing-dot w-1 h-1 rounded-full bg-text-muted" />
    </span>
  )
}
