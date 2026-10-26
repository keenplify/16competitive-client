const TIMESTAMP_GAP_MS = 5 * 60_000

const sameLocalDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

/** Separate message groups after a pause or a local calendar-day boundary. */
export function showChatTimestamp(sentAt: string, previousSentAt?: string): boolean {
  const current = new Date(sentAt)
  if (!Number.isFinite(current.getTime())) return false
  const previous = new Date(previousSentAt ?? '')
  if (!Number.isFinite(previous.getTime()) || !sameLocalDay(current, previous)) return true
  const gap = current.getTime() - previous.getTime()
  return gap < 0 || gap >= TIMESTAMP_GAP_MS
}

/** Use the viewer's local calendar and clock, including daylight-saving changes. */
export function formatChatTimestamp(
  sentAt: string,
  language: string,
  now = new Date()
): { label: string; full: string } | null {
  const date = new Date(sentAt)
  if (!Number.isFinite(date.getTime())) return null
  const locale = language === 'tl' ? 'fil-PH' : language
  let time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date)
  if (language === 'en') time = time.toLowerCase()
  const full = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
  if (sameLocalDay(date, now)) return { label: time, full }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameLocalDay(date, yesterday)) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day')
    const day = relative.charAt(0).toLocaleUpperCase(locale) + relative.slice(1)
    return { label: `${day}, ${time}`, full }
  }
  return { label: full, full }
}
