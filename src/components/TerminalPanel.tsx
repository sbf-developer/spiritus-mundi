import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Plus, MessageSquarePlus } from 'lucide-react'
import { useIDEStore } from '../store/ideStore'
import { getTerminalTheme } from '../lib/theme'
import { PanelHeader, IconButton } from './PanelHeader'
import '@xterm/xterm/css/xterm.css'

interface TermInstance {
  id: number
  xterm: XTerm
  fitAddon: FitAddon
}

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termsRef = useRef<TermInstance[]>([])
  const { rootPath, theme, addTerminalToChat, showChat } = useIDEStore()

  const spawnTerminal = async () => {
    if (!containerRef.current) return

    const id = await window.spiritus.terminal.create(rootPath || undefined)

    const xterm = new XTerm({
      theme: getTerminalTheme(theme),
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
    spawnTerminal()

    const unsubData = window.spiritus.terminal.onData((id, data) => {
      termsRef.current.find((t) => t.id === id)?.xterm.write(data)
      useIDEStore.getState().appendTerminalOutput(data)
    })

    const unsubExit = window.spiritus.terminal.onExit((id) => {
      termsRef.current.find((t) => t.id === id)?.xterm.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
    })

    const unsubInject = window.spiritus.terminal.onInject((text) => {
      termsRef.current[0]?.xterm.write(text)
      useIDEStore.getState().appendTerminalOutput(text)
    })

    return () => {
      unsubData()
      unsubExit()
      unsubInject()
      termsRef.current.forEach((t) => {
        window.spiritus.terminal.kill(t.id)
        t.xterm.dispose()
      })
      termsRef.current = []
    }
  }, [rootPath])

  useEffect(() => {
    const colors = getTerminalTheme(theme)
    termsRef.current.forEach(({ xterm }) => {
      xterm.options.theme = colors
    })
  }, [theme])

  const handleNewTerminal = () => {
    termsRef.current.forEach((t) => {
      window.spiritus.terminal.kill(t.id)
      t.xterm.dispose()
    })
    spawnTerminal()
  }

  const handleAddToChat = () => {
    addTerminalToChat()
    if (!showChat) useIDEStore.setState({ showChat: true })
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title="Terminal"
        actions={
          <>
            <IconButton
              icon={<MessageSquarePlus size={13} strokeWidth={1.5} />}
              onClick={handleAddToChat}
              title="Add terminal output to chat"
            />
            <IconButton
              icon={<Plus size={13} strokeWidth={1.5} />}
              onClick={handleNewTerminal}
              title="New terminal"
            />
          </>
        }
      />
      <div ref={containerRef} className="flex-1 px-2 py-1 overflow-hidden bg-surface" />
    </div>
  )
}
