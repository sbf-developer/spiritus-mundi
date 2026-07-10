import { exec, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import * as pty from 'node-pty'
import { loadProjectHarness, validateCommand, validateDeletePath } from './harnessLoader'

let mainWindow: BrowserWindow | null = null
const terminals = new Map<number, pty.IPty>()
let terminalCounter = 0
const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

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
    try {
      const stat = await fs.stat(filePath)
      if (stat.isDirectory()) {
        const entries = await fs.readdir(filePath)
        if (entries.length > 0) {
          return { success: false, error: `EISDIR: ${filePath} is a non-empty directory` }
        }
        await fs.rmdir(filePath)
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
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

ipcMain.handle('fs:delete', async (_e, targetPath: string, rootPath?: string) => {
  if (rootPath) {
    const check = validateDeletePath(rootPath, targetPath)
    if (!check.allowed) {
      return { success: false, error: check.reason ?? 'Delete blocked by harness' }
    }
  }
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

ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
  try {
    await fs.mkdir(path.dirname(newPath), { recursive: true })
    await fs.rename(oldPath, newPath)
    return { success: true, path: newPath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('fs:mkdir', async (_e, dirPath: string) => {
  try {
    await fs.mkdir(dirPath, { recursive: true })
    return { success: true, path: dirPath }
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

// ─── Search & Git context ─────────────────────────────────────

const SEARCH_SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'build', '.next', 'coverage', 'release', '.cache',
])

const TEXT_SEARCH_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'cs', 'rb', 'php',
  'html', 'css', 'scss', 'json', 'md', 'yaml', 'yml', 'xml', 'sql', 'sh', 'bash', 'ps1', 'toml',
  'vue', 'svelte', 'txt', 'env', 'gitignore', 'dockerfile',
])

interface GrepMatch {
  path: string
  rel: string
  line: number
  text: string
}

async function grepWithRipgrep(rootPath: string, query: string, maxResults: number): Promise<GrepMatch[] | null> {
  try {
    const { stdout } = await execFileAsync(
      'rg',
      ['--json', '--max-count', '3', '--max-filesize', '512K', '-i', query, rootPath],
      { maxBuffer: 8 * 1024 * 1024, timeout: 8000 }
    )
    const matches: GrepMatch[] = []
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line)
        if (row.type !== 'match') continue
        const filePath = row.data.path.text as string
        const rel = path.relative(rootPath, filePath).replace(/\\/g, '/')
        if (SEARCH_SKIP_DIRS.has(rel.split('/')[0])) continue
        matches.push({
          path: filePath,
          rel,
          line: row.data.line_number as number,
          text: (row.data.lines.text as string).trimEnd(),
        })
        if (matches.length >= maxResults) break
      } catch {
        // skip malformed rg json line
      }
    }
    return matches
  } catch {
    return null
  }
}

async function grepFallback(rootPath: string, query: string, maxResults: number): Promise<GrepMatch[]> {
  const q = query.toLowerCase()
  const matches: GrepMatch[] = []

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 8 || matches.length >= maxResults) return
    let entries: Awaited<ReturnType<typeof fs.readdir>>
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (matches.length >= maxResults) return
      if (entry.name.startsWith('.') && entry.name !== '.env') continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SEARCH_SKIP_DIRS.has(entry.name)) continue
        await walk(fullPath, depth + 1)
        continue
      }

      const ext = path.extname(entry.name).slice(1).toLowerCase()
      if (!TEXT_SEARCH_EXTENSIONS.has(ext) && entry.name !== 'Dockerfile') continue

      try {
        const stat = await fs.stat(fullPath)
        if (stat.size > 512 * 1024) continue
        const content = await fs.readFile(fullPath, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            matches.push({
              path: fullPath,
              rel: path.relative(rootPath, fullPath).replace(/\\/g, '/'),
              line: i + 1,
              text: lines[i].trimEnd(),
            })
            if (matches.length >= maxResults) return
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  await walk(rootPath)
  return matches
}

ipcMain.handle('fs:grep', async (_e, rootPath: string, query: string, maxResults = 20) => {
  const trimmed = query.trim()
  if (!trimmed || !fsSync.existsSync(rootPath)) {
    return { success: true, matches: [] as GrepMatch[] }
  }

  const rg = await grepWithRipgrep(rootPath, trimmed, maxResults)
  const matches = rg ?? (await grepFallback(rootPath, trimmed, maxResults))
  return { success: true, matches }
})

async function runGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 2 * 1024 * 1024, timeout: 5000 })
    return stdout.trim()
  } catch {
    return null
  }
}

ipcMain.handle('git:context', async (_e, rootPath: string) => {
  if (!fsSync.existsSync(path.join(rootPath, '.git'))) {
    return { success: true, isRepo: false as const }
  }

  const branch = await runGit(rootPath, ['branch', '--show-current'])
  const status = await runGit(rootPath, ['status', '--short', '--branch'])
  const diffStat = await runGit(rootPath, ['diff', '--stat', 'HEAD'])
  const diff = await runGit(rootPath, ['diff', 'HEAD'])
  const untracked = await runGit(rootPath, ['ls-files', '--others', '--exclude-standard'])

  const diffTrimmed = diff && diff.length > 6000 ? diff.slice(0, 6000) + '\n...(diff truncated)' : diff

  return {
    success: true,
    isRepo: true as const,
    branch: branch || 'HEAD detached',
    status: status || '',
    diffStat: diffStat || '',
    diff: diffTrimmed || '',
    untracked: untracked ? untracked.split('\n').filter(Boolean).slice(0, 30) : [],
  }
})

ipcMain.handle('fs:readRules', async (_e, rootPath: string) => {
  const bundle = await loadProjectHarness(rootPath)
  return {
    success: true,
    rules: bundle.rules.map((r) => ({ name: r.name, content: r.content })),
  }
})

ipcMain.handle('harness:load', async (_e, rootPath: string, activeRel?: string) => {
  const bundle = await loadProjectHarness(rootPath, activeRel)
  return { success: true, ...bundle }
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

ipcMain.handle('terminal:exec', async (_e, cwd: string, command: string) => {
  const trimmed = command.trim()
  if (!trimmed) {
    return { success: false, stdout: '', stderr: 'Empty command', exitCode: 1 }
  }

  const safety = validateCommand(trimmed)
  if (!safety.allowed) {
    const msg = `Blocked by harness: ${safety.reason}`
    mainWindow?.webContents.send('terminal:inject', `\r\n\x1b[31m${msg}\x1b[0m\r\n`)
    return { success: false, stdout: '', stderr: msg, exitCode: 1 }
  }

  mainWindow?.webContents.send('terminal:inject', `\r\n\x1b[36m$\x1b[0m ${trimmed}\r\n`)

  try {
    const useCmd = trimmed.startsWith('cmd.exe /c ')
    const { stdout, stderr } = await execAsync(trimmed, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      shell: useCmd
        ? undefined
        : process.platform === 'win32'
          ? 'powershell.exe'
          : process.env.SHELL || '/bin/bash',
    })

    const out = stdout || ''
    const err = stderr || ''
    if (out) mainWindow?.webContents.send('terminal:inject', out.replace(/\n/g, '\r\n'))
    if (err) mainWindow?.webContents.send('terminal:inject', `\x1b[33m${err.replace(/\n/g, '\r\n')}\x1b[0m`)

    return { success: true, stdout: out, stderr: err, exitCode: 0 }
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number; message?: string }
    const stdout = execErr.stdout ?? ''
    const stderr = execErr.stderr ?? execErr.message ?? String(err)
    const exitCode = typeof execErr.code === 'number' ? execErr.code : 1

    if (stdout) mainWindow?.webContents.send('terminal:inject', stdout.replace(/\n/g, '\r\n'))
    if (stderr) {
      mainWindow?.webContents.send('terminal:inject', `\x1b[31m${stderr.replace(/\n/g, '\r\n')}\x1b[0m`)
    }

    return { success: false, stdout, stderr, exitCode }
  }
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
