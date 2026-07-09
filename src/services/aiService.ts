import type { AISettings } from '../vite-env.d'
import type { ChatMessage } from '../store/ideStore'

const PROVIDER_DEFAULTS: Record<AISettings['provider'], { baseUrl: string; model: string }> = {
  ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  custom: { baseUrl: '', model: '' },
}

export function getProviderDefaults(provider: AISettings['provider']) {
  return PROVIDER_DEFAULTS[provider]
}

function buildHeaders(settings: AISettings): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (settings.apiKey) {
    headers['Authorization'] = `Bearer ${settings.apiKey}`
  }
  return headers
}

function getChatEndpoint(settings: AISettings): string {
  const base = settings.baseUrl.replace(/\/$/, '')
  if (settings.provider === 'ollama') {
    return `${base}/api/chat`
  }
  return `${base}/chat/completions`
}

function buildBody(
  settings: AISettings,
  messages: ChatMessage[],
  systemContext?: string
): unknown {
  const msgs = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  if (systemContext) {
    msgs.unshift({ role: 'system', content: systemContext })
  }

  if (settings.provider === 'ollama') {
    return {
      model: settings.model,
      messages: msgs,
      stream: true,
      options: {
        temperature: settings.temperature,
        num_predict: settings.maxTokens,
      },
    }
  }

  return {
    model: settings.model,
    messages: msgs,
    stream: true,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
  }
}

async function* parseSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        const content =
          json.choices?.[0]?.delta?.content ??
          json.message?.content ??
          ''
        if (content) yield content
      } catch {
        // skip malformed chunks
      }
    }
  }
}

async function* parseOllamaStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const json = JSON.parse(line)
        if (json.message?.content) yield json.message.content
        if (json.done) return
      } catch {
        // skip
      }
    }
  }
}

export async function* streamChat(
  settings: AISettings,
  messages: ChatMessage[],
  systemContext?: string
): AsyncGenerator<string, void, unknown> {
  const endpoint = getChatEndpoint(settings)
  const body = buildBody(settings, messages, systemContext)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildHeaders(settings),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error')
    throw new Error(`API error ${response.status}: ${errText}`)
  }

  if (!response.body) throw new Error('No response body')

  const reader = response.body.getReader()
  const parser = settings.provider === 'ollama' ? parseOllamaStream : parseSSEStream

  for await (const chunk of parser(reader)) {
    yield chunk
  }
}

export async function testConnection(settings: AISettings): Promise<{ ok: boolean; message: string }> {
  try {
    const base = settings.baseUrl.replace(/\/$/, '')

    if (settings.provider === 'ollama') {
      const res = await fetch(`${base}/api/tags`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const models = data.models?.map((m: { name: string }) => m.name) || []
      return { ok: true, message: `Connected. Models: ${models.slice(0, 5).join(', ') || 'none found'}` }
    }

    const res = await fetch(`${base}/models`, {
      headers: buildHeaders(settings),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const models = data.data?.map((m: { id: string }) => m.id) || []
    return { ok: true, message: `Connected. Models: ${models.slice(0, 5).join(', ') || settings.model}` }
  } catch (err) {
    return { ok: false, message: String(err) }
  }
}

export function buildCodeContext(
  activeFile: { path: string; content: string; language: string } | null,
  rootPath: string | null
): string {
  if (!activeFile) return 'No file is currently open.'

  const relativePath = rootPath
    ? activeFile.path.replace(rootPath, '').replace(/^[/\\]/, '')
    : activeFile.path

  return `The user is working in a project${rootPath ? ` at ${rootPath}` : ''}.
Currently open file: ${relativePath} (${activeFile.language})

\`\`\`${activeFile.language}
${activeFile.content}
\`\`\`

Help with coding tasks related to this file and project. Be concise and provide actionable code when asked.`
}
