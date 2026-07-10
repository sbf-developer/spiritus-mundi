/**
 * Preload bridge — the ONLY link between React and Electron main.
 *
 * contextBridge.exposeInMainWorld('ontology', api) defines window.ontology.
 * React code must never import electron directly; use window.ontology instead.
 *
 * Groups in `api`:
 *   - Filesystem (read/write/tree/watch/grep)
 *   - Harness (rules + skills from disk)
 *   - Terminal (interactive PTY + agent exec)
 *   - Settings + window controls
 *   - Event subscriptions (onFsChanged, onMenuOpenFolder, terminal streams)
 */
import { contextBridge, ipcRenderer } from 'electron'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface AISettings {
  provider: 'openai' | 'ollama' | 'deepseek' | 'custom'
  apiKey: string
  baseUrl: string
  model: string
}

export type Theme = 'dark' | 'light'

export interface AppSettings {
  ai: AISettings
  theme: Theme
}

const api = {
  platform: process.platform,

  // ─── Folder picker ─────────────────────────────────────────────
  openFolder: (): Promise<{ path: string; tree: FileEntry[] } | null> =>
    ipcRenderer.invoke('dialog:openFolder'),

  // ─── Filesystem ──────────────────────────────────────────────
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  readFileBase64: (path: string) => ipcRenderer.invoke('fs:readFileBase64', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
  createFile: (dir: string, name: string) => ipcRenderer.invoke('fs:createFile', dir, name),
  createFolder: (dir: string, name: string) => ipcRenderer.invoke('fs:createFolder', dir, name),
  readRules: (root: string) =>
    ipcRenderer.invoke('fs:readRules', root) as Promise<{
      success: boolean
      rules: { name: string; content: string }[]
    }>,

  loadHarness: (root: string, activeRel?: string) =>
    ipcRenderer.invoke('harness:load', root, activeRel) as Promise<{
      success: boolean
      rules: {
        id: string
        name: string
        content: string
        alwaysApply: boolean
        globs: string[]
        description: string
      }[]
      skills: { id: string; name: string; description: string; content: string }[]
    }>,

  deletePath: (path: string, rootPath?: string) => ipcRenderer.invoke('fs:delete', path, rootPath),
  renamePath: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath) as Promise<{ success: boolean; path?: string; error?: string }>,
  mkdirPath: (dirPath: string) =>
    ipcRenderer.invoke('fs:mkdir', dirPath) as Promise<{ success: boolean; path?: string; error?: string }>,
  refreshTree: (root: string) => ipcRenderer.invoke('fs:refreshTree', root),
  watchFolder: (root: string) => ipcRenderer.invoke('fs:watch', root),

  // ─── Codebase search + git ───────────────────────────────────
  grep: (root: string, query: string, maxResults?: number) =>
    ipcRenderer.invoke('fs:grep', root, query, maxResults) as Promise<{
      success: boolean
      matches: { path: string; rel: string; line: number; text: string }[]
    }>,

  gitContext: (root: string) =>
    ipcRenderer.invoke('git:context', root) as Promise<
      | { success: boolean; isRepo: false }
      | {
          success: boolean
          isRepo: true
          branch: string
          status: string
          diffStat: string
          diff: string
          untracked: string[]
        }
    >,

  // ─── Live tree updates (main → renderer) ─────────────────────
  onFsChanged: (cb: (tree: FileEntry[]) => void) => {
    const handler = (_: unknown, tree: FileEntry[]) => cb(tree)
    ipcRenderer.on('fs:changed', handler)
    return () => ipcRenderer.removeListener('fs:changed', handler)
  },

  onMenuOpenFolder: (cb: () => void) => {
    ipcRenderer.on('menu:open-folder', cb)
    return () => ipcRenderer.removeListener('menu:open-folder', cb)
  },

  // ─── Terminal (PTY + agent one-shot exec) ────────────────────
  terminal: {
    create: (cwd?: string) => ipcRenderer.invoke('terminal:create', cwd),
    input: (id: number, data: string) => ipcRenderer.send('terminal:input', id, data),
    resize: (id: number, cols: number, rows: number) =>
      ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id: number) => ipcRenderer.send('terminal:kill', id),
    onData: (cb: (id: number, data: string) => void) => {
      const handler = (_: unknown, id: number, data: string) => cb(id, data)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
    onExit: (cb: (id: number) => void) => {
      const handler = (_: unknown, id: number) => cb(id)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.removeListener('terminal:exit', handler)
    },
    exec: (cwd: string, command: string) =>
      ipcRenderer.invoke('terminal:exec', cwd, command) as Promise<{
        success: boolean
        stdout: string
        stderr: string
        exitCode: number
      }>,
    onInject: (cb: (text: string) => void) => {
      const handler = (_: unknown, text: string) => cb(text)
      ipcRenderer.on('terminal:inject', handler)
      return () => ipcRenderer.removeListener('terminal:inject', handler)
    },
  },

  // ─── Persisted app settings ────────────────────────────────────
  settings: {
    get: (): Promise<AppSettings | null> => ipcRenderer.invoke('settings:get'),
    save: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  },

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    setTheme: (theme: Theme) => ipcRenderer.send('window:setTheme', theme),
  },
}

contextBridge.exposeInMainWorld('ontology', api)

export type OntologyAPI = typeof api
