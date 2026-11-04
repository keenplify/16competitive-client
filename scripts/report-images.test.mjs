import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateReportImages } from '../src/shared/diagnostic-logs.ts'
import { build } from 'esbuild'
const bundle = await build({
  entryPoints: ['src/shared/stickers.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node'
})
const { parseStickerPurchase } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
)
import { readFile } from 'node:fs/promises'
test('IPC report attachments reject unsupported types and unbounded payloads', () => {
  const image = { mime: 'image/png', data: 'AAAA' }
  assert.deepEqual(validateReportImages(undefined), [])
  assert.deepEqual(validateReportImages([image]), [image])
  for (const value of [
    null,
    {},
    Array(4).fill(image),
    [{ ...image, mime: 'image/svg+xml' }],
    [{ ...image, data: 'x'.repeat(2796205) }],
    [{ ...image, data: 'https://example.com' }]
  ])
    assert.throws(() => validateReportImages(value))
})
test('purchase navigation uses validated owned item identifiers', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  assert.deepEqual(parseStickerPurchase({ id }), { id })
  for (const result of [undefined, { id: 'catalog-sticker' }, { id: '../../other' }])
    assert.throws(() => parseStickerPurchase(result))
})
test('report and purchase labels cover every supported language', async () => {
  for (const file of ['issue-report-translations', 'inventory-translations']) {
    const labels = JSON.parse(
      await readFile(new URL(`../src/shared/${file}.json`, import.meta.url), 'utf8')
    )
    for (const lang of ['en', 'ru', 'tl', 'th', 'id', 'hi', 'pt', 'ja']) {
      assert.deepEqual(Object.keys(labels[lang]), Object.keys(labels.en))
      assert.ok(
        Object.values(labels[lang]).every((value) => typeof value === 'string' && value.length > 0)
      )
    }
  }
})
