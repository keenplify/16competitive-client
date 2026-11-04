/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
async function files(root) {
  const found = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) found.push(...(await files(path)))
    else if (entry.name.endsWith('.tsx')) found.push(path)
  }
  return found
}
test('windowed shared dialogs put body padding in the content slot, outside the title bar', async () => {
  const violations = []
  let checked = 0
  for (const file of await files('src/renderer/src')) {
    const source = ts.createSourceFile(
      file,
      await readFile(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    )
    function visit(node) {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(source) === 'ModalDialog'
      ) {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute)
        const get = (name) => attrs.find((a) => a.name.getText(source) === name)
        if (!get('fullScreen') && get('vguiTitlebar')?.initializer?.getText(source) !== '{false}') {
          checked++
          const classes = get('className')?.initializer
          if (
            classes &&
            ts.isStringLiteral(classes) &&
            classes.text.split(/\s+/).some((c) => /(?:^|:)p[xysetblr]?-(?!0$)/.test(c))
          )
            violations.push(file)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.ok(checked > 15, 'Check all shared windowed modals')
  assert.deepEqual(
    violations,
    [],
    'Move padding into ModalDialog contentClassName; the frame also contains its title bar'
  )
})
