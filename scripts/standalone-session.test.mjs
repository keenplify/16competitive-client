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
      dedicated:request.handoff!== 'desktop-token', argv:process.argv.slice(2)}));
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
    await launchStandaloneSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', undefined, settings)
    assert.equal(quits, 1, 'quit must follow acknowledgement, not process spawn')
    const events = JSON.parse(await readFile(marker, 'utf8'))
    assert.deepEqual(events, {
      commit: true,
      voice: { enabled: false, openMic: false, peers: { friend: { muted: true, volume: 0.3 } } },
      dedicated: true,
      argv: ['--desktop-session']
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
  'keeping Electron open uses the same helper, releases ownership, and stops only its session',
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
    let exits = 0
    await launchStandaloneSession(id, undefined, { ...settings, lightweightHud: false }, () => {
      exits++
    })
    assert.equal(quits, 0)
    assert.equal(standaloneSessionStatus(id).owned, true)
    assert.equal(standaloneSessionStatus('another-match').owned, false)
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), { keep: true, reopen: null })
    assert.equal(standaloneSessionStatus(id).connected, true)
    await stopStandaloneSession()
    assert.equal(exits, 1)
    assert.equal(standaloneSessionStatus(id).owned, false)
    assert.equal(quits, 0)
  }
)
