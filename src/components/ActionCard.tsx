/**
 * Compact action row in agent messages — RUN, DIR, DEL, MV badges.
 * Used by AgentMessageRenderer for non-code agent operations.
 */
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

interface ActionCardProps {
  badge: string
  label: string
  stat?: string
  statType?: 'add' | 'del'
  detail?: string
  expandable?: boolean
  body?: string
}

export function ActionCard({ badge, label, stat, statType, detail, expandable, body }: ActionCardProps) {
  const [open, setOpen] = useState(false)
  const canExpand = expandable && body

  return (
    <div className="action-card">
      <button
        type="button"
        className="action-card-header w-full"
        onClick={() => canExpand && setOpen((o) => !o)}
        disabled={!canExpand}
      >
        {canExpand ? (
          <ChevronRight size={11} className={`action-card-chevron ${open ? 'action-card-chevron-open' : ''}`} />
        ) : (
          <span className="action-card-chevron-spacer" />
        )}
        <span className="action-card-badge">{badge}</span>
        <span className="action-card-label">{label}</span>
        {detail && <span className="action-card-detail">{detail}</span>}
        {stat && (
          <span className={`action-card-stat ${statType === 'del' ? 'action-card-stat-del' : 'action-card-stat-add'}`}>
            {stat}
          </span>
        )}
      </button>
      {canExpand && open && body && (
        <pre className="action-card-body">{body}</pre>
      )}
    </div>
  )
}
