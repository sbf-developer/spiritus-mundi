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
  temperature: number
  maxTokens: number
}

export type Theme = 'dark' | 'light'

export interface AppSettings {
  ai: AISettings
  theme: Theme
}

const api = {
  platform: process.platform,

  openFolder: (): Promise<{ path: string; tree: FileEntry[] } | null> =>
    ipcRenderer.invoke('dialog:openFolder'),

  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  readFileBase64: (path: string) => ipcRenderer.invoke('fs:readFileBase64', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
  createFile: (dir: string, name: string) => ipcRenderer.invoke('fs:createFile', dir, name),
  createFolder: (dir: string, name: string) => ipcRenderer.invoke('fs:createFolder', dir, name),
  deletePath: (path: string) => ipcRenderer.invoke('fs:delete', path),
  renamePath: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath) as Promise<{ success: boolean; path?: string; error?: string }>,
  mkdirPath: (dirPath: string) =>
    ipcRenderer.invoke('fs:mkdir', dirPath) as Promise<{ success: boolean; path?: string; error?: string }>,
  refreshTree: (root: string) => ipcRenderer.invoke('fs:refreshTree', root),

  onFsChanged: (cb: (tree: FileEntry[]) => void) => {
    const handler = (_: unknown, tree: FileEntry[]) => cb(tree)
    ipcRenderer.on('fs:changed', handler)
    return () => ipcRenderer.removeListener('fs:changed', handler)
  },

  onMenuOpenFolder: (cb: () => void) => {
    ipcRenderer.on('menu:open-folder', cb)
    return () => ipcRenderer.removeListener('menu:open-folder', cb)
  },

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

contextBridge.exposeInMainWorld('spiritus', api)

export type SpiritusAPI = typeof api
