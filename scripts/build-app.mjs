// Builds 2am-notes-pro (sibling folder, or APP_SOURCE) into app-dist/, talking to the local /exec
// backend. Analytics is switched off so no third-party traffic affects the timings.
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.resolve(process.env.APP_SOURCE ?? path.join(repo, '..', '2am-notes-pro'))
const out = path.join(repo, 'app-dist')
console.log(`Building ${source} -> ${out}`)
execSync(`npx vite build --base / --outDir "${out}" --emptyOutDir`, {
  cwd: source,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_BASE_URL: '/exec', VITE_GA_MEASUREMENT_ID: '', VITE_GOOGLE_CLIENT_ID: 'experiment-client' },
})
