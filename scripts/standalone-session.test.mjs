import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = await mkdtemp(join(tmpdir(), '16c-handoff-'))
after(() => rm(root, { recursive: true, force: true }))
const output = join(root, 'session.mjs')
await build({
  entryPoints: ['src/main/game/standalone-session.ts'],
  outfile: output,
  bundle: true,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'host',
      setup(builder) {
        builder.onResolve(
          { filter: /^(electron|\.\.\/auth|\.\.\/config|\.\.\/\.\.\/shared\/crosshair)$/ },
          (args) => ({ path: args.path, namespace: 'host' })
        )
        builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({
          contents: `
      export const app = globalThis.fixtureApp;
      export const BrowserWindow = { getAllWindows: () => [] };
      export const getSessionToken = () => 'desktop-token';
      export const API_BASE_URL = 'https://16competitive.papamo.dev';
      export const serializeCrosshairConfig = () => '255 255 255 1 4 1 0 100 0 0\\n';
    `
        }))
      }
    }
  ],
  logLevel: 'silent'
})
let quits = 0
globalThis.fixtureApp = {
  isPackaged: false,
  getAppPath: () => root,
  getPath: () => join(root, 'user'),
  quit: () => {
    quits++
  }
}
const previousFetch = globalThis.fetch
globalThis.fetch = async () => ({ ok: true, json: async () => ({ token: 'a'.repeat(43) }) })
after(() => {
  globalThis.fetch = previousFetch
  delete globalThis.fixtureApp
})
const native = join(root, 'web-helper/target/debug')
await mkdir(native, { recursive: true })
const name = `competitive16-web-helper${process.platform === 'win32' ? '.exe' : ''}`
const helper = join(native, name)
const marker = join(root, 'events.json')
const {
  launchStandaloneSession,
  launchStandalonePartner,
  setStandaloneVoice,
  stopStandaloneSession,
  standaloneSessionStatus
} = await import(pathToFileURL(output))
const settings = {
  cs16FolderPath: root,
  display: { resolution: 'current', widescreen: true },
  currentDisplayResolution: { width: 1920, height: 1080 },
  fastSwitchEnabled: true,
  nextClientIntegrationEnabled: true,
  killCardsEnabled: true,
  playerPingKey: 'MOUSE3',
  voicePttKeys: ['K', 'V'],
  crosshair: {}
}

test(
  'handoff waits for readiness and commit before quitting, and sends a dedicated login',
  { skip: process.platform === 'win32' },
  async () => {
    await writeFile(
      helper,
      `#!/usr/bin/env node
const fs=require('fs');const rl=require('readline').createInterface({input:process.stdin});
let request;
rl.on('line', line=>{
  const value=JSON.parse(line);
  if(!request){request=value;console.log(JSON.stringify({protocol:1,event:'ready'}));}
  else {
    fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({commit:value.commit,voice:request.settings.voice,
      dedicated:request.handoff!== 'desktop-token', argv:process.argv.slice(2),
      keep:request.keepLauncherOpen,reopen:!!request.reopen,resume:request.reopen?.args.includes('--return-from-game'),cards:request.settings.killCardsEnabled}));
    console.log(JSON.stringify({protocol:1,event:'committed'}));
    setTimeout(()=>process.exit(0),300);
  }
});
`,
      { mode: 0o755 }
    )
    setStandaloneVoice({
      enabled: false,
      openMic: false,
      peers: { friend: { muted: true, volume: 0.3 } }
    })
    await launchStandaloneSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', undefined, {
      ...settings,
      lightweightHud: false
    })
    assert.equal(quits, 1, 'quit must follow acknowledgement, not process spawn')
    const events = JSON.parse(await readFile(marker, 'utf8'))
    assert.deepEqual(events, {
      commit: true,
      voice: { enabled: false, openMic: false, peers: { friend: { muted: true, volume: 0.3 } } },
      dedicated: true,
      argv: ['--desktop-session'],
      keep: false,
      reopen: true,
      resume: true,
      cards: true
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(quits, 1)
  }
)

test(
  'invalid readiness keeps the launcher open and closes the control pipe',
  { skip: process.platform === 'win32' },
  async () => {
    quits = 0
    await writeFile(
      helper,
      `#!/usr/bin/env node
process.stdin.once('data',()=>console.log('{"protocol":1,"event":"committed"}'));
process.stdin.on('end',()=>process.exit(0));
`,
      { mode: 0o755 }
    )
    await assert.rejects(
      launchStandaloneSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', undefined, settings),
      /handoff state/
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(quits, 0)
  }
)

test(
  'helper death after commit cancels the pending launcher exit',
  { skip: process.platform === 'win32' },
  async () => {
    quits = 0
    await writeFile(
      helper,
      `#!/usr/bin/env node
const rl=require('readline').createInterface({input:process.stdin});
let ready=false;
rl.on('line',()=>{
  if(!ready){ready=true;console.log('{"protocol":1,"event":"ready"}');}
  else {console.log('{"protocol":1,"event":"committed"}');setTimeout(()=>process.exit(1),10);}
});
`,
      { mode: 0o755 }
    )
    await assert.rejects(
      launchStandaloneSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', undefined, settings),
      /preparation failed/
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(quits, 0)
  }
)

test(
  'partner sessions retain their existing launcher ownership option',
  { skip: process.platform === 'win32' },
  async () => {
    quits = 0
    await writeFile(
      helper,
      `#!/usr/bin/env node
const fs=require('fs');const rl=require('readline').createInterface({input:process.stdin});let request;
rl.on('line',line=>{const value=JSON.parse(line);
 if(!request){request=value;console.log('{"protocol":1,"event":"ready"}');}
 else if(value.commit){console.log('{"protocol":1,"event":"committed"}');}
 else if(value.release){
  fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({keep:request.keepLauncherOpen,reopen:request.reopen}));
  console.log('{"protocol":1,"event":"status","connected":true}');
 }else if(value.stop){setTimeout(()=>process.exit(0),50);}
});`,
      { mode: 0o755 }
    )
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    await launchStandalonePartner({ serverId: id }, 'https://16competitive.papamo.dev', {
      ...settings,
      lightweightHud: false
    })
    assert.equal(quits, 0)
    assert.equal(standaloneSessionStatus(id).owned, true)
    assert.equal(standaloneSessionStatus('another-match').owned, false)
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), { keep: true, reopen: null })
    assert.equal(standaloneSessionStatus(id).connected, true)
    await stopStandaloneSession()
    assert.equal(standaloneSessionStatus(id).owned, false)
    assert.equal(quits, 0)
  }
)

test(
  'preparation failures retain safe helper codes without quitting the launcher',
  { skip: process.platform === 'win32' },
  async () => {
    quits = 0
    await writeFile(
      helper,
      `#!/usr/bin/env node
process.stdin.once('data',()=>console.log('{"protocol":1,"event":"error","code":"DEVICE_CHECK_FAILED"}'));
process.stdin.on('end',()=>process.exit(1));
`,
      { mode: 0o755 }
    )
    await assert.rejects(
      launchStandaloneSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', undefined, settings),
      /DEVICE_CHECK_FAILED/
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(quits, 0)
  }
)

test(
  'spawn diagnostics reach report logs while untrusted helper details are excluded',
  { skip: process.platform === 'win32' },
  async () => {
    for (const [details, expected] of [
      [
        { osError: 740, errorKind: 'PermissionDenied' },
        { osError: 740, errorKind: 'PermissionDenied' }
      ],
      [{ osError: 'private token', errorKind: 'C:\\private\\hl.exe' }, {}],
      [{ osError: 2 ** 40, errorKind: 'x'.repeat(100) }, {}]
    ]) {
      quits = 0
      const frame = {
        protocol: 1,
        event: 'error',
        code: 'GAME_SPAWN_FAILED',
        ...details,
        message: 'private path and token',
        argv: ['secret']
      }
      await writeFile(
        helper,
        `#!/usr/bin/env node
process.stdin.once('data',()=>console.log(${JSON.stringify(JSON.stringify(frame))}));
process.stdin.on('end',()=>process.exit(1));
`,
        { mode: 0o755 }
      )
      const logs = []
      const previousWarn = console.warn
      console.warn = (...args) => logs.push(args)
      try {
        await assert.rejects(
          launchStandaloneSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', undefined, settings),
          /GAME_SPAWN_FAILED/
        )
      } finally {
        console.warn = previousWarn
      }
      assert.deepEqual(logs, [
        ['[Standalone] preparation failed', { code: 'GAME_SPAWN_FAILED', ...expected }]
      ])
      assert.equal(quits, 0)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
)

test(
  'existing-game failures return translation keys and retain technical codes in logs',
  { skip: process.platform === 'win32' },
  async () => {
    for (const [code, message] of [
      ['GAME_CLOSE_FAILED', 'match.launch.closeFailed'],
      ['GAME_ALREADY_RUNNING', 'match.launch.alreadyRunning']
    ]) {
      await writeFile(
        helper,
        `#!/usr/bin/env node
process.stdin.once('data',()=>console.log(JSON.stringify({protocol:1,event:'error',code:${JSON.stringify(code)}})));
process.stdin.on('end',()=>process.exit(1));
`,
        { mode: 0o755 }
      )
      await assert.rejects(
        launchStandaloneSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', undefined, settings),
        (error) => error.message === message
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
)

test('returning from a game skips the startup network check and splash delay only', async () => {
  const { transform } = await import('esbuild')
  const index = await readFile('src/main/index.ts', 'utf8')
  const block = index.slice(
    index.indexOf("  if (!process.argv.includes('--return-from-game'))"),
    index.indexOf('  await initializePartnerAppIdentity(icon')
  )
  assert.ok(block.includes('checkBeforeStartup'))
  const { code } = await transform(block, { loader: 'ts' })
  const run = new (Object.getPrototypeOf(async function () {
    return undefined
  }).constructor)('process', 'updateBanner', 'setTimeout', code)
  for (const returning of [true, false]) {
    let checks = 0
    const delays = []
    await run(
      { argv: returning ? ['launcher', '--return-from-game'] : ['launcher'] },
      {
        checkBeforeStartup: async () => {
          checks++
        }
      },
      (resolve, delay) => {
        delays.push(delay)
        resolve()
      }
    )
    assert.equal(checks, returning ? 0 : 1)
    assert.deepEqual(delays, returning ? [] : [3000])
  }
})

test('sticker failures reach issue-report console logs without raw helper data on every platform', async () => {
  const { transform } = await import('esbuild')
  const source = await readFile('src/main/game/standalone-session.ts', 'utf8')
  const callback = source.slice(
    source.indexOf("    child.stdout.on('data',"),
    source.indexOf('    child.stdin.write(`${JSON.stringify(request)}')
  )
  const { code } = await transform(callback, { loader: 'ts' })
  for (const failureCode of [
    'STICKER_RECIPE_INVALID',
    'STICKER_RECIPE_HASH_MISMATCH',
    'STICKER_SOURCE_FAILED',
    'STICKER_SOURCE_HASH_MISMATCH',
    'STICKER_ARTWORK_REQUEST_FAILED',
    'STICKER_ARTWORK_HASH_MISMATCH',
    'STICKER_IMAGE_INVALID',
    'STICKER_BAKE_FAILED',
    'STICKER_BAKE_TIMEOUT',
    'STICKER_CACHE_FAILED',
    'STICKER_SESSION_WRITE_FAILED',
    'STICKER_TIMEOUT'
  ]) {
    let receive
    let failure
    const logs = []
    const register = new Function(
      'child',
      'fail',
      'console',
      `
      let complete = false, active = null, buffer = '';
      ${code}
    `
    )
    register(
      {
        stdout: {
          on: (_event, callback) => {
            receive = callback
          }
        }
      },
      (error) => {
        failure = error
      },
      { warn: (...args) => logs.push(args) }
    )
    const frame =
      JSON.stringify({
        protocol: 1,
        event: 'error',
        code: failureCode,
        message: 'private backend response',
        token: 'secret',
        path: 'private file'
      }) + '\n'
    // Exercise the actual pipe parser, including fragmented frames.
    receive(Buffer.from(frame.slice(0, 15)))
    assert.equal(logs.length, 0)
    receive(Buffer.from(frame.slice(15)))
    assert.deepEqual(logs, [['[Standalone] preparation failed', { code: failureCode }]])
    assert.match(failure.message, new RegExp(failureCode))
    assert.ok(!JSON.stringify(logs).includes('private'))
    assert.ok(!JSON.stringify(logs).includes('secret'))
  }
})
