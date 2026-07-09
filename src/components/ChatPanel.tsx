import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Trash2, Copy, Check } from 'lucide-react'
import { useIDEStore } from '../store/ideStore'
import { streamChat, buildCodeContext } from '../services/aiService'
import { PanelHeader, IconButton } from './PanelHeader'

export function ChatPanel() {
  const {
    chatMessages,
    addChatMessage,
    updateLastAssistantMessage,
    setIsStreaming,
    isStreaming,
    clearChat,
    settings,
    tabs,
    activeTabPath,
    rootPath,
  } = useIDEStore()

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeTab = tabs.find((t) => t.path === activeTabPath)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isStreaming) return

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
    addChatMessage(assistantMsg)
    setIsStreaming(true)

    try {
      const context = buildCodeContext(
        activeTab
          ? { path: activeTab.path, content: activeTab.content, language: activeTab.language }
          : null,
        rootPath
      )

      const allMessages = [...chatMessages, userMsg]
      let fullContent = ''

      for await (const chunk of streamChat(settings, allMessages, context)) {
        fullContent += chunk
        updateLastAssistantMessage(fullContent)
      }
    } catch (err) {
      updateLastAssistantMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsStreaming(false)
      inputRef.current?.focus()
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

  const modelLabel =
    settings.provider === 'ollama'
      ? `Ollama · ${settings.model}`
      : `${settings.provider} · ${settings.model}`

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title="Chat"
        actions={
          chatMessages.length > 0 ? (
            <IconButton
              icon={<Trash2 size={13} strokeWidth={1.5} />}
              onClick={clearChat}
              title="Clear chat"
            />
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-[12px] text-text-secondary mb-1">Ask about your code</p>
            <p className="text-[11px] text-text-muted">{modelLabel}</p>
          </div>
        )}

        {chatMessages.map((msg) => (
          <div key={msg.id} className="animate-fade-in group">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-text-muted">
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </span>
              {msg.content && (
                <button
                  onClick={() => handleCopy(msg.id, msg.content)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-text-secondary transition-opacity"
                >
                  {copiedId === msg.id ? <Check size={10} /> : <Copy size={10} strokeWidth={1.5} />}
                </button>
              )}
            </div>
            <div
              className={`text-[12px] leading-[1.6] whitespace-pre-wrap break-words ${
                msg.role === 'user' ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {msg.content || (isStreaming && msg.role === 'assistant' ? <TypingIndicator /> : '')}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-border-subtle shrink-0">
        <div className="relative bg-surface-overlay border border-border-default rounded-lg focus-within:border-text-muted transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
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
