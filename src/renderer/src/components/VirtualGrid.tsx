import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import { useVirtualScroller } from 'virtual-scroller/react'

type GridItem = { id: string }
interface VirtualGridProps<Item extends GridItem> {
  items: Item[]
  renderItem: (item: Item) => ReactNode
  scrollContainerId: string
  className?: string
}

const itemId = (item: GridItem): string => item.id
const estimatedHeight = (): number => 360

/** Shares the page's scroll area; only visible rows and the library's buffer mount. */
export function VirtualGrid<Item extends GridItem>({
  items,
  renderItem,
  scrollContainerId,
  className
}: VirtualGridProps<Item>): ReactNode {
  const id = useId()
  // Reveal bounded pages as the user approaches the end. This avoids the
  // variable-height library measuring an entire catalog after a scrollbar jump.
  const [loadedCount, setLoadedCount] = useState(48)
  const sentinel = useRef<HTMLDivElement>(null)
  const loadedItems = useMemo(() => items.slice(0, loadedCount), [items, loadedCount])
  const { state, style, itemsContainerRef, virtualScroller } = useVirtualScroller<Item>({
    items: loadedItems,
    getItemId: itemId,
    getEstimatedItemHeight: estimatedHeight,
    getScrollableContainer: () => document.getElementById(scrollContainerId)!,
    getColumnsCount: () => {
      const grid = document.getElementById(id)
      if (!grid) return 1
      const columns = getComputedStyle(grid).gridTemplateColumns
      return columns === 'none' ? 1 : columns.split(' ').length
    }
  })
  const { firstShownItemIndex, lastShownItemIndex } = state
  const visible = state.items.slice(firstShownItemIndex, lastShownItemIndex + 1)
  useLayoutEffect(() => {
    const end = sentinel.current
    const root = document.getElementById(scrollContainerId)
    if (!end || !root || loadedCount >= items.length) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setLoadedCount((count) => Math.min(items.length, count + 48))
      },
      { root, rootMargin: '600px 0px' }
    )
    observer.observe(end)
    return () => observer.disconnect()
  }, [loadedCount, items.length, scrollContainerId])

  useLayoutEffect(() => {
    const grid = document.getElementById(id)
    if (!grid) return
    const heights = new Map<Element, number>()
    const entries = new Map([...grid.children].map((element, index) => [element, visible[index]]))
    let width = grid.getBoundingClientRect().width
    const observer = new ResizeObserver((changes) => {
      for (const change of changes) {
        if (change.target === grid) {
          if (Math.abs(width - change.contentRect.width) > 0.5) {
            width = change.contentRect.width
            virtualScroller.updateLayout()
          }
          continue
        }
        const previous = heights.get(change.target)
        const next = change.contentRect.height
        heights.set(change.target, next)
        const item = entries.get(change.target)
        if (item && previous !== undefined && Math.abs(previous - next) > 0.5) {
          virtualScroller.onItemHeightDidChange(item)
        }
      }
    })
    observer.observe(grid)
    for (const element of entries.keys()) observer.observe(element)
    return () => observer.disconnect()
  }, [id, state.items, firstShownItemIndex, lastShownItemIndex, virtualScroller, scrollContainerId])

  return (
    <>
      <section
        id={id}
        ref={itemsContainerRef}
        style={style}
        className={twMerge('grid min-w-0 gap-4', className)}
        data-virtual-grid
        data-total-items={items.length}
        data-loaded-items={loadedItems.length}
      >
        {visible.map((item) => (
          <div
            key={item.id}
            className="virtual-grid-item min-w-0 [&>*]:h-full"
            data-item-id={item.id}
          >
            {renderItem(item)}
          </div>
        ))}
      </section>
      <div ref={sentinel} className="h-px" aria-hidden="true" />
    </>
  )
}
