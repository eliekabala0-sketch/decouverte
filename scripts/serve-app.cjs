const http = require('http')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../app/dist')
const port = Number(process.env.PORT || 3000)
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

http
  .createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url || '/').split('?')[0])
    const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
    const requestedPath = path.resolve(root, relativePath)
    const safePath =
      requestedPath === root || requestedPath.startsWith(`${root}${path.sep}`)
        ? requestedPath
        : path.join(root, 'index.html')

    fs.stat(safePath, (statError, stat) => {
      const filePath = !statError && stat.isFile() ? safePath : path.join(root, 'index.html')
      fs.readFile(filePath, (readError, content) => {
        if (readError) {
          response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
          response.end('Application indisponible')
          return
        }

        response.writeHead(200, {
          'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
          'Cache-Control': filePath.endsWith('service-worker.js') ? 'no-cache' : 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        })
        response.end(content)
      })
    })
  })
  .listen(port, '0.0.0.0', () => {
    console.log(`Découverte PWA listening on port ${port}`)
  })
