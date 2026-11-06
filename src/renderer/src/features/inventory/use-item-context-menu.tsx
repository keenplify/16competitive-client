import {
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import type { LucideIcon } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { useDismissibleMenu } from '../../components/ui/use-dismissible-menu'

export function useItemContextMenu(
  label: string,
  action: () => void,
  disabled = false,
  className?: string,
  additionalActions: {
    label: string
    action: () => void
    disabled?: boolean
    icon?: LucideIcon
  }[] = [],
  icon?: LucideIcon
): {
  menu: JSX.Element | null
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
} {
  const actions = [{ label, action, disabled, icon }, ...additionalActions].filter(
    (item) => !item.disabled
  )
  const [target, setTarget] = useState<{ id: string; x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
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
    if (!actions.length) return
    trigger.current = element
    setTarget({
      id,
      x,
      y
    })
  }
  return {
    onContextMenu: (event) => {
      event.preventDefault()
      show(event.currentTarget, '', event.clientX, event.clientY)
    },
    onKeyDown: (event) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      show(event.currentTarget, '', rect.left, rect.bottom)
    },
    menu: target ? (
      <div
        ref={ref}
        popover="manual"
        role="menu"
        aria-label={label}
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
        {actions.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-none px-3 py-2 text-left text-sm text-neutral-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300"
            onClick={() => {
              dismiss()
              trigger.current?.focus()
              item.action()
            }}
          >
            {item.icon && <item.icon className="size-4 shrink-0 text-sky-300" aria-hidden="true" />}
            {item.label}
          </button>
        ))}
      </div>
    ) : null
  }
}
