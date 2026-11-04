import {
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import { Film } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { useDismissibleMenu } from '../../components/ui/use-dismissible-menu'
import { useTranslation } from '../i18n/i18n'
import { useMatchDemoStore } from './match-demo.store'

export function useMatchContextMenu(className?: string): {
  menu: JSX.Element | null
  onContextMenu: (event: MouseEvent<HTMLElement>, matchId: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>, matchId: string) => void
} {
  const [target, setTarget] = useState<{ id: string; x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const preparing = useMatchDemoStore((state) => state.preparing)
  const { t } = useTranslation()
  const dismiss = (): void => setTarget(null)
  useDismissibleMenu(Boolean(target), ref, dismiss)
  useLayoutEffect(() => {
    const menu = ref.current
    if (!target || !menu) return
    // The top layer keeps viewport coordinates independent of draggable window
    // transforms and scrolling containers, while retaining modal focus ownership.
    menu.showPopover()
    const rect = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - rect.width - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - rect.height - 8))}px`
    menu.querySelector('button')?.focus({ preventScroll: true })
  }, [target])
  const show = (element: HTMLElement, id: string, x: number, y: number): void => {
    if (!window.api.matchHistory.watchDemo) return
    trigger.current = element
    setTarget({
      id,
      x,
      y
    })
  }
  return {
    onContextMenu: (event, id) => {
      event.preventDefault()
      show(event.currentTarget, id, event.clientX, event.clientY)
    },
    onKeyDown: (event, id) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      show(event.currentTarget, id, rect.left, rect.bottom)
    },
    menu: target ? (
      <div
        ref={ref}
        popover="manual"
        role="menu"
        aria-label={t('demo.watch')}
        className={twMerge(
          'fixed right-auto bottom-auto z-50 m-0 max-h-[calc(100dvh-1rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-none border border-white/20 bg-neutral-900 p-1 text-white',
          className
        )}
        style={{ left: target.x, top: target.y }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            dismiss()
            trigger.current?.focus()
          }
        }}
      >
        <button
          type="button"
          role="menuitem"
          aria-disabled={Boolean(preparing)}
          className="flex w-full items-center gap-2 rounded-none px-3 py-2 text-left text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300 aria-disabled:opacity-50"
          onClick={() => {
            if (preparing) return
            const id = target.id
            dismiss()
            trigger.current?.focus()
            void useMatchDemoStore.getState().watch(id)
          }}
        >
          <Film className="size-4" aria-hidden />
          {t('demo.watch')}
        </button>
        <p className="px-3 py-2 text-xs text-neutral-300">{t('demo.retention')}</p>
      </div>
    ) : null
  }
}
