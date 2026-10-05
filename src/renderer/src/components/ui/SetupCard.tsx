import type { JSX, ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import { Logo } from './Logo'

interface SetupCardProps {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  contentKey?: string
}

/** The shared account and first-run setup frame. */
export function SetupCard({
  eyebrow,
  title,
  description,
  children,
  footer,
  className,
  contentKey
}: SetupCardProps): JSX.Element {
  return (
    <main className="relative isolate grid min-h-screen place-items-center overflow-y-auto bg-slate-950 p-5 text-white sm:p-8">
      <div className="setup-ambient pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(56,189,248,0.13),transparent_32%),radial-gradient(circle_at_80%_85%,rgba(245,158,11,0.09),transparent_35%)]" />
      <section
        className={twMerge(
          'setup-card-enter w-full max-w-lg border border-sky-300/15 bg-slate-950/90 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-10',
          className
        )}
      >
        <Logo className="mb-7 size-14" />
        <div key={contentKey} className={contentKey ? 'setup-step-enter' : undefined}>
          <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">{eyebrow}</p>
          <h1 className="mt-2 min-h-10 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 min-h-12 text-sm leading-6 text-neutral-400">{description}</p>
        </div>
        <div className="mt-7">{children}</div>
        {footer && <div className="mt-6 border-t border-white/10 pt-5">{footer}</div>}
      </section>
    </main>
  )
}
