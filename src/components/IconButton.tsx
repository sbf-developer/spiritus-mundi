interface IconButtonProps {
  icon: React.ReactNode
  onClick?: () => void
  title?: string
  active?: boolean
}

export function IconButton({ icon, onClick, title, active }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? 'text-text-primary bg-surface-active'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
      }`}
    >
      {icon}
    </button>
  )
}
