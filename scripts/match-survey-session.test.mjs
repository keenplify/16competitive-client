import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  deferMatchSurveyForSession,
  isMatchSurveyDeferredForSession,
  reopenMatchSurveyForSession
} from '../src/renderer/src/features/matchmaking/match-survey-session.ts'

test('deferred map feedback can be reopened without affecting another player or match', () => {
  const entries = new Map()
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key)
    }
  }

  deferMatchSurveyForSession('player-a', 'match-1')
  assert.equal(isMatchSurveyDeferredForSession('player-a', 'match-1'), true)
  assert.equal(isMatchSurveyDeferredForSession('player-a', 'match-2'), false)
  assert.equal(isMatchSurveyDeferredForSession('player-b', 'match-1'), false)

  reopenMatchSurveyForSession('player-a', 'match-1')
  assert.equal(isMatchSurveyDeferredForSession('player-a', 'match-1'), false)
})
