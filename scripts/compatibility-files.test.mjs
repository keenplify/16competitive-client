/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  collectCompatibilityFiles,
  uploadCompatibilityFiles
} from '../src/main/compatibility-files.ts'

test('collection is bounded to fixed paths and rejects a directory junction escape', async () => {
  const root = await mkdtemp(join(tmpdir(), 'compat-files-'))
  const outside = await mkdtemp(join(tmpdir(), 'compat-outside-'))
  try {
    await writeFile(join(root, 'hw.dll'), Buffer.alloc(128, 1))
    await writeFile(join(root, 'secret.txt'), 'not an attachment')
    await mkdir(join(outside, 'cl_dlls'))
    await writeFile(join(outside, 'cl_dlls', 'GameUI.dll'), Buffer.alloc(128, 2))
    await symlink(outside, join(root, 'valve'), process.platform === 'win32' ? 'junction' : 'dir')
    const result = await collectCompatibilityFiles(root, 'win32')
    assert.deepEqual(
      result.files.map((f) => f.path),
      ['hw.dll']
    )
    assert.equal(result.totalBytes, 128)
    assert.equal(result.files[0].sha256.length, 64)
    assert.equal((await collectCompatibilityFiles(root, 'linux')).files.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('hash negotiation sends only missing content once and blocks unrequested hashes', async () => {
  const hash = 'a'.repeat(64)
  const value = {
    preview: { files: [{ path: 'hw.dll', size: 128, sha256: hash }] },
    bytes: new Map([[hash, Buffer.alloc(128)]])
  }
  const calls = []
  const request = async (url, init) => {
    calls.push({ url, init })
    return Response.json(calls.length === 1 ? { missing: [hash, hash] } : { sha256: hash })
  }
  await uploadCompatibilityFiles(
    'https://example.test',
    'token',
    'report',
    value,
    () => true,
    request
  )
  assert.equal(calls.length, 2)
  assert.equal(calls[1].init.body.get('file').size, 128)
  assert.equal(calls[1].init.redirect, 'error')
  let uploads = 0
  await uploadCompatibilityFiles(
    'https://example.test',
    'token',
    'report',
    value,
    () => true,
    async () => {
      uploads++
      return Response.json({ missing: [] })
    }
  )
  assert.equal(uploads, 1)
  await assert.rejects(
    uploadCompatibilityFiles(
      'https://example.test',
      'token',
      'report',
      value,
      () => true,
      async () => Response.json({ missing: ['b'.repeat(64)] })
    )
  )
  await assert.rejects(
    uploadCompatibilityFiles('https://example.test', 'token', 'report', value, () => false, request)
  )
})
