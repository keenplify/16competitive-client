import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPartnerId, partnerIdFromDownloadName } from '../src/shared/partner-attribution.ts'
const id = '12345678-1234-4123-8123-123456789abc'
test('recognizes partner IDs on Windows downloads and Linux AppImages, including duplicate downloads', () => {
  assert.equal(partnerIdFromDownloadName(`16competitive-client--partner-${id}.exe`), id)
  assert.equal(partnerIdFromDownloadName(`16competitive-client--partner-${id}.AppImage`), id)
  assert.equal(partnerIdFromDownloadName(`16competitive-client--partner-${id} (1).AppImage`), id)
  assert.equal(partnerIdFromDownloadName('16competitive-client.AppImage'), null)
  assert.equal(partnerIdFromDownloadName(`16competitive-client--partner-${id}.txt`), null)
  assert.equal(isPartnerId('../bad'), false)
})
