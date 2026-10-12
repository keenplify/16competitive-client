import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseManualConnectionDetails, manualConnectionCommand } from '../src/shared/matchmaking.ts'

const connection = {
  host: '192.0.2.1',
  port: 27016,
  password: 'a'.repeat(22),
  manualToken: `m_${'b'.repeat(22)}`
}

test('accepts compact manual credentials and preserves older live matches', () => {
  assert.deepEqual(parseManualConnectionDetails(connection), connection)
  const legacy = { ...connection, password: 'a'.repeat(32), manualToken: `m_${'b'.repeat(48)}` }
  assert.deepEqual(parseManualConnectionDetails(legacy), legacy)
  assert.equal(
    manualConnectionCommand(connection),
    `setinfo "_16c" "${connection.manualToken}"; password "${connection.password}"; connect 192.0.2.1:27016`
  )
})

test('rejects numeric short codes, malformed lengths and command injection', () => {
  for (const manualToken of [
    'm_12345678',
    `m_${'a'.repeat(21)}`,
    `m_${'a'.repeat(23)}`,
    'm_";quit'
  ]) {
    assert.throws(() => parseManualConnectionDetails({ ...connection, manualToken }))
  }
})

test('compact manual token and password fit the affected repack userinfo without dropping player fields', () => {
  const fields = [
    ['_cl_autowepswitch', '1'],
    ['bottomcolor', '6'],
    ['cl_dlmax', '512'],
    ['cl_lc', '1'],
    ['cl_lw', '1'],
    ['model', 'gordon'],
    ['name', '[FREE-USER]OlagueR'],
    ['topcolor', '30'],
    ['_vgui_menus', '1'],
    ['_ah', '1'],
    ['lefthand', '1'],
    ['_pw', 'olgPH'],
    ['cl_updaterate', '101'],
    ['rate', '20000'],
    ['hwp', '1']
  ]
  const baseline = fields.reduce((size, [key, value]) => size + key.length + value.length + 2, 0)
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const credentialsSize = (token, password) =>
    '_16c'.length + token.length + 'password'.length + password.length + 4
  assert.ok(baseline + credentialsSize(`m_${'a'.repeat(48)}`, 'a'.repeat(32)) >= 256)
  assert.ok(baseline + credentialsSize(connection.manualToken, connection.password) < 256)
})
