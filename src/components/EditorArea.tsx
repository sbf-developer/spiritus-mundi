import { useRef, useCallback, useEffect } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { X, FolderOpen } from 'lucide-react'
import { useIDEStore } from '../store/ideStore'
import { getMonacoTheme } from '../lib/theme'
import { monaco } from '../monacoSetup'
import type { editor } from 'monaco-editor'

interface EditorAreaProps {
  onOpenFolder: () => void
}

export function EditorArea({ onOpenFolder }: EditorAreaProps) {
  const { tabs, activeTabPath, setActiveTab, closeTab, updateTabContent, markTabSaved, theme, rootPath, setEditorSelection } =
    useIDEStore()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)

  const activeTab = tabs.find((t) => t.path === activeTabPath)
  const monacoTheme = getMonacoTheme(theme)

  useEffect(() => {
    monaco.editor.setTheme(monacoTheme)
  }, [monacoTheme])

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const layout = () => editorRef.current?.layout()
    const observer = new ResizeObserver(layout)
    observer.observe(container)
    layout()

    return () => observer.disconnect()
  }, [activeTabPath, tabs.length])

  const handleSave = useCallback(async () => {
    if (!activeTab || activeTab.viewMode === 'image') return
    const result = await window.spiritus.writeFile(activeTab.path, activeTab.content)
    if (result.success) markTabSaved(activeTab.path)
  }, [activeTab, markTabSaved])

  const handleEditorMount: OnMount = (editorInstance, monacoApi) => {
    editorRef.current = editorInstance
    editorInstance.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => {
      handleSave()
    })
    editorInstance.addCommand(
      monacoApi.KeyMod.CtrlCmd | monacoApi.KeyMod.Shift | monacoApi.KeyCode.KeyL,
      () => useIDEStore.getState().addSelectionToChat()
    )
    editorInstance.onDidChangeCursorSelection(() => {
      const tab = useIDEStore.getState().tabs.find(
        (t) => t.path === useIDEStore.getState().activeTabPath
      )
      if (!tab || tab.viewMode === 'image') {
        setEditorSelection(null)
        return
      }
      const sel = editorInstance.getSelection()
      const model = editorInstance.getModel()
      if (!sel || !model || sel.isEmpty()) {
        setEditorSelection(null)
        return
      }
      const content = model.getValueInRange(sel)
      if (!content.trim()) {
        setEditorSelection(null)
        return
      }
      setEditorSelection({
        path: tab.path,
        name: tab.name,
        startLine: sel.startLineNumber,
        endLine: sel.endLineNumber,
        content,
        language: tab.language,
      })
    })
    requestAnimationFrame(() => editorInstance.layout())
    editorInstance.focus()
  }

  const handleChange = (value: string | undefined) => {
    if (activeTab && value !== undefined) {
      updateTabContent(activeTab.path, value)
    }
  }

  if (tabs.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface">
        <div className="text-center max-w-xs px-6 animate-fade-in">
          {!rootPath ? (
            <>
              <p className="text-[13px] text-text-primary font-medium mb-1.5">Open a project</p>
              <p className="text-[12px] text-text-muted mb-4 leading-relaxed">
                Open a folder to browse files, edit code, and chat with your AI.
              </p>
              <button
                onClick={onOpenFolder}
                className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-text-primary transition-colors"
              >
                <FolderOpen size={14} strokeWidth={1.5} className="opacity-70" />
                Open folder
              </button>
              <p className="text-[11px] text-text-muted mt-2.5">Ctrl+O</p>
            </>
          ) : (
            <>
              <p className="text-[13px] text-text-primary font-medium mb-1.5">No file open</p>
              <p className="text-[12px] text-text-muted leading-relaxed">
                Select a file from the explorer to start editing.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col min-w-0 min-h-0 bg-surface overflow-hidden">
      <div className="flex items-center h-9 bg-surface-raised border-b border-border-subtle overflow-x-auto shrink-0">
        {tabs.map((tab) => {
          const isActive = tab.path === activeTabPath
          return (
            <div
              key={tab.path}
              className={`flex items-center gap-2 h-full px-3 text-[12px] cursor-pointer border-r border-border-subtle shrink-0 group transition-colors ${
                isActive
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
              onClick={() => setActiveTab(tab.path)}
            >
              <span className="truncate max-w-[120px]">{tab.name}</span>
              {tab.isDirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-text-secondary shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.path)
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-active transition-opacity text-text-muted hover:text-text-secondary"
              >
                <X size={11} strokeWidth={1.5} />
              </button>
            </div>
          )
        })}
      </div>

      {activeTab && (
        <div ref={editorContainerRef} className="flex-1 min-h-0 relative overflow-hidden">
          {activeTab.viewMode === 'image' && activeTab.previewDataUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface p-6 overflow-auto">
              <img
                src={activeTab.previewDataUrl}
                alt={activeTab.name}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <Editor
              key={activeTab.path}
              height="100%"
              width="100%"
              language={activeTab.language}
              value={activeTab.content}
              theme={monacoTheme}
              onChange={handleChange}
              onMount={handleEditorMount}
              loading={null}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 8 },
                lineNumbers: 'on',
                lineHeight: 20,
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                cursorWidth: 1,
                smoothScrolling: true,
                tabSize: 2,
                wordWrap: 'off',
                bracketPairColorization: { enabled: true },
                automaticLayout: true,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                readOnly: false,
                scrollbar: {
                  verticalScrollbarSize: 5,
                  horizontalScrollbarSize: 5,
                },
                guides: {
                  indentation: true,
                  bracketPairs: true,
                },
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
