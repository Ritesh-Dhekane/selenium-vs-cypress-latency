// The system under test, on one local port:
//   /            the built 2am-notes-pro app (app-dist/, single-page app)
//   POST /exec   its real Apps Script backend over drive/MCA-Sem-II (see apps-script-runtime.mjs)
//   GET  /__latency?ms=N   sets the artificial delay added to listLibrary responses (the experiment's
//                          network latency); GET /__latency reports it.
// Usage: node backend/server.mjs [--port 8787]
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRuntime } from './apps-script-runtime.mjs'
import { CLIENT_ID, DELAYED_ACTION } from './config.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const APP_DIR = path.join(repo, 'app-dist')
const PORT = process.argv.includes('--port') ? Number(process.argv[process.argv.indexOf('--port') + 1]) : 8787
const APP_SOURCE = path.resolve(process.env.APP_SOURCE ?? path.join(repo, '..', '2am-notes-pro'))
const DRIVE = path.resolve(process.env.DRIVE_DATA ?? path.join(repo, '..', 'drive'))

const runtime = createRuntime({
  appsScriptDir: path.join(APP_SOURCE, 'apps-script'),
  driveRoot: DRIVE,
  props: { DRIVE_ROOT_FOLDER_ID: 'ROOT', GOOGLE_CLIENT_ID: CLIENT_ID },
})

let latencyMs = 0
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost')
  let file = path.join(APP_DIR, decodeURIComponent(url.pathname))
  if (!file.startsWith(APP_DIR)) return res.writeHead(403).end()
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(APP_DIR, 'index.html') // SPA routes
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/__latency') {
      if (url.searchParams.has('ms')) latencyMs = Math.max(0, Number(url.searchParams.get('ms')) || 0)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ latencyMs }))
      return
    }
    if (url.pathname === '/exec' && req.method === 'POST') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        let action = ''
        try {
          action = JSON.parse(body).action
        } catch {
          // the backend reports invalid requests itself
        }
        const out = runtime.post(body)
        const delay = action === DELAYED_ACTION ? latencyMs : 0
        setTimeout(() => res.writeHead(200, { 'Content-Type': 'application/json' }).end(out), delay)
      })
      return
    }
    if (!fs.existsSync(APP_DIR)) return res.writeHead(500).end('app-dist/ is missing: run npm run build-app')
    serveStatic(req, res)
  })
  .listen(PORT, () => console.log(`System under test on http://localhost:${PORT} (app + /exec, delayed action: ${DELAYED_ACTION})`))
