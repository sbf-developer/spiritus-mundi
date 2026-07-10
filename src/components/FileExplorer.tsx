import { useState, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  RefreshCw,
  FilePlus,
  FolderPlus,
} from 'lucide-react'
import { useIDEStore, detectLanguage } from '../store/ideStore'
import { PanelHeader, IconButton } from './PanelHeader'
import { ContextMenu, NamePrompt, buildFolderMenuItems } from './ContextMenu'
import { openFileAsTab } from '../lib/files'
import type { FileEntry } from '../vite-env.d'

interface FileExplorerProps {
  onOpenFolder: () => void
}

type CreateAction = { type: 'file' | 'folder'; dirPath: string }

interface MenuState {
  x: number
  y: number
  dirPath: string
}

export function FileExplorer({ onOpenFolder }: FileExplorerProps) {
  const { rootPath, fileTree, setFileTree, openTab } = useIDEStore()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [createAction, setCreateAction] = useState<CreateAction | null>(null)

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const ensureExpanded = (path: string) => {
    setExpanded((prev) => new Set(prev).add(path))
  }

  const handleRefresh = useCallback(async () => {
    if (!rootPath) return
    const tree = await window.ontology.refreshTree(rootPath)
    setFileTree(tree)
  }, [rootPath, setFileTree])

  const handleFileClick = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      toggleExpand(entry.path)
      return
    }
    const tab = await openFileAsTab(entry)
    if (tab) openTab(tab)
  }

  const openContextMenu = (e: React.MouseEvent, dirPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, dirPath })
  }

  const startCreate = (type: 'file' | 'folder', dirPath: string) => {
    ensureExpanded(dirPath)
    setCreateAction({ type, dirPath })
  }

  const handleCreate = async (name: string) => {
    if (!createAction) return
    const { type, dirPath } = createAction
    setCreateAction(null)

    const result =
      type === 'file'
        ? await window.ontology.createFile(dirPath, name)
        : await window.ontology.createFolder(dirPath, name)

    if (!result.success) return

    ensureExpanded(dirPath)
    await handleRefresh()

    if (type === 'file' && result.path) {
      openTab({
        path: result.path,
        name,
        content: '',
        isDirty: false,
        language: detectLanguage(name),
      })
    }
  }

  const handleNewFile = () => rootPath && startCreate('file', rootPath)
  const handleNewFolder = () => rootPath && startCreate('folder', rootPath)

  const rootName = rootPath?.split(/[/\\]/).pop() || 'No folder'

  const menuItems = menu
    ? buildFolderMenuItems(
        () => startCreate('file', menu.dirPath),
        () => startCreate('folder', menu.dirPath)
      )
    : []

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title="Explorer"
        actions={
          rootPath ? (
            <>
              <IconButton icon={<FilePlus size={13} strokeWidth={1.5} />} onClick={handleNewFile} title="New file" />
              <IconButton icon={<FolderPlus size={13} strokeWidth={1.5} />} onClick={handleNewFolder} title="New folder" />
              <IconButton icon={<RefreshCw size={13} strokeWidth={1.5} />} onClick={handleRefresh} title="Refresh" />
            </>
          ) : undefined
        }
      />

      {!rootPath ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <p className="text-[12px] text-text-muted mb-3">No folder open</p>
          <button
            onClick={onOpenFolder}
            className="text-[12px] text-text-secondary hover:text-text-primary transition-colors"
          >
            Open folder
          </button>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto py-1.5"
          onContextMenu={(e) => {
            if (e.target === e.currentTarget) openContextMenu(e, rootPath)
          }}
        >
          <div
            className="flex items-center gap-1.5 px-2.5 py-[3px] mx-1 text-[12px] text-text-primary cursor-pointer hover:bg-surface-hover rounded-md"
            onClick={() => toggleExpand(rootPath)}
            onContextMenu={(e) => openContextMenu(e, rootPath)}
          >
            {expanded.has(rootPath) ? (
              <ChevronDown size={13} strokeWidth={1.5} className="text-text-muted shrink-0" />
            ) : (
              <ChevronRight size={13} strokeWidth={1.5} className="text-text-muted shrink-0" />
            )}
            <Folder size={13} strokeWidth={1.5} className="text-text-secondary shrink-0" />
            <span className="truncate font-medium">{rootName}</span>
          </div>
          {expanded.has(rootPath) && (
            <div>
              {fileTree.map((entry) => (
                <TreeNode
                  key={entry.path}
                  entry={entry}
                  depth={1}
                  expanded={expanded}
                  onClick={handleFileClick}
                  onContextMenu={openContextMenu}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}

      {createAction && (
        <NamePrompt
          title={createAction.type === 'file' ? 'New file' : 'New folder'}
          placeholder={createAction.type === 'file' ? 'filename.ts' : 'folder-name'}
          onSubmit={handleCreate}
          onCancel={() => setCreateAction(null)}
        />
      )}
    </div>
  )
}

function TreeNode({
  entry,
  depth,
  expanded,
  onClick,
  onContextMenu,
}: {
  entry: FileEntry
  depth: number
  expanded: Set<string>
  onClick: (entry: FileEntry) => void
  onContextMenu: (e: React.MouseEvent, dirPath: string) => void
}) {
  const isExpanded = expanded.has(entry.path)
  const paddingLeft = depth * 14 + 10

  const handleContextMenu = (e: React.MouseEvent) => {
    if (entry.isDirectory) {
      onContextMenu(e, entry.path)
    } else {
      const parent = entry.path.replace(/[/\\][^/\\]+$/, '')
      onContextMenu(e, parent || entry.path)
    }
  }

  return (
    <>
      <div
        className="flex items-center gap-1.5 py-[3px] mx-1 text-[12px] cursor-pointer hover:bg-surface-hover rounded-md group"
        style={{ paddingLeft }}
        onClick={() => onClick(entry)}
        onContextMenu={handleContextMenu}
      >
        {entry.isDirectory ? (
          isExpanded ? (
            <ChevronDown size={13} strokeWidth={1.5} className="text-text-muted shrink-0" />
          ) : (
            <ChevronRight size={13} strokeWidth={1.5} className="text-text-muted shrink-0" />
          )
        ) : (
          <span className="w-[13px] shrink-0" />
        )}
        {entry.isDirectory ? (
          <Folder size={13} strokeWidth={1.5} className="text-text-muted shrink-0" />
        ) : (
          <File size={13} strokeWidth={1.5} className="text-text-muted shrink-0" />
        )}
        <span className="truncate text-text-secondary group-hover:text-text-primary">
          {entry.name}
        </span>
      </div>
      {entry.isDirectory && isExpanded && entry.children?.map((child) => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          expanded={expanded}
          onClick={onClick}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  )
}
