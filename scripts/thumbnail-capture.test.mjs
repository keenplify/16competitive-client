import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captureThumbnail } from '../src/renderer/src/features/skins/thumbnail-capture.ts'

test('Firefox canvas capture failure rejects without escaping the render callback', async () => {
  const failure = new Error('NS_ERROR_FAILURE')
  let capture
  assert.doesNotThrow(() => {
    capture = captureThumbnail({
      toBlob() {
        throw failure
      }
    })
  })
  await assert.rejects(capture, (error) => error === failure)
})

test('context loss returning an empty capture is a recoverable failure', async () => {
  await assert.rejects(
    captureThumbnail({
      toBlob(callback) {
        callback(null)
      }
    }),
    /no image/
  )
})

test('successful canvas capture keeps the PNG bytes', async () => {
  const image = new Blob(['png'], { type: 'image/png' })
  assert.equal(
    await captureThumbnail({
      toBlob(callback, type) {
        assert.equal(type, 'image/png')
        callback(image)
      }
    }),
    image
  )
})
