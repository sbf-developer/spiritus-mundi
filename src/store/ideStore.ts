import { create } from 'zustand'
import type { FileEntry, AISettings, Theme } from './vite-env.d'
import { applyTheme } from '../lib/theme'

export interface OpenTab {
  path: string
  name: string
  content: string
  isDirty: boolean
  language: string
  viewMode?: 'code' | 'image'
  previewDataUrl?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  appliedFiles?: string[]
}

export type ChatMode = 'chat' | 'agent'

interface IDEState {
  rootPath: string | null
  fileTree: FileEntry[]
  tabs: OpenTab[]
  activeTabPath: string | null
  sidebarWidth: number
  chatWidth: number
  terminalHeight: number
  showTerminal: boolean
  showChat: boolean
  showSidebar: boolean
  activePanel: 'explorer' | 'settings'
  theme: Theme
  settings: AISettings
  chatMessages: ChatMessage[]
  isStreaming: boolean
  chatMode: ChatMode

  setRootPath: (path: string | null) => void
  setFileTree: (tree: FileEntry[]) => void
  openTab: (tab: OpenTab) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  updateTabContent: (path: string, content: string) => void
  markTabSaved: (path: string) => void
  setSidebarWidth: (w: number) => void
  setChatWidth: (w: number) => void
  setTerminalHeight: (h: number) => void
  toggleTerminal: () => void
  toggleChat: () => void
  toggleSidebar: () => void
  setActivePanel: (panel: 'explorer' | 'settings') => void
  setTheme: (theme: Theme) => void
  setSettings: (s: AISettings) => void
  addChatMessage: (msg: ChatMessage) => void
  updateLastAssistantMessage: (content: string) => void
  setIsStreaming: (v: boolean) => void
  clearChat: () => void
  setChatMode: (mode: ChatMode) => void
  setMessageAppliedFiles: (id: string, files: string[]) => void
}

export const defaultSettings: AISettings = {
  provider: 'ollama',
  apiKey: '',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
  temperature: 0.7,
  maxTokens: 4096,
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'c',
    cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    html: 'html', css: 'css', scss: 'scss', json: 'json', md: 'markdown',
    yaml: 'yaml', yml: 'yaml', xml: 'xml', sql: 'sql', sh: 'shell',
    bash: 'shell', ps1: 'powershell', toml: 'toml', dockerfile: 'dockerfile',
  }
  return map[ext] || 'plaintext'
}

export { detectLanguage }

export const useIDEStore = create<IDEState>((set, get) => ({
  rootPath: null,
  fileTree: [],
  tabs: [],
  activeTabPath: null,
  sidebarWidth: 220,
  chatWidth: 340,
  terminalHeight: 200,
  showTerminal: true,
  showChat: true,
  showSidebar: true,
  activePanel: 'explorer',
  theme: 'dark',
  settings: defaultSettings,
  chatMessages: [],
  isStreaming: false,
  chatMode: 'agent',

  setRootPath: (path) => set({ rootPath: path }),
  setFileTree: (tree) => set({ fileTree: tree }),

  openTab: (tab) => {
    const { tabs } = get()
    const existing = tabs.find((t) => t.path === tab.path)
    if (existing) {
      set({ activeTabPath: tab.path })
      return
    }
    set({ tabs: [...tabs, tab], activeTabPath: tab.path })
  },

  closeTab: (path) => {
    const { tabs, activeTabPath } = get()
    const newTabs = tabs.filter((t) => t.path !== path)
    let newActive = activeTabPath
    if (activeTabPath === path) {
      const idx = tabs.findIndex((t) => t.path === path)
      newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.path ?? null
    }
    set({ tabs: newTabs, activeTabPath: newActive })
  },

  setActiveTab: (path) => set({ activeTabPath: path }),

  updateTabContent: (path, content) =>
    set({
      tabs: get().tabs.map((t) =>
        t.path === path ? { ...t, content, isDirty: true } : t
      ),
    }),

  markTabSaved: (path) =>
    set({
      tabs: get().tabs.map((t) =>
        t.path === path ? { ...t, isDirty: false } : t
      ),
    }),

  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(180, Math.min(480, w)) }),
  setChatWidth: (w) => set({ chatWidth: Math.max(280, Math.min(600, w)) }),
  setTerminalHeight: (h) => set({ terminalHeight: Math.max(120, Math.min(600, h)) }),
  toggleTerminal: () => set({ showTerminal: !get().showTerminal }),
  toggleChat: () => set({ showChat: !get().showChat }),
  toggleSidebar: () => set({ showSidebar: !get().showSidebar }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  setSettings: (s) => set({ settings: s }),

  addChatMessage: (msg) =>
    set({ chatMessages: [...get().chatMessages, msg] }),

  updateLastAssistantMessage: (content) =>
    set({
      chatMessages: get().chatMessages.map((m, i, arr) =>
        i === arr.length - 1 && m.role === 'assistant'
          ? { ...m, content }
          : m
      ),
    }),

  setIsStreaming: (v) => set({ isStreaming: v }),
  clearChat: () => set({ chatMessages: [] }),
  setChatMode: (mode) => set({ chatMode: mode }),
  setMessageAppliedFiles: (id, files) =>
    set({
      chatMessages: get().chatMessages.map((m) =>
        m.id === id ? { ...m, appliedFiles: files } : m
      ),
    }),
}))
