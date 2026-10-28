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

async function harness({
  check = async () => 'rust',
  wait = async () => 'rust',
  createSetup,
  readiness = async () => ({ competitiveReady: false })
} = {}) {
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
          nativeHelperReadiness: readiness,
          createNativeHelperSetup: async () => createSetup?.(setup) ?? setup,
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

test('login opens onboarding for a missing or outdated helper, but skips a ready helper', async () => {
  for (const result of [null, 'outdated-rust', 'rust']) {
    const { store } = await harness({ check: async () => result })
    store.getState().syncAccount('player')
    await store.getState().checkNative()
    assert.equal(store.getState().onboardingOpen, result !== 'rust')
    assert.equal(store.getState().open, false)
    store.getState().close()
    store.getState().syncAccount('player')
    await store.getState().checkNative()
    assert.equal(store.getState().onboardingOpen, false, 'account refresh must respect dismissal')
  }
  const { store } = await harness({
    check: async () => {
      throw new Error('No handler')
    }
  })
  store.getState().syncAccount('player')
  await store.getState().checkNative()
  assert.equal(store.getState().onboardingOpen, true)
})

test('onboarding opens before a delayed helper check and stays closed after dismissal or logout', async () => {
  for (const cancel of ['close', 'logout']) {
    let finish
    const { store } = await harness({
      check: () =>
        new Promise((resolve) => {
          finish = resolve
        })
    })
    store.getState().syncAccount('player')
    assert.equal(
      store.getState().onboardingOpen,
      true,
      'onboarding appears before the helper check finishes'
    )
    const pending = store.getState().checkNative()
    if (cancel === 'logout') store.getState().syncAccount(null)
    else store.getState().close()
    finish(null)
    await pending
    assert.equal(store.getState().onboardingOpen, false)
    assert.equal(store.getState().status, 'idle')
  }
})

test('installing a helper advances onboarding to folder selection', async () => {
  let result = null
  const { store } = await harness({ check: async () => result })
  store.getState().syncAccount('player')
  await store.getState().checkNative()
  assert.equal(store.getState().nativeReady, false)
  store.getState().awaitInstall()
  // The next protocol check succeeds after the downloaded helper starts.
  result = 'rust'
  await store.getState().checkNative()
  assert.equal(store.getState().nativeReady, true)
  assert.equal(store.getState().onboardingOpen, true)
  store.getState().close()
  assert.equal(store.getState().onboardingOpen, false)
})

test('only an explicit search attaches a queue continuation to the helper prompt', async () => {
  const { store } = await harness({ check: async () => null })
  store.getState().syncAccount('player')
  await store.getState().checkNative()
  assert.equal(store.getState().onContinue, null)
  const beginQueue = () => {}
  store.getState().show(beginQueue)
  assert.equal(store.getState().onContinue, beginQueue)
  store.getState().close()
  assert.equal(store.getState().onContinue, null)
  store.getState().show(beginQueue)
  store.getState().syncAccount(null)
  assert.equal(store.getState().onContinue, null)
})

test('login prompt renders across lobby pages and never queues without an explicit search', async () => {
  const exports = {}
  let web = true
  let accountId = 'player'
  let page = 'lobby'
  let continuation = null
  let queued = 0
  const source = ts.transpileModule(
    await readFile(
      new URL('../src/renderer/src/features/matchmaking/WebHelperController.tsx', import.meta.url),
      'utf8'
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX
      }
    }
  ).outputText
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === 'react') return { useEffect: () => {}, useRef: (current) => ({ current }) }
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) }
      if (name === '../../web-runtime') return { isWebRuntime: () => web }
      if (name === '../auth/auth.store')
        return {
          useAuthStore: (select) =>
            select({ session: accountId ? { player: { id: accountId } } : null })
        }
      if (name === '../navigation/navigation.store')
        return { useNavigationStore: (select) => select({ page }) }
      if (name === './web-helper-prompt.store')
        return { useWebHelperPromptStore: (select) => select({ onContinue: continuation }) }
      if (name === '../i18n/i18n') return { useTranslation: () => ({ t: (key) => key }) }
      if (name === './WebHelperPrompt') return { WebHelperPrompt: 'helper-prompt' }
      return {}
    }
  })
  for (page of ['lobby', 'settings', 'play']) {
    const dialog = exports.WebHelperController()
    assert.equal(dialog.type, 'helper-prompt')
    dialog.props.onContinue()
    assert.equal(queued, 0, 'Not now must leave the current page without queuing')
  }
  continuation = () => {
    queued++
  }
  exports.WebHelperController().props.onContinue()
  assert.equal(queued, 1)
  page = 'settings'
  exports.WebHelperController().props.onContinue()
  assert.equal(queued, 1, 'leaving Play must not use a previous queue continuation')
  accountId = null
  assert.equal(exports.WebHelperController(), null)
  accountId = 'player'
  web = false
  assert.equal(exports.WebHelperController(), null)
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

test('verified helper remains ready while optional game runtime is unavailable', async () => {
  const { store } = await harness({
    readiness: async () => {
      throw new Error('Game runtime is still downloading')
    }
  })
  store.getState().show()
  await store.getState().prepareSetup()
  assert.equal(store.getState().status, 'rust')
  assert.equal(store.getState().nativeReady, true)
  assert.equal(store.getState().competitiveReady, false)
  assert.equal(store.getState().setupOpen, false)
})

test(
  'Linux setup runs the newest numbered download instead of a stale original',
  { skip: process.platform === 'win32' },
  async () => {
    let done
    const waiting = new Promise((resolve) => {
      done = resolve
    })
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
  }
)

test(
  'Linux ARM64 setup runs the ARM64 download',
  { skip: process.platform === 'win32' },
  async () => {
    let done
    const waiting = new Promise((resolve) => {
      done = resolve
    })
    const { store, setup } = await harness({ wait: () => waiting })
    const directory = await mkdtemp(join(tmpdir(), 'native-helper-arm-download-'))
    try {
      await writeFile(
        join(directory, 'competitive16-web-helper-linux'),
        '#!/bin/sh\nprintf "x64\\n"\n'
      )
      await writeFile(
        join(directory, 'competitive16-web-helper-linux-arm64'),
        '#!/bin/sh\nprintf "arm64:%s\\n" "$1"\n'
      )
      const pending = store.getState().prepareSetup('arm64')
      await new Promise((resolve) => setImmediate(resolve))
      const command = store.getState().setupCommand.replace('cd ~/Downloads', `cd '${directory}'`)
      const result = spawnSync('bash', ['-c', command], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout.trim(), `arm64:${setup.checkUrl}`)
      store.getState().closeSetup()
      done('rust')
      await pending
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)

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

test('copying a Linux setup command renews its short-lived handoff', async () => {
  let handoff = 0
  const { store } = await harness({
    wait: () => new Promise(() => {}),
    createSetup: (setup) => {
      handoff++
      const url = new URL(setup.checkUrl)
      url.searchParams.set('handoff', String(handoff).repeat(43))
      return {
        ...setup,
        checkUrl: url.href
      }
    }
  })
  await Promise.race([
    store.getState().prepareSetup(),
    new Promise((resolve) => setImmediate(resolve))
  ])
  const first = store.getState().setupCommand
  const fresh = await store.getState().renewSetupCommand()
  assert.notEqual(fresh, first)
  assert.equal(store.getState().setupCommand, fresh)
  assert.equal(store.getState().setupOpen, true)
  store.getState().closeSetup()
})

test('web helper update assets are signed with a distinct context and pinned key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-helper-signing-'))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  try {
    for (const asset of [
      'competitive16-web-helper.exe',
      'competitive16-web-helper-linux',
      'competitive16-web-helper-linux-arm64'
    ])
      await writeFile(join(directory, asset), 'fixture-binary')
    const paths = await signWebHelperUpdates(
      directory,
      directory,
      '2026.1027.4',
      privateKey,
      publicKey
    )
    assert.equal(paths.length, 3)
    for (const path of paths) {
      const envelope = JSON.parse(await readFile(path, 'utf8'))
      assert.equal(
        JSON.parse(envelope.manifest).arch,
        path.endsWith('-arm64.update.json') ? 'arm64' : 'x64'
      )
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
