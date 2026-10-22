import assert from 'node:assert/strict'
import test from 'node:test'
import { useChatTranslationStore } from '../src/renderer/src/features/settings/chat-translation.store.ts'

test('translation stays off until the player chooses a language in Settings', async () => {
  const previousWindow = globalThis.window
  let savedLanguage = null
  const writes = []
  globalThis.window = {
    api: {
      auth: {
        getChatTranslation: async () => ({ language: savedLanguage }),
        setChatTranslation: async (language) => {
          writes.push(language)
          savedLanguage = language
          return { language }
        }
      }
    }
  }
  try {
    const store = useChatTranslationStore
    store.getState().reset()
    assert.equal(store.getState().language, 'off')
    await store.getState().load()
    assert.equal(store.getState().language, 'off')
    assert.deepEqual(writes, [])

    await store.getState().setLanguage('pt-br')
    assert.equal(store.getState().language, 'pt-br')
    assert.deepEqual(writes, ['pt-br'])
    store.getState().reset()
    await store.getState().load()
    assert.equal(store.getState().language, 'pt-br')
    assert.deepEqual(writes, ['pt-br'])

    await store.getState().setLanguage('off')
    store.getState().reset()
    await store.getState().load()
    assert.equal(store.getState().language, 'off')
    assert.deepEqual(writes, ['pt-br', 'off'])

    globalThis.window.api.auth.getChatTranslation = async () => {
      throw new Error('Offline')
    }
    await store.getState().load()
    assert.equal(store.getState().language, 'off')
    assert.equal(store.getState().error, true)
    assert.deepEqual(writes, ['pt-br', 'off'])
  } finally {
    useChatTranslationStore.getState().reset()
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
