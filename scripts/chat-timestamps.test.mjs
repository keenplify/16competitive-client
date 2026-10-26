import assert from 'node:assert/strict'
import test from 'node:test'
import { formatChatTimestamp, showChatTimestamp } from '../src/shared/chat-timestamps.ts'

// Calendar-day cases run in a zone with daylight-saving changes.
process.env.TZ = 'America/New_York'

test('today shows time; yesterday shows the day label above its time; older messages show a date', () => {
  const now = new Date(2026, 9, 27, 5, 30)
  assert.equal(
    formatChatTimestamp(new Date(2026, 9, 27, 5, 23).toISOString(), 'en', now).label,
    '5:23 am'
  )
  assert.equal(
    formatChatTimestamp(new Date(2026, 9, 26, 20, 0).toISOString(), 'en', now).label,
    'Yesterday, 8:00 pm'
  )
  const old = formatChatTimestamp(new Date(2025, 9, 26, 20, 0).toISOString(), 'en', now)
  assert.match(old.label, /2025/)
  assert.equal(old.label, old.full)
})

test('yesterday follows the local calendar across midnight and the DST transition', () => {
  const midnight = new Date(2026, 9, 27, 0, 1)
  assert.equal(
    formatChatTimestamp(new Date(2026, 9, 26, 23, 59).toISOString(), 'en', midnight).label,
    'Yesterday, 11:59 pm'
  )
  const afterDST = new Date(2026, 10, 1, 23, 30)
  const previousDay = new Date(2026, 9, 31, 23, 45)
  assert.ok(afterDST.getTime() - previousDay.getTime() > 24 * 60 * 60_000)
  assert.equal(
    formatChatTimestamp(previousDay.toISOString(), 'en', afterDST).label,
    'Yesterday, 11:45 pm'
  )
})

test('every supported language uses localized date and time labels', () => {
  const now = new Date(2026, 9, 27, 5, 30),
    sentAt = new Date(2026, 9, 26, 20).toISOString()
  for (const language of ['en', 'ru', 'tl', 'th', 'id', 'hi', 'pt', 'ja']) {
    const result = formatChatTimestamp(sentAt, language, now)
    assert.ok(result.label.length > 0)
    assert.ok(result.full.length > 0)
    if (language !== 'en') assert.ok(!result.label.includes('Yesterday'))
  }
})

test('timestamps separate the first message, five-minute pauses and local day changes', () => {
  const start = new Date(2026, 9, 27, 5, 23).toISOString()
  assert.equal(showChatTimestamp(start), true)
  assert.equal(showChatTimestamp(start, 'invalid'), true)
  assert.equal(showChatTimestamp(new Date(2026, 9, 27, 5, 27, 59).toISOString(), start), false)
  assert.equal(showChatTimestamp(new Date(2026, 9, 27, 5, 28).toISOString(), start), true)
  assert.equal(
    showChatTimestamp(
      new Date(2026, 9, 27, 0, 1).toISOString(),
      new Date(2026, 9, 26, 23, 59).toISOString()
    ),
    true
  )
  assert.equal(showChatTimestamp('invalid', start), false)
  assert.equal(formatChatTimestamp('invalid', 'en'), null)
})
