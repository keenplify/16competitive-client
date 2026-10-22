import assert from 'node:assert/strict'
import test from 'node:test'
import { partnerMapImageUrl, serverArtworkSources } from '../src/shared/partner-community.ts'

test('uploaded server images lead, cached map images replace community fallbacks', () => {
  const server = {
    imageUrl: 'https://example.test/community.jpg',
    mapImageUrl: 'https://example.test/map.jpg'
  }
  assert.deepEqual(serverArtworkSources({ ...server, imageUploaded: true }, '/bundled.jpg'), [
    server.imageUrl,
    '/bundled.jpg',
    server.mapImageUrl
  ])
  assert.deepEqual(serverArtworkSources({ ...server, imageUploaded: false }, '/bundled.jpg'), [
    '/bundled.jpg',
    server.mapImageUrl,
    server.imageUrl
  ])
  assert.deepEqual(serverArtworkSources({ imageUrl: server.imageUrl }), [server.imageUrl])
  assert.deepEqual(serverArtworkSources({ imageUploaded: false }), [])
})

test('map preview URLs retain the selected API origin and reject traversal', () => {
  assert.equal(
    partnerMapImageUrl('DE_InfErno', 'https://eu.example.test'),
    'https://eu.example.test/partners/map-preview/de_inferno'
  )
  for (const name of [null, '../secret', 'https://other.test', 'a?b', 'a'.repeat(65)])
    assert.equal(partnerMapImageUrl(name, 'https://eu.example.test'), null)
})

test('registered HD maps precede bundled and GameTracker previews, after a server upload', () => {
  const server = { imageUploaded: true, imageUrl: '/upload.jpg', mapImageUrl: '/gametracker.jpg' }
  assert.deepEqual(serverArtworkSources(server, '/bundled.jpg', '/registered.jpg'), [
    '/upload.jpg',
    '/registered.jpg',
    '/bundled.jpg',
    '/gametracker.jpg'
  ])
})
