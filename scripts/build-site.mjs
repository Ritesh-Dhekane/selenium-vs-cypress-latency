// Copies the site and the latest results into site-dist/ (what GitHub Pages serves).
//   node scripts/build-site.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(repo, 'site-dist')
fs.rmSync(out, { recursive: true, force: true })
fs.cpSync(path.join(repo, 'site'), out, { recursive: true })
fs.mkdirSync(path.join(out, 'data'), { recursive: true })
for (const f of ['experiment_results.csv', 'summary.csv', 'summary.json']) {
  const src = path.join(repo, 'results', f)
  if (!fs.existsSync(src)) throw new Error(`results/${f} is missing — run the experiment first`)
  fs.copyFileSync(src, path.join(out, 'data', f))
}
console.log(`Site built in ${out}`)
