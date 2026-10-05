/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const { join } = require('node:path')

const root = join(__dirname, '..', 'resources', 'scoreboard')
const types = {
  'index.html': 'text/html; charset=utf-8',
  'renderer.js': 'text/javascript; charset=utf-8',
  'scoreboard.css': 'text/css; charset=utf-8'
}

const server = createServer(async (request, response) => {
  const name = new URL(request.url ?? '/', 'http://127.0.0.1').pathname.slice(1) || 'index.html'
  const font = /^fonts\/rajdhani-latin-(400|500|600|700)-normal\.woff2$/.test(name)
  if (!Object.hasOwn(types, name) && !font) {
    response.writeHead(404).end()
    return
  }
  try {
    const body = await readFile(join(root, name))
    response
      .writeHead(200, {
        'content-type': font ? 'font/woff2' : types[name],
        'cache-control': 'no-store'
      })
      .end(body)
  } catch {
    response.writeHead(500).end('Build the scoreboard overlay first.')
  }
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (typeof address === 'string' || !address) return
  console.log(`Kill card preview: http://127.0.0.1:${address.port}/?overlay=kill-cards-preview`)
})
