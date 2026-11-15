/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatLocalMinor,
  formatPCashPair,
  localMinorToPcash,
  parseCommunityCurrency,
  parsePCashBetCurrency,
  pcashToLocalMinor
} from '../src/shared/community-currency.ts'

test('conversions mirror the backend: 1 PCash = 4.00 PHP', () => {
  assert.equal(localMinorToPcash(2000, 4_000_000), 5) // ₱20 -> 5 PCash
  assert.equal(pcashToLocalMinor(350, 4_000_000), 140000) // 350 PCash -> ₱1,400.00
  assert.equal(pcashToLocalMinor(1, 4_000_000), 400)
})

test('rounding is half up and local amounts stay capped at 2 decimals', () => {
  assert.equal(localMinorToPcash(2000, 3_500_000), 6) // ₱20 at 3.50/PCash -> 5.714 -> 6
  assert.equal(pcashToLocalMinor(6, 3_500_000), 2100) // back to ₱21.00
  assert.equal(localMinorToPcash(100, 3_500_000), 0) // ₱1 rounds to 0 PCash
})

test('formatting shows the symbol, thousands separators and exactly 2 decimals', () => {
  assert.equal(formatLocalMinor(140000, '₱', 'en'), '₱1,400.00')
  assert.equal(formatLocalMinor(10025, '₱', 'en'), '₱100.25')
  assert.deepEqual(formatPCashPair(350, { symbol: '₱', localPerPcashMicros: 4_000_000 }, 'en'), {
    primary: '₱1,400.00',
    secondary: '350 PCash'
  })
})

test('member payloads parse strictly and reject garbage', () => {
  const member = {
    code: 'PHP',
    symbol: '₱',
    name: 'Philippine Peso',
    prioritizeLocal: true,
    localPerPcashMicros: 4_000_000
  }
  assert.deepEqual(parseCommunityCurrency(member), member)
  assert.equal(parseCommunityCurrency(null), null)
  assert.throws(() => parseCommunityCurrency({ ...member, code: 'VERYLONG' }))
  assert.throws(() => parseCommunityCurrency({ ...member, localPerPcashMicros: 0 }))
  assert.throws(() => parseCommunityCurrency({ ...member, prioritizeLocal: 'yes' }))
  assert.throws(() => parseCommunityCurrency({ ...member, symbol: '' }))
})

test('bet payloads validate presets and the custom gate', () => {
  const bet = {
    code: 'PHP',
    symbol: '₱',
    name: 'Philippine Peso',
    prioritizeLocal: false,
    localPerPcashMicros: 4_000_000,
    presets: [{ localMinor: 2000, pcash: 5 }],
    custom: { enabled: true }
  }
  assert.equal(parsePCashBetCurrency(bet).presets.length, 1)
  assert.equal(parsePCashBetCurrency(null), null)
  assert.throws(() => parsePCashBetCurrency({ ...bet, presets: 'nope' }))
  assert.throws(() => parsePCashBetCurrency({ ...bet, presets: [{ localMinor: 1.5, pcash: 5 }] }))
  assert.throws(() =>
    parsePCashBetCurrency({ ...bet, presets: [{ localMinor: 2000, pcash: 2_000_000 }] })
  )
  assert.throws(() => parsePCashBetCurrency({ ...bet, custom: null }))
})
