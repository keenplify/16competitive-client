/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import {
  DEFAULT_APP_NAME,
  INSTALLED_APP_ID,
  partnerDesktopEntry
} from '../src/shared/partner-app-shortcuts.ts'
const partnerId = '12345678-1234-4123-8123-123456789abc'
const api = 'https://api.example.test'
const png = Buffer.from('verified-icon-png'),
  ico = Buffer.from('verified-icon-ico')
const hash = (value) => createHash('sha256').update(value).digest('hex')
async function harness(platform = 'win32', collision = false) {
  const p = platform === 'win32' ? path.win32 : path.posix
  const base = platform === 'win32' ? 'C:\\fixture' : '/fixture'
  const roots = Object.fromEntries(
    ['userData', 'desktop', 'appData', 'home'].map((key) => [key, p.join(base, key)])
  )
  const executable =
    platform === 'win32' ? 'C:\\Launcher\\app.exe' : '/apps/Launcher "$%file.AppImage'
  const files = new Map(),
    shortcuts = new Map(),
    applied = [],
    warnings = []
  const defaultLink = p.join(roots.desktop, DEFAULT_APP_NAME + '.lnk')
  files.set(defaultLink, Buffer.from('link'))
  shortcuts.set(defaultLink, { target: executable })
  const custom = p.join(roots.desktop, 'My Partner.lnk')
  if (collision) {
    files.set(custom, Buffer.from('unrelated'))
    shortcuts.set(custom, { target: 'C:\\Other.exe' })
  }
  let unavailable = false
  let response = {
    branding: {
      partnerId,
      appName: 'My Partner',
      appIcon: {
        pngUrl: api + '/png',
        icoUrl: api + '/ico',
        pngSha256: hash(png),
        icoSha256: hash(ico)
      }
    }
  }
  const fs = {
    mkdir: async () => undefined,
    chmod: async () => undefined,
    readFile: async (file, encoding) => {
      if (!files.has(file)) throw new Error('missing')
      const bytes = files.get(file)
      return encoding ? bytes.toString() : bytes
    },
    writeFile: async (file, value) => files.set(file, Buffer.from(value)),
    rename: async (from, to) => {
      files.set(to, files.get(from))
      files.delete(from)
    },
    unlink: async (file) => {
      files.delete(file)
      shortcuts.delete(file)
    }
  }
  const context = vm.createContext({
    Buffer,
    URL,
    AbortSignal,
    console: { warn: (...args) => warnings.push(args) },
    process: {
      platform,
      pid: 1,
      execPath: executable,
      env: platform === 'linux' ? { APPIMAGE: executable } : {}
    },
    fetch: async (url, options) => {
      assert.equal(options.redirect, 'error')
      if (unavailable) throw new Error('offline')
      return new Response(
        url === api + '/png' ? png : url === api + '/ico' ? ico : JSON.stringify(response)
      )
    }
  })
  const dependencies = {
    electron: {
      app: { isPackaged: true, getPath: (key) => roots[key] },
      shell: {
        readShortcutLink: (file) => {
          if (!shortcuts.has(file)) throw new Error('missing')
          return shortcuts.get(file)
        },
        writeShortcutLink: (file, _mode, details) => {
          shortcuts.set(file, details)
          files.set(file, Buffer.from('link'))
          return true
        }
      },
      nativeImage: {
        createFromPath: () => ({
          getSize: () => ({ width: 512, height: 512 }),
          isEmpty: () => false
        })
      }
    },
    'node:crypto': { createHash },
    'node:fs/promises': fs,
    'node:path': p,
    './config': { API_BASE_URL: api },
    './partner-attribution': { detectDownloadPartner: async () => partnerId },
    '../shared/partner-branding': { parsePartnerBranding: (value) => value },
    '../shared/partner-app-shortcuts': { DEFAULT_APP_NAME, INSTALLED_APP_ID, partnerDesktopEntry }
  }
  const source = ts.transpileModule(
    await readFile(new URL('../src/main/partner-app-identity.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }
  ).outputText
  const mod = new vm.SourceTextModule(source, { context })
  await mod.link((name) => {
    const values = dependencies[name]
    assert.ok(values, name)
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value)
      },
      { context }
    )
  })
  await mod.evaluate()
  const settle = async () => {
    for (let i = 0; i < 25; i++) await new Promise((resolve) => setImmediate(resolve))
  }
  return {
    files,
    shortcuts,
    applied,
    warnings,
    defaultLink,
    custom,
    executable,
    roots,
    p,
    offline: () => {
      unavailable = true
    },
    setResponse: (value) => {
      response = value
    },
    run: async () => {
      await mod.namespace.initializePartnerAppIdentity('/packaged/icon.png', (value) =>
        applied.push(value)
      )
      await settle()
    }
  }
}
test('Windows partner shortcuts use the verified ICO, preserve unrelated links and keep a stable update identity', async () => {
  const h = await harness('win32', true)
  await h.run()
  assert.equal(h.applied.at(-1).name, 'My Partner')
  assert.equal(h.shortcuts.get(h.custom).target, 'C:\\Other.exe')
  assert.ok(
    h.shortcuts.has(h.defaultLink),
    'do not remove the default shortcut when the desired name collides'
  )
  const managed = [...h.shortcuts.values()].find((link) => link.description === 'My Partner')
  assert.equal(managed.target, h.executable)
  assert.equal(managed.appUserModelId, INSTALLED_APP_ID)
  assert.ok(managed.icon.endsWith(hash(ico) + '.ico'))
})
test('Linux creates both managed menu and desktop entries targeting the real AppImage', async () => {
  const h = await harness('linux')
  await h.run()
  const entries = [...h.files].filter(([file]) => file.endsWith('.desktop'))
  assert.equal(entries.length, 2)
  for (const [, bytes] of entries) {
    assert.ok(bytes.toString().includes('Name=My Partner'))
    assert.ok(bytes.toString().includes('%%file.AppImage'))
    assert.ok(!bytes.toString().includes('/tmp/.mount'))
  }
})
test('offline startup uses only hash-verified cached icons and rejects a corrupt cache', async () => {
  const h = await harness()
  await h.run()
  h.offline()
  h.applied.length = 0
  await h.run()
  assert.equal(h.applied.at(-1).name, 'My Partner')
  const pngPath = [...h.files.keys()].find((file) => file.endsWith(hash(png) + '.png'))
  h.files.set(pngPath, Buffer.from('tampered'))
  h.applied.length = 0
  await h.run()
  assert.equal(h.applied.length, 0)
})
test('a public response for another partner never changes installed identity', async () => {
  const h = await harness()
  h.setResponse({
    branding: { partnerId: '22345678-1234-4123-8123-123456789abc', appName: 'Wrong partner' }
  })
  await h.run()
  assert.equal(h.applied.length, 0)
})
