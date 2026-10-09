// Summarises results/experiment_results.csv per configuration and latency: runs, passes, breakage rate
// (failed / runs) and execution-time statistics over all runs with a duration.
//   node scripts/summarize.mjs   (rewrites results/summary.json and results/summary.csv)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') row.push(cell), (cell = '')
    else if (ch === '\n') row.push(cell), rows.push(row), (row = []), (cell = '')
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  const [header, ...data] = rows
  return data.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

const round = (n) => (Number.isFinite(n) ? Math.round(n) : null)

export function summarize(csvPath) {
  const runs = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const groups = new Map()
  for (const r of runs) {
    const key = [r.framework, r.strategy, r.check_mode, r.latency_ms].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  return [...groups.values()].map((list) => {
    const d = list.map((r) => Number(r.duration_ms)).filter((n) => r_ok(n)).sort((a, b) => a - b)
    const passD = list.filter((r) => r.status === 'PASS').map((r) => Number(r.duration_ms))
    const mean = d.reduce((a, b) => a + b, 0) / d.length
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, d.length - 1))
    const passed = list.filter((r) => r.status === 'PASS').length
    return {
      framework: list[0].framework,
      strategy: list[0].strategy,
      check_mode: list[0].check_mode,
      latency_ms: Number(list[0].latency_ms),
      runs: list.length,
      passed,
      failed: list.length - passed,
      breakage_rate: Number(((list.length - passed) / list.length).toFixed(3)),
      mean_ms: round(mean),
      median_ms: round(d.length ? (d[(d.length - 1) >> 1] + d[d.length >> 1]) / 2 : NaN),
      sd_ms: round(sd),
      min_ms: d[0] ?? null,
      max_ms: d.at(-1) ?? null,
      mean_pass_ms: round(passD.reduce((a, b) => a + b, 0) / passD.length),
    }
  })
}

function r_ok(n) {
  return Number.isFinite(n) && n > 0
}

export function writeSummaries(summary, dir) {
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  const cols = Object.keys(summary[0] ?? {})
  fs.writeFileSync(path.join(dir, 'summary.csv'), [cols.join(','), ...summary.map((s) => cols.map((c) => s[c] ?? '').join(','))].join('\n') + '\n')
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'results')
  const summary = summarize(path.join(dir, 'experiment_results.csv'))
  writeSummaries(summary, dir)
  console.table(summary)
}
