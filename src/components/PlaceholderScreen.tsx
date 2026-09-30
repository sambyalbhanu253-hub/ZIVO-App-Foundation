import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

type PlaceholderScreenProps = {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  actionLabel: string
  actionTo: string
  children?: ReactNode
}

export default function PlaceholderScreen({
  eyebrow,
  title,
  description,
  icon: Icon,
  actionLabel,
  actionTo,
  children,
}: PlaceholderScreenProps) {
  return (
    <section className="space-y-6" aria-labelledby="page-title">
      <div className="space-y-2 px-1 pt-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 id="page-title" className="text-3xl font-extrabold tracking-[-0.055em] text-foreground">
          {title}
        </h1>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      {children}

      <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-premium">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-primary">
          <Icon size={26} aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-card-foreground">This space is taking shape</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
          The ZIVO foundation is ready. More ways to watch, make, and connect are on their way.
        </p>
        <Link
          to={actionTo}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-premium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
        >
          {actionLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
