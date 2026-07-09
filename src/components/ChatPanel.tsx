import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Trash2, Copy, Check, FileCheck } from 'lucide-react'
import { useIDEStore, detectLanguage } from '../store/ideStore'
import { streamChat } from '../services/aiService'
import {
  buildAgentSystemPrompt,
  buildChatSystemPrompt,
  parseAgentEdits,
  parseAgentCommands,
  applyAgentEdits,
  applyAgentCommands,
  openEditedFilesInEditor,
  stripFileTags,
  stripRunTags,
} from '../services/agentService'
import { PanelHeader, IconButton } from './PanelHeader'
import { MarkdownMessage } from './MarkdownMessage'
import { ChatModeSelector } from './ChatModeSelector'
import { ChatContextBar, formatUserMessageWithContext } from './ChatContextBar'
import { formatContextForPrompt, parsePastedCodeContext } from '../services/contextService'

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
    openTab,
    setFileTree,
    chatContextItems,
    addContextItem,
    clearContextItems,
  } = useIDEStore()

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const assistantIdRef = useRef<string>('')

  const activeTab = tabs.find((t) => t.path === activeTabPath)
  const activeFile = activeTab?.viewMode !== 'image' ? activeTab : null

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

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
    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: displayText,
      timestamp: Date.now(),
    }
    addChatMessage(userMsg)
    clearContextItems()

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
      const fileCtx = activeFile
        ? { path: activeFile.path, content: activeFile.content, language: activeFile.language }
        : null

      const contextBlock = formatContextForPrompt(contextSnapshot)
      const baseSystem =
        chatMode === 'agent'
          ? buildAgentSystemPrompt(rootPath, fileTree, fileCtx)
          : buildChatSystemPrompt(fileCtx, rootPath, fileTree)

      const systemContext = contextBlock ? `${baseSystem}\n\n${contextBlock}` : baseSystem

      const allMessages = [...chatMessages, { ...userMsg, content: text }]
      let fullContent = ''

      for await (const chunk of streamChat(settings, allMessages, systemContext)) {
        fullContent += chunk
        updateLastAssistantMessage(fullContent)
      }

      if (chatMode === 'agent' && rootPath) {
        const edits = parseAgentEdits(fullContent)
        const commands = parseAgentCommands(fullContent)
        const summaryParts: string[] = []

        if (edits.length > 0) {
          const { applied, errors } = await applyAgentEdits(rootPath, edits)
          if (applied.length > 0) {
            openEditedFilesInEditor(rootPath, edits.filter((e) => applied.includes(e.path)))
            const tree = await window.spiritus.refreshTree(rootPath)
            setFileTree(tree)
            setMessageAppliedFiles(assistantIdRef.current, applied)
            summaryParts.push(
              `✓ **Applied ${applied.length} file${applied.length > 1 ? 's' : ''}:** ${applied.map((f) => `\`${f}\``).join(', ')}`
            )
          }
          if (errors.length) summaryParts.push(`⚠ ${errors.join('; ')}`)
        }

        if (commands.length > 0) {
          useIDEStore.setState({ showTerminal: true })
          await new Promise((r) => setTimeout(r, 200))
          const { results, errors } = await applyAgentCommands(rootPath, commands)
          const ok = results.filter((r) => r.success).map((r) => r.command)
          if (ok.length) {
            summaryParts.push(
              `✓ **Ran ${ok.length} command${ok.length > 1 ? 's' : ''}:** ${ok.map((c) => `\`${c}\``).join(', ')}`
            )
          }
          if (errors.length) summaryParts.push(`⚠ ${errors.join('; ')}`)
        }

        if (summaryParts.length > 0) {
          updateLastAssistantMessage(fullContent + `\n\n---\n${summaryParts.join('\n')}`)
        }
      }
    } catch (err) {
      updateLastAssistantMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsStreaming(false)
      inputRef.current?.focus()
    }
  }

  const handleApplyCode = async (code: string, language: string) => {
    if (!rootPath) return
    const extMap: Record<string, string> = {
      html: 'html', css: 'css', javascript: 'js', typescript: 'ts', python: 'py', json: 'json',
    }
    const ext = extMap[language] || 'txt'
    const name = prompt('File name:', `untitled.${ext}`)
    if (!name) return
    const result = await window.spiritus.createFile(rootPath, name)
    if (result.success && result.path) {
      await window.spiritus.writeFile(result.path, code)
      openTab({
        path: result.path,
        name,
        content: code,
        isDirty: false,
        language: detectLanguage(name),
        viewMode: 'code',
      })
      const tree = await window.spiritus.refreshTree(rootPath)
      setFileTree(tree)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      ? 'Build or edit… type @ for terminal, files, codebase'
      : 'Ask a question… type @ to attach context'

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title={chatMode === 'agent' ? 'Agent' : 'Chat'}
        actions={
          chatMessages.length > 0 ? (
            <IconButton
              icon={<Trash2 size={13} strokeWidth={1.5} />}
              onClick={clearChat}
              title="Clear"
            />
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-[12px] text-text-secondary mb-1">
              {chatMode === 'agent' ? 'Agent edits your project files' : 'Ask about your code'}
            </p>
            <p className="text-[11px] text-text-muted">
              {chatMode === 'agent'
                ? 'Try: "build a snake game and save it to index.html"'
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
              <MarkdownMessage
                content={
                  msg.role === 'assistant' && chatMode === 'agent'
                    ? stripRunTags(stripFileTags(msg.content))
                    : msg.content
                }
                isUser={msg.role === 'user'}
                onApplyCode={handleApplyCode}
                showApply={chatMode === 'chat'}
              />
            ) : (
              isStreaming && msg.role === 'assistant' && <TypingIndicator />
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

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
            className="w-full bg-transparent px-3 pt-1 pb-10 text-[12px] leading-relaxed text-text-primary placeholder:text-text-muted resize-none focus:outline-none disabled:opacity-50"
          />
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between pointer-events-none">
            <div className="pointer-events-auto">
              <ChatModeSelector inline />
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

function TypingIndicator() {
  return (
    <span className="inline-flex gap-1 items-center py-0.5">
      <span className="typing-dot w-1 h-1 rounded-full bg-text-muted" />
      <span className="typing-dot w-1 h-1 rounded-full bg-text-muted" />
      <span className="typing-dot w-1 h-1 rounded-full bg-text-muted" />
    </span>
  )
}
