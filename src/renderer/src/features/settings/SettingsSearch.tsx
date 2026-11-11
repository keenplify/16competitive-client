import { useEffect, useRef, useState, type JSX, type RefObject } from 'react'
import { Search, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { useSettingsSearchStore } from './settings-search.store'

type SearchEntry = { heading: HTMLElement; label: string; text: string }
const normalize = (text: string): string =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

// Index the rendered labels/descriptions so runtime translations and helper-only
// settings stay in sync. Never inspect input values or persist this index.
function readSettings(content: HTMLElement): SearchEntry[] {
  const entries: SearchEntry[] = []
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  let current: SearchEntry | undefined
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (
      !parent ||
      parent.closest(
        'button, input, textarea, select, script, [hidden], [aria-hidden="true"], .sr-only'
      )
    )
      continue
    const heading = parent.closest<HTMLElement>('h2, h3, h4')
    if (heading && heading !== current?.heading) {
      current = { heading, label: heading.textContent?.trim() ?? '', text: '' }
      entries.push(current)
    }
    if (current) current.text += ` ${node.textContent ?? ''}`
  }
  return entries
}

export function SettingsSearch({
  contentRef,
  className
}: {
  contentRef: RefObject<HTMLDivElement | null>
  className?: string
}): JSX.Element {
  const { t, language } = useTranslation()
  const query = useSettingsSearchStore((state) => state.query)
  const setQuery = useSettingsSearchStore((state) => state.setQuery)
  const [entries, setEntries] = useState<SearchEntry[]>([])
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const typeToSearch = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1 ||
        !event.key.trim()
      )
        return
      const active = document.activeElement
      if (
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') ||
        (active instanceof HTMLElement &&
          (active.isContentEditable ||
            active.closest('input, textarea, select, [role="textbox"], [role="combobox"]')))
      )
        return
      event.preventDefault()
      setQuery(useSettingsSearchStore.getState().query + event.key)
      setOpen(true)
      input.current?.focus()
    }
    document.addEventListener('keydown', typeToSearch)
    return () => document.removeEventListener('keydown', typeToSearch)
  }, [setQuery])
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    let frame = 0
    const update = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setEntries(readSettings(content)))
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(content, { childList: true, subtree: true, characterData: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [contentRef, language])
  const words = normalize(query).split(' ').filter(Boolean)
  const results = words.length
    ? entries.filter((entry) => words.every((word) => normalize(entry.text).includes(word)))
    : []
  const expanded = open && words.length > 0
  const reveal = (entry: SearchEntry): void => {
    setOpen(false)
    entry.heading.tabIndex = -1
    entry.heading.scrollIntoView({ block: 'center', behavior: 'instant' })
    entry.heading.focus({ preventScroll: true })
  }
  return (
    <div
      className={twMerge('relative', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false)
          input.current?.focus()
        }
      }}
    >
      <label htmlFor="settings-search" className="mb-2 block text-sm font-medium">
        {t('settingsSearch.label')}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-3.5 left-3 size-4 text-neutral-400"
          aria-hidden="true"
        />
        <input
          ref={input}
          id="settings-search"
          type="search"
          autoComplete="off"
          className="h-11 w-full rounded-none border border-white/20 bg-neutral-900 pl-10 pr-12 text-sm text-white outline-none focus:border-sky-400"
          placeholder={t('settingsSearch.placeholder')}
          value={query}
          aria-expanded={expanded}
          aria-controls="settings-search-results"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) {
              event.preventDefault()
              reveal(results[0])
            }
            if (event.key === 'ArrowDown' && expanded) {
              event.preventDefault()
              document.querySelector<HTMLButtonElement>('#settings-search-results button')?.focus()
            }
          }}
        />
        <Button
          variant="ghost"
          className="absolute top-1 right-1 size-9 p-0"
          aria-label={t('settingsSearch.clear')}
          disabled={!query}
          onClick={() => {
            setQuery('')
            input.current?.focus()
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div
        id="settings-search-results"
        hidden={!expanded}
        className="absolute top-full right-0 left-0 z-40 mt-1 max-h-72 overflow-y-auto border border-white/20 bg-neutral-950 p-2 shadow-xl"
        data-i18n-skip
      >
        <p className="px-2 py-2 text-xs text-neutral-400" role="status">
          {results.length
            ? t('settingsSearch.count', { count: results.length })
            : t('settingsSearch.empty')}
        </p>
        {results.map((entry, index) => (
          <Button
            key={index}
            variant="ghost"
            className="h-auto min-h-10 w-full justify-start whitespace-normal text-left"
            onClick={() => reveal(entry)}
          >
            {entry.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
