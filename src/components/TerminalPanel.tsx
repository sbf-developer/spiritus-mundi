import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Plus } from 'lucide-react'
import { useIDEStore } from '../store/ideStore'
import { PanelHeader, IconButton } from './PanelHeader'
import '@xterm/xterm/css/xterm.css'

interface TermInstance {
  id: number
  xterm: XTerm
  fitAddon: FitAddon
}

const DARK_THEME = {
  background: '#181818',
  foreground: '#e4e4e4',
  cursor: '#e4e4e4',
  selectionBackground: 'rgba(255, 255, 255, 0.15)',
  black: '#181818',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#e4e4e4',
  brightBlack: '#5a5a5a',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff',
}

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#1a1a1a',
  cursor: '#1a1a1a',
  selectionBackground: 'rgba(0, 0, 0, 0.12)',
  black: '#1a1a1a',
  red: '#c62828',
  green: '#2e7d32',
  yellow: '#f9a825',
  blue: '#1565c0',
  magenta: '#6a1b9a',
  cyan: '#00838f',
  white: '#1a1a1a',
  brightBlack: '#999999',
  brightRed: '#c62828',
  brightGreen: '#2e7d32',
  brightYellow: '#f9a825',
  brightBlue: '#1565c0',
  brightMagenta: '#6a1b9a',
  brightCyan: '#00838f',
  brightWhite: '#000000',
}

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termsRef = useRef<TermInstance[]>([])
  const { rootPath, theme } = useIDEStore()

  const createTerminal = async () => {
    if (!containerRef.current) return

    const id = await window.spiritus.terminal.create(rootPath || undefined)

    const xterm = new XTerm({
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
      fontFamily: "'JetBrains Mono', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)

    containerRef.current.innerHTML = ''
    xterm.open(containerRef.current)
    fitAddon.fit()

    xterm.onData((data) => {
      window.spiritus.terminal.input(id, data)
    })

    const instance: TermInstance = { id, xterm, fitAddon }
    termsRef.current = [instance]

    const ro = new ResizeObserver(() => {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        window.spiritus.terminal.resize(id, dims.cols, dims.rows)
      }
    })
    ro.observe(containerRef.current)

    return () => ro.disconnect()
  }

  useEffect(() => {
    createTerminal()

    const unsubData = window.spiritus.terminal.onData((id, data) => {
      const term = termsRef.current.find((t) => t.id === id)
      term?.xterm.write(data)
    })

    const unsubExit = window.spiritus.terminal.onExit((id) => {
      const term = termsRef.current.find((t) => t.id === id)
      term?.xterm.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
    })

    return () => {
      unsubData()
      unsubExit()
      termsRef.current.forEach((t) => {
        window.spiritus.terminal.kill(t.id)
        t.xterm.dispose()
      })
      termsRef.current = []
    }
  }, [rootPath, theme])

  const handleNewTerminal = () => {
    termsRef.current.forEach((t) => {
      window.spiritus.terminal.kill(t.id)
      t.xterm.dispose()
    })
    createTerminal()
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title="Terminal"
        actions={
          <IconButton
            icon={<Plus size={13} strokeWidth={1.5} />}
            onClick={handleNewTerminal}
            title="New terminal"
          />
        }
      />
      <div ref={containerRef} className="flex-1 px-2 py-1 overflow-hidden" />
    </div>
  )
}
