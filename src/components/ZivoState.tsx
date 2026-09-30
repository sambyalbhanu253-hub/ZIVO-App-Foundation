import { AlertTriangle, Inbox, LoaderCircle, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

type StateAction = {
  label: string
  onClick: () => void
}

type StatePanelProps = {
  eyebrow?: string
  title: string
  description: string
  action?: StateAction
  className?: string
}

export function ZivoInlineLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span className="zivo-loader" aria-hidden="true">
        <LoaderCircle size={16} />
      </span>
      <span>{label}</span>
    </span>
  )
}

function StatePanel({ icon, eyebrow, title, description, action, className = '' }: StatePanelProps & { icon: ReactNode }) {
  return (
    <div className={`zivo-state-panel ${className}`.trim()}>
      <span className="zivo-state-icon" aria-hidden="true">{icon}</span>
      {eyebrow && <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
      <h2 className="mt-2 text-base font-extrabold tracking-[-0.035em] text-card-foreground">{title}</h2>
      <p className="mt-1.5 text-sm font-medium leading-6 text-muted-foreground">{description}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-4 min-h-10 rounded-xl bg-primary px-3.5 text-xs font-extrabold text-primary-foreground shadow-premium transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {action.label}
        </button>
      )}
    </div>
  )
}

export function ZivoLoadingState({ label = 'Getting your ZIVO view ready…', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`zivo-loading-state ${className}`.trim()} role="status">
      <span className="zivo-loader zivo-loader-lg" aria-hidden="true"><LoaderCircle size={22} /></span>
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
    </div>
  )
}

export function ZivoErrorState({ title = 'That did not go as planned.', description, action, className }: StatePanelProps) {
  return <StatePanel icon={<AlertTriangle size={19} />} eyebrow="ZIVO notice" title={title} description={description} action={action} className={className} />
}

export function ZivoEmptyState({ title, description, action, className }: StatePanelProps) {
  return <StatePanel icon={title.toLowerCase().includes('search') ? <SearchX size={19} /> : <Inbox size={19} />} eyebrow="Nothing here yet" title={title} description={description} action={action} className={className} />
}
