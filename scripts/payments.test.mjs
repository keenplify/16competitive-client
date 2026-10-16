import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parsePaymentOrder,
  parsePaymentSnapshot,
  validatePaymentAmount,
  PCASH_PER_USDT
} from '../src/shared/payments.ts'

const order = {
  id: '12345678-1234-1234-1234-123456789abc',
  amount: 10,
  pCashAmount: 1000,
  status: 'PENDING',
  providerStatus: 'Pending',
  createdAt: new Date().toISOString(),
  checkoutUrl: 'https://app.paymento.io/gateway?token=0123456789abcdef0123456789abcdef'
}
test('whole USDT minimum and 100 P-Cash per USDT', () => {
  assert.equal(PCASH_PER_USDT, 100)
  for (const amount of [1, 5, 10, 50, 100, 200, 300, 400, 500, 10000])
    assert.equal(validatePaymentAmount(amount), amount)
  for (const amount of [0, -1, 1.05, 1.25, '1', 10001, Infinity, NaN, null])
    assert.throws(() => validatePaymentAmount(amount))
})
test('checkout URLs only open the Paymento HTTPS gateway', () => {
  assert.deepEqual(parsePaymentOrder(order), order)
  for (const checkoutUrl of [
    'javascript:alert(1)',
    'https://app.paymento.io.evil.test/gateway?token=0123456789abcdef',
    'http://app.paymento.io/gateway?token=0123456789abcdef',
    'https://app.paymento.io/elsewhere?token=0123456789abcdef',
    'https://user:pass@app.paymento.io/gateway?token=0123456789abcdef',
    `${order.checkoutUrl}&redirect=https://evil.test`,
    `${order.checkoutUrl}&token=0123456789abcdef`
  ]) {
    assert.throws(() => parsePaymentOrder({ ...order, checkoutUrl }))
  }
})
test('wallet and order snapshots reject malformed backend data', () => {
  assert.equal(
    parsePaymentSnapshot({ enabled: true, pCash: 1000, orders: [order] }).orders.length,
    1
  )
  for (const patch of [
    { status: 'FAKE' },
    { pCashAmount: 1.5 },
    { pCashAmount: -1 },
    { createdAt: 'no' },
    { checkoutUrl: undefined }
  ]) {
    assert.throws(() => parsePaymentOrder({ ...order, ...patch }))
  }
  for (const pCash of [-1, 1.5, '100', Infinity])
    assert.throws(() => parsePaymentSnapshot({ enabled: true, pCash, orders: [] }))
})
