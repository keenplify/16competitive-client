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

test('CS 1.3 collects both mod layouts and legacy renderer libraries only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'compat-cs13-'))
  try {
    for (const mod of ['cstrike', 'cstrk13']) {
      await mkdir(join(root, mod, 'cl_dlls'), { recursive: true })
      await writeFile(join(root, mod, 'cl_dlls', 'client.dll'), Buffer.alloc(128, 1))
      await writeFile(join(root, mod, 'cl_dlls', 'client.so'), Buffer.alloc(128, 2))
    }
    for (const name of ['sw.dll', 'vgui.dll', 'steam.dll', 'sw.so'])
      await writeFile(join(root, name), Buffer.alloc(128, 3))
    const windows = await collectCompatibilityFiles(root, 'win32', 'cs13')
    assert.deepEqual(
      windows.files.map((f) => f.path),
      ['cstrike/cl_dlls/client.dll', 'cstrk13/cl_dlls/client.dll', 'sw.dll', 'vgui.dll']
    )
    assert.equal(windows.bytes.size, 2)
    const linux = await collectCompatibilityFiles(root, 'linux', 'cs13')
    assert.deepEqual(
      linux.files.map((f) => f.path),
      ['cstrike/cl_dlls/client.so', 'cstrk13/cl_dlls/client.so', 'sw.so']
    )
    assert.equal(
      (await collectCompatibilityFiles(root, 'win32')).files.some((f) =>
        f.path.startsWith('cstrk13/')
      ),
      false
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

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
