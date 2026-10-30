import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseCollections,
  parseCollectionQuote,
  validateCollectionBuy,
  validateCollectionId
} from '../src/shared/skin-collections.ts'

const skinId = '11111111-1111-4111-8111-111111111111'
const collection = {
  id: 'halloween',
  name: 'Halloween',
  description: '',
  imageUrl: 'https://example.test/cover.webp',
  videoUrl: null,
  published: true,
  featured: true,
  discountPercent: 20,
  skinIds: [skinId]
}
test('collection catalog and IPC reject unsafe media, identifiers and purchase inputs', () => {
  assert.equal(parseCollections([collection])[0].id, 'halloween')
  for (const imageUrl of [
    'javascript:alert(1)',
    'file:///tmp/x',
    'https://user:pass@example.test/x',
    'http://example.test/x'
  ])
    assert.throws(() => parseCollections([{ ...collection, imageUrl }]))
  for (const id of ['../../x', 'x;quit', 'UPPER', null, 123])
    assert.throws(() => validateCollectionId(id))
  assert.throws(() => parseCollections([{ ...collection, skinIds: [skinId, skinId] }]))
  assert.throws(() =>
    validateCollectionBuy({ currency: 'P_CASH', quoteHash: 'a'.repeat(64), requestKey: 'not-uuid' })
  )
})
test('quotes validate exact totals before checkout', () => {
  const quote = {
    collectionId: 'halloween',
    currency: 'P_CASH',
    discountPercent: 20,
    subtotal: 100,
    total: 80,
    items: [{ skinId, price: 80 }],
    quoteHash: 'a'.repeat(64)
  }
  assert.equal(parseCollectionQuote(quote).total, 80)
  assert.throws(() => parseCollectionQuote({ ...quote, total: 81 }))
  assert.throws(() => parseCollectionQuote({ ...quote, currency: 'USD' }))
  assert.throws(() =>
    parseCollectionQuote({
      ...quote,
      items: [...quote.items, ...quote.items],
      total: 160,
      subtotal: 200
    })
  )
})
