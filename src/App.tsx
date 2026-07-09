import { useEffect, useCallback } from 'react'
import { Files, Settings, Terminal } from 'lucide-react'
import { useIDEStore } from './store/ideStore'
import { FileExplorer } from './components/FileExplorer'
import { SettingsPanel } from './components/SettingsPanel'
import { EditorArea } from './components/EditorArea'
import { TerminalPanel } from './components/TerminalPanel'
import { ChatPanel } from './components/ChatPanel'
import { TitleBar } from './components/TitleBar'
import { ResizeHandle } from './components/ResizeHandle'
import { loadSavedTheme, useTheme } from './hooks/useTheme'

export default function App() {
  const {
    rootPath,
    setRootPath,
    setFileTree,
    sidebarWidth,
    chatWidth,
    terminalHeight,
    showTerminal,
    showChat,
    showSidebar,
    activePanel,
    setActivePanel,
    adjustSidebarWidth,
    adjustChatWidth,
    adjustTerminalHeight,
    toggleTerminal,
    toggleChat,
  } = useIDEStore()

  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    loadSavedTheme()
  }, [])

  const handleOpenFolder = useCallback(async () => {
    const result = await window.spiritus.openFolder()
    if (result) {
      setRootPath(result.path)
      setFileTree(result.tree)
    }
  }, [setRootPath, setFileTree])

  useEffect(() => {
    const unsub = window.spiritus.onMenuOpenFolder(() => handleOpenFolder())
    return unsub
  }, [handleOpenFolder])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        handleOpenFolder()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleOpenFolder])

  useEffect(() => {
    if (!rootPath) return
    const unsub = window.spiritus.onFsChanged((tree) => setFileTree(tree))
    return unsub
  }, [rootPath, setFileTree])

  return (
    <div className="flex flex-col h-full bg-surface">
      <TitleBar
        onOpenFolder={handleOpenFolder}
        theme={theme}
        onToggleTheme={toggleTheme}
        showChat={showChat}
        onToggleChat={toggleChat}
      />

      <div className="flex flex-1 min-h-0">
        {/* Activity bar */}
        <nav className="w-11 flex flex-col items-center py-2 gap-0.5 bg-surface-raised border-r border-border-subtle shrink-0">
          <ActivityButton
            icon={<Files size={18} strokeWidth={1.5} />}
            active={showSidebar && activePanel === 'explorer'}
            onClick={() => {
              if (showSidebar && activePanel === 'explorer') {
                useIDEStore.setState({ showSidebar: false })
              } else {
                setActivePanel('explorer')
                useIDEStore.setState({ showSidebar: true })
              }
            }}
            title="Explorer"
          />
          <ActivityButton
            icon={<Settings size={18} strokeWidth={1.5} />}
            active={showSidebar && activePanel === 'settings'}
            onClick={() => {
              if (showSidebar && activePanel === 'settings') {
                useIDEStore.setState({ showSidebar: false })
              } else {
                setActivePanel('settings')
                useIDEStore.setState({ showSidebar: true })
              }
            }}
            title="Settings"
          />
          <div className="flex-1" />
          <ActivityButton
            icon={<Terminal size={18} strokeWidth={1.5} />}
            active={showTerminal}
            onClick={toggleTerminal}
            title="Terminal"
          />
        </nav>

        {/* Sidebar */}
        {showSidebar && (
          <>
            <div
              className="flex flex-col shrink-0 bg-surface-raised overflow-hidden"
              style={{ width: sidebarWidth }}
            >
              {activePanel === 'explorer' ? (
                <FileExplorer onOpenFolder={handleOpenFolder} />
              ) : (
                <SettingsPanel />
              )}
            </div>
            <ResizeHandle
              direction="horizontal"
              onResize={adjustSidebarWidth}
            />
          </>
        )}

        {/* Main: editor + terminal left, chat full-height right */}
        <div className="flex flex-1 min-h-0 min-w-0">
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
              <EditorArea onOpenFolder={handleOpenFolder} />
            </div>

            {showTerminal && (
              <>
                <ResizeHandle
                  direction="vertical"
                  onResize={adjustTerminalHeight}
                />
                <div
                  className="shrink-0 bg-surface overflow-hidden"
                  style={{ height: terminalHeight }}
                >
                  <TerminalPanel />
                </div>
              </>
            )}
          </div>

          {showChat && (
            <>
              <ResizeHandle
                direction="horizontal"
                onResize={adjustChatWidth}
              />
              <div
                className={`shrink-0 bg-surface-raised overflow-hidden flex flex-col ${
                  showTerminal ? 'rounded-bl-xl' : ''
                }`}
                style={{ width: chatWidth }}
              >
                <ChatPanel />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityButton({
  icon,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`activity-btn ${active ? 'active' : ''}`}
    >
      {icon}
    </button>
  )
}
