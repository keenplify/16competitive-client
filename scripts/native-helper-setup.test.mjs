/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, mkdtemp, writeFile, rm, utimes } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { generateKeyPairSync, verify } from 'node:crypto'
import { signWebHelperUpdates } from './sign-web-helper-update.mjs'
import { create } from 'zustand'
import {
  parseWebHelperCheckLink,
  webHelperCheckUrl,
  WEB_NATIVE_HELPER_PROTOCOL
} from '../src/shared/web-helper-link.ts'

const token = 'a'.repeat(43)
const origin = 'https://16competitive.papamo.dev'
const localSettings = { port: 51000, token: 'a'.repeat(64), origin }

test('native setup links validate complete local capabilities and reject added fields', () => {
  const url = webHelperCheckUrl(
    { apiOrigin: origin, handoff: token, localSettings },
    false,
    WEB_NATIVE_HELPER_PROTOCOL
  )
  assert.deepEqual(parseWebHelperCheckLink(url, false, WEB_NATIVE_HELPER_PROTOCOL), {
    apiOrigin: origin,
    handoff: token,
    localSettings
  })
  for (const suffix of ['&localToken=duplicate', '&command=exec', '&localPort=1'])
    assert.equal(parseWebHelperCheckLink(url + suffix, false, WEB_NATIVE_HELPER_PROTOCOL), null)
  const partial = new URL(url)
  partial.searchParams.delete('webOrigin')
  assert.equal(parseWebHelperCheckLink(partial.href, false, WEB_NATIVE_HELPER_PROTOCOL), null)
  assert.throws(() =>
    webHelperCheckUrl(
      { apiOrigin: origin, handoff: token, localSettings: { ...localSettings, port: 80 } },
      false,
      WEB_NATIVE_HELPER_PROTOCOL
    )
  )
})

async function harness({ check = async () => 'rust', wait = async () => 'rust' } = {}) {
  const exports = {}
  const calls = []
  const source = ts.transpileModule(
    await readFile(
      new URL(
        '../src/renderer/src/features/matchmaking/web-helper-prompt.store.ts',
        import.meta.url
      ),
      'utf8'
    ),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
  ).outputText
  const setup = {
    checkUrl: webHelperCheckUrl(
      { apiOrigin: origin, handoff: token, localSettings },
      false,
      WEB_NATIVE_HELPER_PROTOCOL
    ),
    expiresAt: new Date(Date.now() + 120_000).toISOString()
  }
  vm.runInNewContext(source, {
    exports,
    Date,
    URL,
    require: () => ({ create }),
    window: {
      api: {
        matchmaking: {
          checkLocalLauncher: async (target) => {
            calls.push(target)
            return check()
          },
          createNativeHelperSetup: async () => setup,
          waitForNativeHelperSetup: wait,
          cancelNativeHelperSetup: () => calls.push('cancel')
        }
      }
    }
  })
  return { store: exports.useWebHelperPromptStore, calls, setup }
}

test('login and each later Play check probe native helper without using saved suppression', async () => {
  const { store, calls } = await harness()
  store.getState().syncAccount('player')
  await store.getState().checkNative()
  assert.equal(calls.filter((value) => value === 'rust').length, 1)
  store.getState().syncAccount('player') // Account refresh does not count as a login.
  await store.getState().checkNative()
  await store.getState().checkNative()
  assert.equal(calls.filter((value) => value === 'rust').length, 3)
  store.getState().syncAccount(null)
  assert.equal(store.getState().nativeReady, false)
})

test('successful terminal verification closes instructions and upsell, emitting one success', async () => {
  let done
  const waiting = new Promise((resolve) => {
    done = resolve
  })
  const { store, setup } = await harness({ wait: () => waiting })
  store.getState().show()
  const pending = store.getState().prepareSetup()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(store.getState().setupOpen, true)
  assert.ok(store.getState().setupCommand.includes(`'${setup.checkUrl}'`))
  done('rust')
  await pending
  assert.equal(store.getState().open, false)
  assert.equal(store.getState().setupOpen, false)
  assert.equal(store.getState().nativeReady, true)
  assert.equal(store.getState().successSequence, 1)
})

test('Linux setup runs the newest numbered download instead of a stale original', async () => {
  let done
  const waiting = new Promise((resolve) => { done = resolve })
  const { store, setup } = await harness({ wait: () => waiting })
  const directory = await mkdtemp(join(tmpdir(), 'native-helper-downloads-'))
  try {
    const old = join(directory, 'competitive16-web-helper-linux')
    const current = join(directory, 'competitive16-web-helper-linux(2)')
    await writeFile(old, '#!/bin/sh\nprintf "old:%s\\n" "$1"\n')
    await writeFile(current, '#!/bin/sh\nprintf "current:%s\\n" "$1"\n')
    await utimes(old, new Date(1_700_000_000_000), new Date(1_700_000_000_000))
    await utimes(current, new Date(1_800_000_000_000), new Date(1_800_000_000_000))
    const pending = store.getState().prepareSetup()
    await new Promise((resolve) => setImmediate(resolve))
    const command = store.getState().setupCommand.replace('cd ~/Downloads', `cd '${directory}'`)
    const result = spawnSync('bash', ['-c', command], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), `current:${setup.checkUrl}`)
    store.getState().closeSetup()
    done('rust')
    await pending
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('logout or cancellation ignores late native setup verification', async () => {
  let done
  const waiting = new Promise((resolve) => {
    done = resolve
  })
  const { store } = await harness({ wait: () => waiting })
  store.getState().show()
  const pending = store.getState().prepareSetup()
  await new Promise((resolve) => setImmediate(resolve))
  store.getState().close()
  done('rust')
  await pending
  assert.equal(store.getState().successSequence, 0)
  assert.equal(store.getState().nativeReady, false)
})

test('outdated native helper does not claim setup success', async () => {
  const { store } = await harness({ wait: async () => 'outdated-rust' })
  store.getState().show()
  await store.getState().prepareSetup()
  assert.equal(store.getState().setupOpen, true)
  assert.equal(store.getState().open, true)
  assert.equal(store.getState().status, 'outdated-rust')
  assert.equal(store.getState().successSequence, 0)
})

test('web helper update assets are signed with a distinct context and pinned key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-helper-signing-'))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  try {
    for (const asset of ['competitive16-web-helper.exe', 'competitive16-web-helper-linux'])
      await writeFile(join(directory, asset), 'fixture-binary')
    const paths = await signWebHelperUpdates(
      directory,
      directory,
      '2026.1027.4',
      privateKey,
      publicKey
    )
    assert.equal(paths.length, 2)
    for (const path of paths) {
      const envelope = JSON.parse(await readFile(path, 'utf8'))
      assert.ok(
        verify(
          null,
          Buffer.from('16competitive.web-helper.update.v1\n' + envelope.manifest),
          publicKey,
          Buffer.from(envelope.signature, 'base64')
        )
      )
      assert.equal(
        verify(
          null,
          Buffer.from(envelope.manifest),
          publicKey,
          Buffer.from(envelope.signature, 'base64')
        ),
        false
      )
    }
    const other = generateKeyPairSync('ed25519')
    await assert.rejects(
      signWebHelperUpdates(directory, directory, '2026.1027.4', privateKey, other.publicKey),
      /pinned key/
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
