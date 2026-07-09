import { useState } from 'react'
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
import type { FileEntry } from '../vite-env.d'

interface FileExplorerProps {
  onOpenFolder: () => void
}

export function FileExplorer({ onOpenFolder }: FileExplorerProps) {
  const { rootPath, fileTree, setFileTree, openTab } = useIDEStore()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleFileClick = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      toggleExpand(entry.path)
      return
    }
    const result = await window.spiritus.readFile(entry.path)
    if (result.success) {
      openTab({
        path: entry.path,
        name: entry.name,
        content: result.content,
        isDirty: false,
        language: detectLanguage(entry.name),
      })
    }
  }

  const handleRefresh = async () => {
    if (!rootPath) return
    const tree = await window.spiritus.refreshTree(rootPath)
    setFileTree(tree)
  }

  const handleNewFile = async () => {
    if (!rootPath) return
    const name = prompt('File name:')
    if (!name) return
    await window.spiritus.createFile(rootPath, name)
    handleRefresh()
  }

  const handleNewFolder = async () => {
    if (!rootPath) return
    const name = prompt('Folder name:')
    if (!name) return
    await window.spiritus.createFolder(rootPath, name)
    handleRefresh()
  }

  const rootName = rootPath?.split(/[/\\]/).pop() || 'No folder'

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
        <div className="flex-1 overflow-y-auto py-1.5">
          <div
            className="flex items-center gap-1.5 px-2.5 py-[3px] mx-1 text-[12px] text-text-primary cursor-pointer hover:bg-surface-hover rounded-md"
            onClick={() => toggleExpand(rootPath)}
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
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TreeNode({
  entry,
  depth,
  expanded,
  onClick,
}: {
  entry: FileEntry
  depth: number
  expanded: Set<string>
  onClick: (entry: FileEntry) => void
}) {
  const isExpanded = expanded.has(entry.path)
  const paddingLeft = depth * 14 + 10

  return (
    <>
      <div
        className="flex items-center gap-1.5 py-[3px] mx-1 text-[12px] cursor-pointer hover:bg-surface-hover rounded-md group"
        style={{ paddingLeft }}
        onClick={() => onClick(entry)}
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
        />
      ))}
    </>
  )
}
