/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestNativeHelperSettings } from '../src/renderer/src/features/settings/native-helper-request.ts'

const settings = { cs16FolderPath: '/games/cstrike' }

test('expired helper bridge reconnects before opening the folder picker once', async () => {
  const actions = []
  let reads = 0
  const result = await requestNativeHelperSettings(
    { action: 'choose', game: 'cs16' },
    async (request) => {
      actions.push(request.action)
      if (request.action === 'get' && ++reads < 3) throw new Error('Bridge closed')
      return settings
    },
    async () => {
      actions.push('reconnect')
      return 'rust'
    },
    async () => undefined
  )
  assert.equal(result, settings)
  assert.deepEqual(actions, ['get', 'reconnect', 'get', 'get', 'choose'])
})

test('helper mutation failures are never retried', async () => {
  const actions = []
  await assert.rejects(
    requestNativeHelperSettings(
      { action: 'save', settings: {} },
      async (request) => {
        actions.push(request.action)
        if (request.action === 'save') throw new Error('Invalid folder')
        return settings
      },
      async () => {
        actions.push('reconnect')
        return 'rust'
      }
    ),
    /Invalid folder/
  )
  assert.deepEqual(actions, ['get', 'save'])
})

test('a failed reconnect does not open the picker', async () => {
  const actions = []
  await assert.rejects(
    requestNativeHelperSettings(
      { action: 'choose', game: 'cs13' },
      async (request) => {
        actions.push(request.action)
        throw new Error('Bridge closed')
      },
      async () => {
        actions.push('reconnect')
        return 'unavailable'
      }
    ),
    /Bridge closed/
  )
  assert.deepEqual(actions, ['get', 'reconnect'])
})
