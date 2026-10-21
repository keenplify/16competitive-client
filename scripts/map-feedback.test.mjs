/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }).outputText
const source = transpile(
  await readFile(new URL('../src/main/match-history.ts', import.meta.url), 'utf8')
)
const matchId = '205a6816-b6c5-4325-9441-b8d9278cb2e7'
const survey = {
  funRating: 4,
  fairnessRating: 3,
  comment: 'More cover near spawn',
  createdAt: '2026-10-22T00:00:00Z',
  updatedAt: '2026-10-22T00:00:00Z'
}

async function harness(reply = { survey, pointsAwarded: 500 }) {
  const calls = []
  const context = vm.createContext({
    AbortSignal,
    fetch: async (url, init) => {
      calls.push({ url, init })
      return Response.json(reply)
    }
  })
  const dependencies = {
    '../shared/player-profile-validation': { isPlayerProfile: () => true },
    './auth': { getSessionToken: () => 'test-token' },
    './config': { API_BASE_URL: 'https://api.test' }
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link((name) => {
    const values = dependencies[name]
    assert.ok(values, `Unexpected import: ${name}`)
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return { api: module.namespace, calls }
}

test('IPC rejects invalid comments before sending a request', async () => {
  const h = await harness()
  for (const comment of [null, 12, {}, 'x'.repeat(2001)]) {
    await assert.rejects(h.api.submitMatchSurvey(matchId, 4, 3, comment), /2,000 characters/)
  }
  assert.equal(h.calls.length, 0)
})

test('written feedback travels with ratings, trims whitespace and remains optional', async () => {
  const h = await harness()
  assert.equal(
    (await h.api.submitMatchSurvey(matchId, 4, 3, '  More cover near spawn  ')).survey.comment,
    survey.comment
  )
  assert.deepEqual(JSON.parse(h.calls[0].init.body), {
    funRating: 4,
    fairnessRating: 3,
    comment: survey.comment
  })
  await h.api.submitMatchSurvey(matchId, 4, 3)
  assert.deepEqual(JSON.parse(h.calls[1].init.body), { funRating: 4, fairnessRating: 3 })
})

test('malformed backend comments are rejected; legacy and empty comments still work', async () => {
  for (const comment of [12, {}, 'x'.repeat(2001)]) {
    const h = await harness({ survey: { ...survey, comment }, pointsAwarded: 500 })
    await assert.rejects(h.api.submitMatchSurvey(matchId, 4, 3, 'ok'), /invalid/)
  }
  for (const comment of [undefined, null, '']) {
    const h = await harness({ survey: { ...survey, comment }, pointsAwarded: 0 })
    assert.equal((await h.api.submitMatchSurvey(matchId, 4, 3)).pointsAwarded, 0)
  }
})

test('every supported language covers the written feedback field', async () => {
  const module = new vm.SourceTextModule(
    transpile(
      await readFile(
        new URL('../src/renderer/src/features/i18n/map-feedback-translations.ts', import.meta.url),
        'utf8'
      )
    )
  )
  await module.link(() => {
    throw new Error('Unexpected import')
  })
  await module.evaluate()
  const translations = module.namespace.mapFeedbackTranslations
  for (const language of ['en', 'ru', 'tl', 'th', 'id', 'hi', 'pt', 'ja']) {
    assert.deepEqual(
      Object.keys(translations[language]).sort(),
      Object.keys(translations.en).sort()
    )
    assert.ok(
      Object.values(translations[language]).every(
        (value) => typeof value === 'string' && value.length > 0
      )
    )
  }
})
