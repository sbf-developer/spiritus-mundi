import { IconButton } from './IconButton'

interface PanelHeaderProps {
  title: string
  actions?: React.ReactNode
}

export function PanelHeader({ title, actions }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between h-9 px-3 shrink-0 border-b border-border-subtle">
      <span className="text-[11px] font-medium text-text-secondary tracking-wide">
        {title}
      </span>
      {actions && <div className="flex items-center gap-0.5">{actions}</div>}
    </div>
  )
}

export { IconButton }
