import { ClipboardList } from 'lucide-react'
import { useIDEStore } from '../store/ideStore'

export function PlanModeToggle() {
  const { chatMode, agentPlanMode, setAgentPlanMode } = useIDEStore()

  if (chatMode !== 'agent') return null

  return (
    <button
      type="button"
      onClick={() => setAgentPlanMode(!agentPlanMode)}
      title={agentPlanMode ? 'Plan mode: approve before building' : 'Direct mode: build immediately'}
      className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
        agentPlanMode
          ? 'bg-surface-active text-text-primary'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
      }`}
    >
      <ClipboardList size={11} strokeWidth={1.75} />
      Plan
    </button>
  )
}

export function PendingPlanBar() {
  const { pendingPlan, setPendingPlan, isStreaming } = useIDEStore()

  if (!pendingPlan) return null

  return (
    <div className="mx-3 mb-2 px-3 py-2 rounded-lg border border-border-default bg-surface-overlay animate-fade-in">
      <p className="text-[10px] text-text-muted mb-2">Plan ready — review above, then build</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isStreaming}
          onClick={() => {
            window.dispatchEvent(new CustomEvent('ontology:execute-plan'))
          }}
          className="flex-1 h-8 rounded-md bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-[11px] font-medium hover:opacity-90 disabled:opacity-40"
        >
          Approve & Build
        </button>
        <button
          type="button"
          disabled={isStreaming}
          onClick={() => setPendingPlan(null)}
          className="px-3 h-8 rounded-md border border-border-default text-[11px] text-text-secondary hover:bg-surface-hover"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
