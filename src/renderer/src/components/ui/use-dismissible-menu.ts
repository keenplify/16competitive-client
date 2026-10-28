import { useEffect, type RefObject } from 'react'

/** Dismiss a floating menu for any interaction outside its own surface. */
export function useDismissibleMenu(
  open: boolean,
  menuRef: RefObject<HTMLElement | null>,
  dismiss: () => void
): void {
  useEffect(() => {
    if (!open) return undefined

    const outside = (event: Event): void => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) dismiss()
    }
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('contextmenu', outside, true)
    document.addEventListener('keydown', keydown)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('contextmenu', outside, true)
      document.removeEventListener('keydown', keydown)
      window.removeEventListener('resize', dismiss)
    }
  }, [open, menuRef, dismiss])
}
