import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import * as pty from 'node-pty'

let mainWindow: BrowserWindow | null = null
const terminals = new Map<number, pty.IPty>()
let terminalCounter = 0

const isDev = !app.isPackaged

const isMac = process.platform === 'darwin'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#181818',
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173'
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-folder'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
  if (!isMac) mainWindow.setMenuBarVisibility(false)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  terminals.forEach((term) => term.kill())
  terminals.clear()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── File System ───────────────────────────────────────────────

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

async function readDirRecursive(dirPath: string, depth = 0): Promise<FileEntry[]> {
  if (depth > 6) return []
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const result: FileEntry[] = []

  const sorted = entries
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

  for (const entry of sorted) {
    const fullPath = path.join(dirPath, entry.name)
    const item: FileEntry = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
    }
    if (entry.isDirectory()) {
      try {
        item.children = await readDirRecursive(fullPath, depth + 1)
      } catch {
        item.children = []
      }
    }
    result.push(item)
  }
  return result
}

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const folderPath = result.filePaths[0]
  const tree = await readDirRecursive(folderPath)
  return { path: folderPath, tree }
})

ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, content }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('fs:readFileBase64', async (_e, filePath: string) => {
  try {
    const buffer = await fs.readFile(filePath)
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const mime: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      ico: 'image/x-icon',
      bmp: 'image/bmp',
    }
    const dataUrl = `data:${mime[ext] || 'application/octet-stream'};base64,${buffer.toString('base64')}`
    return { success: true, dataUrl }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('fs:createFile', async (_e, dirPath: string, fileName: string) => {
  const filePath = path.join(dirPath, fileName)
  try {
    await fs.writeFile(filePath, '', 'utf-8')
    return { success: true, path: filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('fs:createFolder', async (_e, dirPath: string, folderName: string) => {
  const folderPath = path.join(dirPath, folderName)
  try {
    await fs.mkdir(folderPath, { recursive: true })
    return { success: true, path: folderPath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  try {
    const stat = await fs.stat(targetPath)
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true })
    } else {
      await fs.unlink(targetPath)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('fs:refreshTree', async (_e, rootPath: string) => {
  const tree = await readDirRecursive(rootPath)
  return tree
})

ipcMain.handle('fs:watch', async (_e, rootPath: string) => {
  if (!fsSync.existsSync(rootPath)) return
  const watcher = fsSync.watch(rootPath, { recursive: true }, async () => {
    const tree = await readDirRecursive(rootPath)
    mainWindow?.webContents.send('fs:changed', tree)
  })
  return () => watcher.close()
})

// ─── Terminal ──────────────────────────────────────────────────

ipcMain.handle('terminal:create', (_e, cwd?: string) => {
  const id = ++terminalCounter
  const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'

  try {
    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.env.HOME || process.env.USERPROFILE,
      env: process.env as Record<string, string>,
      ...(process.platform === 'win32' ? { useConpty: false } : {}),
    })

    term.onData((data) => {
      mainWindow?.webContents.send('terminal:data', id, data)
    })

    term.onExit(() => {
      terminals.delete(id)
      mainWindow?.webContents.send('terminal:exit', id)
    })

    terminals.set(id, term)
    return id
  } catch (err) {
    throw new Error(`Terminal failed to start: ${err instanceof Error ? err.message : String(err)}`)
  }
})

ipcMain.on('terminal:input', (_e, id: number, data: string) => {
  terminals.get(id)?.write(data)
})

ipcMain.on('terminal:resize', (_e, id: number, cols: number, rows: number) => {
  terminals.get(id)?.resize(cols, rows)
})

ipcMain.on('terminal:kill', (_e, id: number) => {
  terminals.get(id)?.kill()
  terminals.delete(id)
})

// ─── Settings persistence ──────────────────────────────────────

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

ipcMain.handle('settings:get', async () => {
  try {
    const data = await fs.readFile(settingsPath, 'utf-8')
    const parsed = JSON.parse(data)
    // Migrate legacy flat AISettings format
    if (parsed.provider) {
      return { ai: parsed, theme: 'dark' }
    }
    return parsed
  } catch {
    return null
  }
})

ipcMain.handle('settings:save', async (_e, settings: unknown) => {
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  return { success: true }
})

// ─── Window controls ───────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

const THEME_BG: Record<string, string> = { dark: '#181818', light: '#ffffff' }

ipcMain.on('window:setTheme', (_e, theme: string) => {
  if (mainWindow) mainWindow.setBackgroundColor(THEME_BG[theme] ?? THEME_BG.dark)
})
