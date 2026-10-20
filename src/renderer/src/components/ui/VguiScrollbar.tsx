import { useEffect, useId, useRef, useState, type JSX, type RefObject } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from '../../features/i18n/i18n'

/** Native scrolling with VGUI chrome, independent of OS scrollbar rendering. */
export function VguiScrollbar({
  contentRef
}: {
  contentRef: RefObject<HTMLDivElement | null>
}): JSX.Element {
  const { t } = useTranslation()
  const scrollId = useId()
  const [controls, setControls] = useState(scrollId)
  const viewport = useRef<HTMLElement | null>(null)
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; top: number } | null>(null)
  const [metrics, setMetrics] = useState({ top: 0, height: 1, total: 1, trackHeight: 1 })
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    let pending = 0
    let current: HTMLElement | null = null
    const measure = (): void => {
      pending = 0
      const target = content.querySelector<HTMLElement>('[data-page-scroll="settings"]') ?? content
      if (target !== current) {
        current?.classList.remove('vgui-scroll-target')
        current?.removeEventListener('scroll', schedule)
        current = target
        if (!target.id) target.id = scrollId
        setControls(target.id)
        viewport.current = target
        target.classList.add('vgui-scroll-target')
        target.addEventListener('scroll', schedule, { passive: true })
      }
      setMetrics({
        top: target.scrollTop,
        height: target.clientHeight,
        total: target.scrollHeight,
        trackHeight: track.current?.clientHeight ?? 1
      })
    }
    const schedule = (): void => {
      if (!pending) pending = requestAnimationFrame(measure)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(content)
    if (track.current) resize.observe(track.current)
    const settingsBody = content.querySelector('[data-page-scroll="settings"]')?.firstElementChild
    if (settingsBody) resize.observe(settingsBody)
    if (content.firstElementChild) resize.observe(content.firstElementChild)
    const mutations = new MutationObserver(schedule)
    mutations.observe(content, { childList: true, subtree: true, characterData: true })
    content.addEventListener('load', schedule, true)
    measure()
    return () => {
      cancelAnimationFrame(pending)
      resize.disconnect()
      mutations.disconnect()
      content.removeEventListener('load', schedule, true)
      current?.removeEventListener('scroll', schedule)
      current?.classList.remove('vgui-scroll-target')
    }
  }, [contentRef, scrollId])

  const range = Math.max(0, metrics.total - metrics.height)
  const ratio = Math.min(
    1,
    Math.max(24 / Math.max(1, metrics.trackHeight), metrics.height / Math.max(1, metrics.total))
  )
  const scroll = (amount: number): void =>
    viewport.current?.scrollBy({ top: amount, behavior: 'instant' })
  return (
    <div className="vgui-scrollbar" style={{ visibility: range > 0 ? 'visible' : 'hidden' }}>
      <button type="button" aria-label={t('theme.scrollUp')} onClick={() => scroll(-48)}>
        <ChevronUp size={12} aria-hidden="true" />
      </button>
      <div
        ref={track}
        className="vgui-scrollbar-track"
        role="scrollbar"
        aria-label={t('theme.scroll')}
        aria-orientation="vertical"
        aria-controls={controls}
        aria-valuemin={0}
        aria-valuemax={range}
        aria-valuenow={Math.round(metrics.top)}
        tabIndex={range > 0 ? 0 : -1}
        onKeyDown={(event) => {
          const amounts: Record<string, number> = {
            ArrowUp: -48,
            ArrowDown: 48,
            PageUp: -metrics.height,
            PageDown: metrics.height,
            Home: -metrics.total,
            End: metrics.total
          }
          if (event.key in amounts) {
            event.preventDefault()
            scroll(amounts[event.key])
          }
        }}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return
          const bounds = event.currentTarget.firstElementChild?.getBoundingClientRect()
          if (!bounds) return
          scroll(event.clientY < bounds.top ? -metrics.height : metrics.height)
        }}
      >
        <div
          className="vgui-scrollbar-thumb"
          style={{
            height: `${ratio * 100}%`,
            top: `${(((1 - ratio) * metrics.top) / Math.max(1, range)) * 100}%`
          }}
          onPointerDown={(event) => {
            drag.current = { y: event.clientY, top: viewport.current?.scrollTop ?? 0 }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (!drag.current || !track.current || !viewport.current) return
            const height = track.current.clientHeight
            viewport.current.scrollTo({
              top:
                drag.current.top +
                ((event.clientY - drag.current.y) * range) / Math.max(1, height * (1 - ratio)),
              behavior: 'instant'
            })
          }}
          onPointerUp={() => {
            drag.current = null
          }}
          onLostPointerCapture={() => {
            drag.current = null
          }}
        />
      </div>
      <button type="button" aria-label={t('theme.scrollDown')} onClick={() => scroll(48)}>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
    </div>
  )
}
