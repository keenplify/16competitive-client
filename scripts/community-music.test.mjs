import { createEarlyAssetSync } from '../src/shared/early-asset-sync.ts'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const paths = {
  DEFAULT_BGM_ID: 'rock',
  isLauncherBgmId: (value) => value === 'rock',
  getLauncherBgmTrack: () => ({ path: '/bundled.mp3' }),
  getLauncherSfxPath: () => '/cue.mp3'
}
function load(file, imports = {}, globals = {}) {
  const source = ts.transpileModule(
    readFileSync(new URL('../src/renderer/src/features/audio/' + file, import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
  ).outputText
  const exports = {}
  new Function('require', 'exports', ...Object.keys(globals), source)(
    (name) => imports[name] ?? paths,
    exports,
    ...Object.values(globals)
  )
  return exports
}
const { resolveCommunityMusic } = load('community-music.ts')
const branding = { partnerId: 'joined-community', musicUrl: 'https://api.test/music' }
test('automatic defaults to joined community music and falls back for guests, missing tracks and stale accounts', () => {
  assert.equal(
    resolveCommunityMusic('automatic', 'player', 'player', branding).musicUrl,
    branding.musicUrl
  )
  for (const args of [
    ['automatic', null, null, branding],
    ['automatic', 'new-player', 'old-player', branding],
    ['automatic', 'player', 'player', null],
    ['rock', 'player', 'player', branding]
  ]) {
    assert.deepEqual(resolveCommunityMusic(...args), { trackId: 'rock', musicUrl: null })
  }
})
test('automatic selection migrates old defaults, while an explicit bundled selection persists', () => {
  let stored = JSON.stringify({ bgmVolume: 37, selectedBgmId: 'rock' })
  const globals = {
    window: {
      localStorage: {
        getItem: () => stored,
        setItem: (_, value) => {
          stored = value
        }
      }
    }
  }
  const first = load(
    'audio.store.ts',
    { zustand: require('zustand') },
    globals
  ).useAudioSettingsStore
  assert.equal(first.getState().selectedBgmId, 'automatic')
  assert.equal(first.getState().bgmVolume, 37)
  first.getState().setSelectedBgmId('rock')
  const second = load(
    'audio.store.ts',
    { zustand: require('zustand') },
    globals
  ).useAudioSettingsStore
  assert.equal(second.getState().selectedBgmId, 'rock')
})
function audioHarness() {
  const instances = []
  class Audio {
    listeners = new Map()
    played = 0
    paused = false
    constructor() {
      instances.push(this)
    }
    addEventListener(name, callback) {
      this.listeners.set(name, callback)
    }
    play() {
      this.played++
      return Promise.resolve()
    }
    pause() {
      this.paused = true
    }
    removeAttribute() {
      this.src = ''
    }
    load() {
      /* No network in the fixture. */
    }
  }
  const { launcherAudio } = load(
    'audio.manager.ts',
    {},
    {
      Audio,
      window: {},
      document: { hasFocus: () => true },
      cancelAnimationFrame: () => undefined,
      requestAnimationFrame: () => 1
    }
  )
  return { manager: launcherAudio, instances }
}
test('partner audio revisions invalidate volume overrides once and survive launcher restarts', () => {
  let stored = null
  const globals = {
    window: {
      localStorage: {
        getItem: () => stored,
        setItem: (_, value) => {
          stored = value
        }
      }
    }
  }
  const restore = () =>
    load('audio.store.ts', { zustand: require('zustand') }, globals).useAudioSettingsStore
  let store = restore()
  store.getState().applyCommunityAudioDefaults('player:partner:1', 60)
  assert.equal(store.getState().bgmVolume, 60)
  store.getState().setBgmVolume(23)
  store.getState().applyCommunityAudioDefaults('player:partner:1', 60)
  assert.equal(store.getState().bgmVolume, 23)
  store = restore()
  store.getState().applyCommunityAudioDefaults('player:partner:1', 60)
  assert.equal(store.getState().bgmVolume, 23)
  store.getState().applyCommunityAudioDefaults('player:partner:2', 75)
  assert.equal(store.getState().bgmVolume, 75)
  store.getState().setBgmVolume(10)
  store.getState().applyCommunityAudioDefaults('player:partner:3', 0)
  assert.equal(store.getState().bgmVolume, 0)
  assert.equal(restore().getState().bgmVolume, 0)
})

test('zero muffle disables lobby attenuation and intermediate strengths interpolate it', () => {
  const { manager, instances } = audioHarness()
  manager.setBgmTrack('rock', branding.musicUrl)
  manager.setBgmVolume(80)
  manager.setBgmLowPass(true, 0, 100)
  assert.equal(instances.at(-1).volume, 0.4)
  manager.setBgmLowPass(true, 0, 50)
  assert.ok(Math.abs(instances.at(-1).volume - 0.6) < 1e-12)
  manager.setBgmLowPass(true, 0, 0)
  assert.equal(instances.at(-1).volume, 0.8)
})
test('community tracks loop with existing volume controls and switch cleanly to bundled on failure or leave', () => {
  const { manager, instances } = audioHarness()
  manager.setBgmTrack('rock', branding.musicUrl)
  const custom = instances.at(-1)
  assert.equal(custom.src, branding.musicUrl)
  assert.equal(custom.loop, true)
  assert.equal(custom.crossOrigin, 'anonymous')
  manager.setBgmVolume(25)
  assert.equal(custom.volume, 0.25)
  custom.listeners.get('error')()
  assert.equal(custom.paused, true)
  assert.equal(instances.at(-1).src, '/bundled.mp3')
  manager.setBgmTrack('rock', 'https://api.test/other-music')
  manager.setBgmTrack('rock', null)
  assert.equal(instances.at(-1).src, '/bundled.mp3')
})
test('changing community music never starts playback while music is suppressed for the game', () => {
  const { manager, instances } = audioHarness()
  manager.startBgm()
  manager.fadeBgmForGame(0)
  const count = instances.length
  manager.setBgmTrack('rock', branding.musicUrl)
  assert.equal(instances.length, count)
  manager.restoreBgm(0)
  assert.equal(instances.at(-1).src, branding.musicUrl)
  assert.ok(instances.at(-1).played > 0)
})

test('partner PWA music follows joined membership independently of the linked presentation community', async () => {
  let token = 'session'
  const calls = []
  const window = {}
  const source = ts.transpileModule(
    readFileSync(new URL('../src/web/browser-api.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
  ).outputText
  new Function('require', 'exports', 'window', 'localStorage', source)(
    (name) => {
      if (name === '../shared/early-asset-sync') return { createEarlyAssetSync }
      if (name === './partner-attribution') return { getBrowserPartnerId: () => 'linked-community' }
      if (name === '../shared/partner-branding') return { parsePartnerBranding: (value) => value }
      if (name === './browser-matchmaking')
        return { browserPartyRealtime: {}, browserMatchmakingApi: {} }
      if (name === './browser-session')
        return {
          getWebSessionToken: () => token,
          currentApiOrigin: () => 'https://regional.test',
          requestJson: async (path, options) => {
            calls.push({ path, authenticated: options?.authenticated })
            return {
              branding: {
                partnerId: path.endsWith('/me') ? 'joined-community' : 'linked-community'
              }
            }
          }
        }
      return {}
    },
    {},
    window,
    { getItem: () => null }
  )
  assert.equal((await window.api.partnerBranding.get()).branding.partnerId, 'linked-community')
  assert.equal(
    (await window.api.partnerBranding.getJoined()).branding.partnerId,
    'joined-community'
  )
  assert.equal(calls[1].path, '/partners/branding/me')
  assert.equal(calls[1].authenticated, true)
  token = null
  assert.equal((await window.api.partnerBranding.getJoined()).branding, null)
  assert.equal(calls.length, 2)
})

test('partner return preserves the community track after authentication is cleared', () => {
  const tracks = []
  const effects = []
  let playerId = 'player'
  const store = (get) => (selector) => selector(get())
  const { AudioController } = load('AudioController.tsx', {
    react: { useEffect: (effect) => effects.push(effect), useRef: (current) => ({ current }) },
    './community-music': { resolveCommunityMusic },
    './audio.manager': { launcherAudio: { setBgmTrack: (...args) => tracks.push(args) } },
    './audio.store': { useAudioSettingsStore: store(() => ({ selectedBgmId: 'automatic' })) },
    '../auth/auth.store': {
      useAuthStore: store(() => ({ session: playerId ? { player: { id: playerId } } : null }))
    },
    '../partner-branding/partner-branding.store': {
      usePartnerBrandingStore: store(() => ({
        joinedBranding: playerId ? branding : null,
        accountId: playerId
      }))
    },
    '../matchmaking/matchmaking.store': { useMatchmakingStore: store(() => ({})) },
    '../skins/music-kits.store': { useMusicKitsStore: store(() => ({ snapshot: null })) }
  })
  AudioController({})
  effects[0]()
  assert.deepEqual(tracks, [['rock', branding.musicUrl]])
  playerId = null
  effects.length = 0
  AudioController({ preserveMusic: true })
  effects[0]()
  assert.equal(tracks.length, 1)
  effects.length = 0
  AudioController({})
  effects[0]()
  assert.deepEqual(tracks.at(-1), ['rock', null])
})

test('equipped kit selection persists and follows activation, clearing and logout', () => {
  let stored = null
  const globals = {
    window: {
      localStorage: {
        getItem: () => stored,
        setItem: (_, value) => {
          stored = value
        }
      }
    }
  }
  const restore = () =>
    load('audio.store.ts', { zustand: require('zustand') }, globals).useAudioSettingsStore
  restore().getState().setSelectedBgmId('equipped-kit')
  assert.equal(restore().getState().selectedBgmId, 'equipped-kit')
  const effects = [],
    tracks = []
  let playerId = 'player',
    active = 'alpha'
  const kits = [
    { id: 'alpha', bgmUrl: 'https://regional.test/a.mp3' },
    { id: 'beta', bgmUrl: 'https://regional.test/b.mp3' }
  ]
  const store = (get) => (selector) => selector(get())
  const { AudioController } = load('AudioController.tsx', {
    react: { useEffect: (effect) => effects.push(effect), useRef: (current) => ({ current }) },
    './community-music': { resolveCommunityMusic },
    './audio.manager': { launcherAudio: { setBgmTrack: (...args) => tracks.push(args) } },
    './audio.store': { useAudioSettingsStore: store(() => ({ selectedBgmId: 'equipped-kit' })) },
    '../auth/auth.store': {
      useAuthStore: store(() => ({ session: playerId ? { player: { id: playerId } } : null }))
    },
    '../partner-branding/partner-branding.store': { usePartnerBrandingStore: store(() => ({})) },
    '../matchmaking/matchmaking.store': { useMatchmakingStore: store(() => ({})) },
    '../skins/music-kits.store': {
      useMusicKitsStore: store(() => ({
        snapshot: { kits, ownedIds: ['alpha', 'beta'], equipped: { ct: active, t: active } }
      }))
    }
  })
  const update = () => {
    effects.length = 0
    AudioController({})
    effects[0]()
  }
  update()
  assert.deepEqual(tracks.at(-1), ['rock', kits[0].bgmUrl])
  active = 'beta'
  update()
  assert.deepEqual(tracks.at(-1), ['rock', kits[1].bgmUrl])
  active = null
  update()
  assert.deepEqual(tracks.at(-1), ['rock', null])
  active = 'alpha'
  playerId = null
  update()
  assert.deepEqual(tracks.at(-1), ['rock', null])
})
