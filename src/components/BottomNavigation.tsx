import type { LucideIcon } from 'lucide-react'
import { Clapperboard, Compass, House, Plus, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../lib/utils'

type NavItem = {
  label: string
  to: string
  icon: LucideIcon
  create?: boolean
}

const navItems: NavItem[] = [
  { label: 'Home', to: '/', icon: House },
  { label: 'Shorts', to: '/shorts', icon: Clapperboard },
  { label: 'Create', to: '/create', icon: Plus, create: true },
  { label: 'Discover', to: '/discover', icon: Compass },
  { label: 'Profile', to: '/profile', icon: UserRound },
]

export default function BottomNavigation() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/90 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-2 backdrop-blur-2xl zivo-elevated-surface"
      aria-label="Primary navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
        {navItems.map(({ label, to, icon: Icon, create }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={label}
            className={({ isActive }) => cn(
              'group relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1 text-[11px] font-extrabold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]',
              create ? (isActive ? 'text-primary' : 'text-muted-foreground') : (isActive ? 'text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'),
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && !create && <span className="absolute top-1 h-1 w-4 rounded-full bg-primary" aria-hidden="true" />}
                <span className={cn(
                  'flex size-8 items-center justify-center rounded-xl transition-all duration-200',
                  isActive && !create && 'bg-accent text-primary',
                  create && 'zivo-create-glow relative size-11 -translate-y-3 rounded-2xl text-primary-foreground transition-transform group-hover:-translate-y-3.5',
                  create && isActive && 'ring-2 ring-primary/45 ring-offset-2 ring-offset-background',
                )}>
                  <Icon size={create ? 21 : 19} strokeWidth={create ? 2.8 : 2.25} aria-hidden="true" />
                </span>
                <span className={cn(create && '-mt-3')}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export { navItems }
