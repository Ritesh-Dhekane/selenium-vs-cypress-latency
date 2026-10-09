// Runs 2am-notes-pro's real Google Apps Script backend (its .js files, unchanged) in Node, with small
// stand-ins for the Google services it uses: DriveApp reads a local copy of the Drive folder, the cache
// and script properties live in memory, and Google's token check accepts the experiment's test token.
// Adapted from tools/dev-tools/gas-harness.mjs.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

export function createRuntime({ appsScriptDir, driveRoot, props }) {
  const ROOT = path.resolve(driveRoot)
  const ids = new Map()
  const idOf = (p) => {
    p = path.resolve(p)
    if (p === ROOT) return 'ROOT'
    const id = 'id_' + Buffer.from(p).toString('base64url')
    ids.set(id, p)
    return id
  }
  const iter = (arr) => {
    let i = 0
    return { hasNext: () => i < arr.length, next: () => arr[i++] }
  }
  const MIME = { pdf: 'application/pdf', md: 'text/markdown', txt: 'text/plain', jpg: 'image/jpeg', png: 'image/png' }
  const mime = (n) => MIME[n.split('.').pop().toLowerCase()] || 'application/octet-stream'
  const entries = (p, dirs) => fs.readdirSync(p).filter((n) => fs.statSync(path.join(p, n)).isDirectory() === dirs)

  function folder(p) {
    return {
      getId: () => idOf(p),
      getName: () => path.basename(p),
      getFolders: () => iter(entries(p, true).map((n) => folder(path.join(p, n)))),
      getFoldersByName: (name) => {
        const q = path.join(p, name)
        return iter(fs.existsSync(q) && fs.statSync(q).isDirectory() ? [folder(q)] : [])
      },
      getFiles: () => iter(entries(p, false).map((n) => file(path.join(p, n)))),
      getParents: () => iter(path.dirname(p) === p ? [] : [folder(path.dirname(p))]),
    }
  }
  function file(p) {
    const st = fs.statSync(p)
    return {
      getId: () => idOf(p),
      getName: () => path.basename(p),
      getMimeType: () => mime(p),
      getSize: () => st.size,
      getLastUpdated: () => st.mtime,
      getParents: () => iter([folder(path.dirname(p))]),
      getBlob: () => ({ getBytes: () => [...fs.readFileSync(p)], getDataAsString: () => fs.readFileSync(p, 'utf8') }),
    }
  }

  const cache = new Map()
  const ctx = {
    console, JSON, Date, Error, Boolean, Math, Object, Array, String, Number, RegExp,
    DriveApp: {
      getFolderById: (id) => folder(id === 'ROOT' ? ROOT : ids.get(id)),
      getFileById: (id) => {
        if (!ids.has(id)) throw new Error('No item with the given ID could be found')
        return file(ids.get(id))
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v) }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k) ?? null,
        put: (k, v) => cache.set(k, v),
        removeAll: (ks) => ks.forEach((k) => cache.delete(k)),
      }),
    },
    // Stand-in for https://oauth2.googleapis.com/tokeninfo: the claims are read from the test token.
    UrlFetchApp: {
      fetch: (url) => {
        let claims = null
        try {
          const token = decodeURIComponent(String(url).split('id_token=')[1] || '')
          claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
        } catch {
          // invalid token
        }
        return claims
          ? { getResponseCode: () => 200, getContentText: () => JSON.stringify({ email_verified: 'true', ...claims }) }
          : { getResponseCode: () => 400, getContentText: () => '{}' }
      },
    },
    Utilities: {
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      formatDate: (d, tz) => d.toLocaleString('sv-SE', { timeZone: tz }),
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    SpreadsheetApp: { openById: () => { throw new Error('no log sheet in the experiment') } },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({}) },
    Logger: { log: () => {} },
  }
  vm.createContext(ctx)
  for (const f of fs.readdirSync(appsScriptDir).filter((n) => n.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(appsScriptDir, f), 'utf8'), ctx, { filename: f })
  }

  // Returns the JSON text the web app would send for a POST body.
  return { post: (body) => ctx.doPost({ postData: { contents: body } }) }
}
