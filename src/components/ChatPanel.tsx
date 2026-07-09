import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Trash2, Copy, Check, FileCheck } from 'lucide-react'
import { useIDEStore, detectLanguage } from '../store/ideStore'
import { streamChat } from '../services/aiService'
import {
  buildAgentSystemPrompt,
  buildChatSystemPrompt,
  parseAgentEdits,
  applyAgentEdits,
  openEditedFilesInEditor,
} from '../services/agentService'
import { PanelHeader, IconButton } from './PanelHeader'
import { MarkdownMessage } from './MarkdownMessage'
import { ChatModeSelector } from './ChatModeSelector'

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
    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: text,
      timestamp: Date.now(),
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
      const fileCtx = activeFile
        ? { path: activeFile.path, content: activeFile.content, language: activeFile.language }
        : null

      const systemContext =
        chatMode === 'agent'
          ? buildAgentSystemPrompt(rootPath, fileTree, fileCtx)
          : buildChatSystemPrompt(fileCtx, rootPath)

      const allMessages = [...chatMessages, userMsg]
      let fullContent = ''

      for await (const chunk of streamChat(settings, allMessages, systemContext)) {
        fullContent += chunk
        updateLastAssistantMessage(fullContent)
      }

      if (chatMode === 'agent' && rootPath) {
        const edits = parseAgentEdits(fullContent)
        if (edits.length > 0) {
          const { applied, errors } = await applyAgentEdits(rootPath, edits)
          if (applied.length > 0) {
            openEditedFilesInEditor(rootPath, edits.filter((e) => applied.includes(e.path)))
            const tree = await window.spiritus.refreshTree(rootPath)
            setFileTree(tree)
            setMessageAppliedFiles(assistantIdRef.current, applied)

            const summary =
              `\n\n---\n✓ **Applied ${applied.length} file${applied.length > 1 ? 's' : ''}:** ${applied.map((f) => `\`${f}\``).join(', ')}` +
              (errors.length ? `\n⚠ ${errors.join('; ')}` : '')
            updateLastAssistantMessage(fullContent + summary)
          }
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
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const placeholder =
    chatMode === 'agent'
      ? 'Build or edit something in your project...'
      : 'Ask a question...'

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
                content={msg.content}
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

      <div className="p-3 border-t border-border-subtle shrink-0 space-y-2">
        <ChatModeSelector />
        <div className="relative bg-surface-overlay border border-border-default rounded-lg focus-within:border-text-muted transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            disabled={isStreaming}
            className="w-full bg-transparent px-3 pt-2.5 pb-9 text-[12px] text-text-primary placeholder:text-text-muted resize-none focus:outline-none disabled:opacity-50"
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-2">
            <span className="text-[10px] text-text-muted hidden sm:inline">↵ send</span>
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="w-7 h-7 flex items-center justify-center rounded-md disabled:opacity-25 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
              style={{
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <ArrowUp size={14} strokeWidth={2} />
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
