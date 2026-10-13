import assert from 'node:assert/strict'
import test from 'node:test'
import { detectLanguage } from '../src/shared/language-detection.ts'
const supported = ['en', 'ru', 'tl', 'th', 'id', 'hi', 'pt', 'ja']
test('uses the first supported system language and handles regional language tags', () => {
  assert.equal(detectLanguage(['fr-FR', 'ja-JP', 'en-US'], supported, 'en'), 'ja')
  assert.equal(detectLanguage(['pt-BR'], supported, 'en'), 'pt')
  assert.equal(detectLanguage([' RU_ru '], supported, 'en'), 'ru')
  assert.equal(detectLanguage(['fil-PH'], supported, 'en'), 'tl')
  assert.equal(detectLanguage(['in-ID'], supported, 'en'), 'id')
  assert.equal(detectLanguage(['de-DE'], supported, 'en'), 'en')
  assert.equal(detectLanguage([], supported, 'en'), 'en')
})
