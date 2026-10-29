/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { create } from 'zustand'
import ts from 'typescript'
import { parsePartnerLoginPreview } from '../src/shared/partner-login.ts'
import { isPartnerId } from '../src/shared/partner-attribution.ts'
const id = '12345678-1234-4123-8123-123456789abc'
const raw = 'a'.repeat(43)
const proof = 'b'.repeat(43)
const compile = (path) =>
  ts.transpile(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  })
const captureSource = compile('../src/web/partner-login-capture.ts')
const storeSource = compile('../src/web/partner-login.store.ts')
function capture(query) {
  const changes = []
  const exports = {}
  new Function('require', 'exports', 'window', 'history', captureSource)(
    () => ({ isPartnerId }),
    exports,
    { location: { href: `https://example.test/pwa/?${query}` } },
    { replaceState: (...args) => changes.push(args[2]) }
  )
  return { take: exports.takePartnerLogin, changes }
}
test('captures partner token once and removes credentials before app startup', () => {
  const h = capture(`partnerId=${id}&token=${raw}&validate-url=https%3A%2F%2Fevil.test`)
  assert.equal(h.changes.length, 1)
  assert.equal(h.changes[0], `/pwa/?partnerId=${id}`)
  assert.deepEqual(h.take(), { partnerId: id, token: raw })
  assert.equal(h.take(), null)
  for (const query of [
    `partnerId=${id}&token=bad`,
    `partnerId=${id}&token=${raw}&token=${raw}`,
    `partnerId=bad&token=${raw}`,
    `partnerId=${id}&token=${raw}&handoff=${raw}`
  ]) {
    const invalid = capture(query)
    assert.equal(invalid.take(), 'invalid')
    assert.ok(!invalid.changes[0].includes(raw))
  }
  assert.equal(capture(`partnerId=${id}`).take(), null)
})
const preview = () => ({
  proof,
  partnerId: id,
  partnerName: 'Partner',
  username: 'External player',
  email: null,
  expiresAt: new Date(Date.now() + 100_000).toISOString()
})
test('confirmation previews reject malformed, expired and mismatched identities', () => {
  assert.equal(parsePartnerLoginPreview(preview(), id).proof, proof)
  for (const patch of [
    { proof: raw + 'x' },
    { expiresAt: 'bad' },
    { expiresAt: new Date(0).toISOString() },
    { partnerId: 'other' },
    { username: '' },
    { email: 42 }
  ])
    assert.throws(() => parsePartnerLoginPreview({ ...preview(), ...patch }, id))
})
function harness({
  existing = false,
  collision = false,
  usernameCollision = false,
  verificationFailure = false,
  beginFailure = null,
  warnings = []
} = {}) {
  const calls = []
  const accepted = []
  let token = existing ? 'c'.repeat(43) : null
  let auth = {
    status: existing ? 'authenticated' : 'idle',
    session: existing ? { player: { id } } : null
  }
  const session = {
    token: 'd'.repeat(43),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    player: {
      id,
      username: 'Player',
      email: null,
      mmr: 1000,
      points: 0,
      hasPassword: false,
      requiresUsernameSetup: true
    }
  }
  const deps = {
    zustand: { create },
    '../shared/partner-login': { parsePartnerLoginPreview },
    './partner-login-capture': { takePartnerLogin: () => ({ partnerId: id, token: raw }) },
    './browser-session': {
      getWebSessionToken: () => token,
      requestJson: async (path, options) => {
        calls.push({ path, options })
        if (path.endsWith('/begin')) {
          if (beginFailure) throw beginFailure
          return preview()
        }
        if (path.endsWith('/email/start')) return { sent: true }
        if (
          path.endsWith('/complete') &&
          usernameCollision &&
          !JSON.parse(options.init.body).chooseUsername
        )
          throw Object.assign(new Error(), { code: 'PARTNER_USERNAME_TAKEN' })
        if (
          (path.endsWith('/verify-password') || path.endsWith('/email/verify')) &&
          verificationFailure
        ) {
          ;((verificationFailure = false), (beginFailure = null), (warnings = []))
          throw Object.assign(new Error(), {
            code: path.endsWith('/verify-password')
              ? 'PARTNER_PASSWORD_INVALID'
              : 'PARTNER_EMAIL_CODE_INVALID'
          })
        }
        if (collision) {
          collision = false
          throw Object.assign(new Error(), { code: 'PARTNER_ACCOUNT_LINK_REQUIRED' })
        }
        return session
      }
    },
    './browser-auth': {
      acceptAuth: async (body) => {
        accepted.push(body)
        token = body.token
        return body
      }
    },
    '../renderer/src/features/auth/auth.store': {
      useAuthStore: {
        getState: () => auth,
        setState: (patch) => {
          auth = { ...auth, ...patch }
        }
      }
    }
  }
  const exports = {}
  new Function('require', 'exports', 'console', storeSource)((name) => deps[name], exports, {
    warn: (...args) => warnings.push(args)
  })
  return {
    store: exports.usePartnerLoginStore,
    calls,
    accepted,
    signIn: () => {
      auth = { status: 'authenticated', session: { player: { id } } }
      token = 'c'.repeat(43)
    }
  }
}
test('validation stage does not authenticate on its own; cancellation discards proof', async () => {
  const h = harness()
  await Promise.all([h.store.getState().initialize(), h.store.getState().initialize()])
  assert.equal(h.calls.length, 1)
  assert.equal(h.accepted.length, 0)
  assert.equal(h.store.getState().phase, 'ready')
  h.store.getState().cancel()
  await h.store.getState().complete('sign_in')
  assert.equal(h.store.getState().preview, null)
  assert.equal(h.accepted.length, 0)
})
test('explicit confirmation sends only the one-time proof and accepts a normal session', async () => {
  const h = harness()
  await h.store.getState().initialize()
  await h.store.getState().complete('sign_in')
  assert.equal(h.store.getState().phase, 'done')
  assert.equal(h.store.getState().preview, null)
  assert.equal(h.accepted.length, 1)
  assert.deepEqual(JSON.parse(h.calls[1].options.init.body), { proof, action: 'sign_in' })
  assert.ok(!h.calls[1].options.init.body.includes(raw))
})
test('existing-account linking requires a signed-in session and explicit link action', async () => {
  const h = harness()
  await h.store.getState().initialize()
  await h.store.getState().complete('link')
  assert.equal(h.calls.length, 1)
  h.signIn()
  await h.store.getState().complete('link')
  assert.equal(h.calls[1].options.authenticated, true)
  assert.equal(JSON.parse(h.calls[1].options.init.body).action, 'link')
})
test('email collision preserves confirmation so the player can sign in and explicitly link', async () => {
  const h = harness({ collision: true })
  await h.store.getState().initialize()
  await h.store.getState().complete('sign_in')
  assert.equal(h.store.getState().phase, 'waiting_login')
  assert.equal(h.accepted.length, 0)
  h.signIn()
  h.store.getState().resume()
  await h.store.getState().complete('link')
  assert.equal(h.store.getState().phase, 'done')
  assert.equal(h.calls.filter((c) => c.path.endsWith('/begin')).length, 1)
})

test('username collisions retain the verified proof until the player chooses a new account', async () => {
  const h = harness({ usernameCollision: true })
  await h.store.getState().initialize()
  await h.store.getState().complete('sign_in')
  assert.equal(h.store.getState().phase, 'account_match')
  assert.equal(h.accepted.length, 0)
  assert.equal(h.store.getState().preview.proof, proof)
  await h.store.getState().complete('sign_in', true)
  assert.equal(h.store.getState().phase, 'done')
  assert.equal(h.accepted.length, 1)
  assert.equal(JSON.parse(h.calls[2].options.init.body).chooseUsername, true)
})
test('password verification retries preserve the existing session and never persist the password', async () => {
  const h = harness({ usernameCollision: true, verificationFailure: true })
  await h.store.getState().initialize()
  await h.store.getState().complete('sign_in')
  await h.store.getState().selectVerification('password')
  await h.store.getState().verify('fixture-wrong-password')
  assert.equal(h.store.getState().phase, 'password')
  assert.match(h.store.getState().verificationError, /could not be verified/)
  assert.equal(h.accepted.length, 0)
  await h.store.getState().verify('fixture-correct-password')
  assert.equal(h.store.getState().phase, 'done')
  assert.equal(h.accepted.length, 1)
  assert.ok(!JSON.stringify(h.store.getState()).includes('fixture-correct-password'))
  assert.ok(
    h.calls
      .filter((c) => c.path.endsWith('/verify-password'))
      .every((c) => c.options.clearOnUnauthorized === false)
  )
})
test('email verification requests and verifies a code before accepting any session', async () => {
  const h = harness({ usernameCollision: true, verificationFailure: true })
  await h.store.getState().initialize()
  await h.store.getState().complete('sign_in')
  await h.store.getState().selectVerification('email')
  assert.equal(h.store.getState().phase, 'email')
  assert.equal(h.accepted.length, 0)
  await h.store.getState().verify('000000')
  assert.equal(h.store.getState().phase, 'email')
  assert.match(h.store.getState().verificationError, /invalid or expired/)
  await h.store.getState().verify('123456')
  assert.equal(h.store.getState().phase, 'done')
  assert.equal(h.accepted.length, 1)
  assert.equal(h.store.getState().preview, null)
})

function runControllerEffects(store, authStatus = 'idle') {
  const effects = []
  const source = ts.transpileModule(
    readFileSync(new URL('../src/web/PartnerLoginController.tsx', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }
  ).outputText
  const deps = {
    react: { useEffect: (effect) => effects.push(effect) },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'lucide-react': { LoaderCircle: () => null },
    './PartnerAccountMatch': { PartnerAccountMatch: () => null },
    '../renderer/src/components/ui/ModalDialog': { ModalDialog: () => null },
    '../renderer/src/components/ui/Button': { Button: () => null },
    '../renderer/src/features/auth/auth.store': {
      useAuthStore: (select) => select({ status: authStatus, session: null })
    },
    './partner-login.store': { usePartnerLoginStore: () => store.getState() },
    '../renderer/src/features/i18n/i18n': { useTranslation: () => ({ t: (key) => key }) }
  }
  const exports = {}
  new Function('require', 'exports', source)((name) => deps[name], exports)
  exports.PartnerLoginController()
  for (const effect of effects) effect()
}
test('a verified partner handoff completes automatically once account restoration finishes', async () => {
  const h = harness()
  await h.store.getState().initialize()
  runControllerEffects(h.store, 'restoring')
  assert.equal(h.accepted.length, 0)
  runControllerEffects(h.store, 'idle')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.accepted.length, 1)
  assert.equal(h.store.getState().phase, 'done')
  assert.equal(h.calls.filter((call) => call.path.endsWith('/complete')).length, 1)
})
test('automatic sign-in stops at ownership verification when a username is taken', async () => {
  const h = harness({ usernameCollision: true })
  await h.store.getState().initialize()
  runControllerEffects(h.store)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.store.getState().phase, 'account_match')
  assert.equal(h.accepted.length, 0)
  runControllerEffects(h.store)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.calls.filter((call) => call.path.endsWith('/complete')).length, 1)
})

test('failed partner validation logs safe diagnostics without exposing credentials', async () => {
  const warnings = []
  const secret = 'sensitive-password-and-token'
  const h = harness({
    warnings,
    beginFailure: Object.assign(new Error(secret), {
      code: 'PARTNER_VALIDATION_FAILED',
      status: 502,
      token: secret
    })
  })
  await h.store.getState().initialize()
  assert.equal(h.store.getState().phase, 'failed')
  assert.equal(h.accepted.length, 0)
  assert.equal(warnings.length, 1)
  assert.deepEqual(warnings[0][1], {
    stage: 'begin',
    code: 'PARTNER_VALIDATION_FAILED',
    status: 502
  })
  assert.ok(!JSON.stringify(warnings).includes(secret))
  assert.ok(!JSON.stringify(warnings).includes(raw))
})
