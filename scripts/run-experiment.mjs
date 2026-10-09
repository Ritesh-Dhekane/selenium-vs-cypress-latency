// Runs the whole experiment and writes real results only.
//   node scripts/run-experiment.mjs [--runs 10] [--latencies 0,500,1000,1500,2000] [--only selenium|cypress]
//                                   [--no-retry-mode] [--headless]
// For each latency (outer loop) and each configuration (inner loop) it runs a batch of `runs` page loads
// in a fresh visible browser, appending one CSV row per run to results/experiment_results.csv as it
// goes. Then it writes results/summary.json and results/summary.csv.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_URL, SETTINGS } from '../backend/config.mjs'
import { openBrowser, runOnce, SELENIUM_STRATEGIES } from '../suites/selenium.mjs'
import { summarize, writeSummaries } from './summarize.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback)
const RUNS = Number(opt('runs', 10))
const LATENCIES = opt('latencies', '0,500,1000,1500,2000').split(',').map(Number)
const ONLY = opt('only', null)
const HEADED = !args.includes('--headless')
const WITH_RETRY = !args.includes('--no-retry-mode')

const RESULTS_DIR = path.join(repo, 'results')
const CSV = path.join(RESULTS_DIR, 'experiment_results.csv')
const COLUMNS = ['framework', 'strategy', 'check_mode', 'latency_ms', 'run_number', 'status', 'duration_ms', 'request_ms', 'started_at', 'browser', 'headed', 'sync_setting', 'error']

const CONFIGS = [
  { framework: 'selenium', strategy: 'implicit_wait', checkMode: 'strict', setting: SELENIUM_STRATEGIES.implicit_wait.setting },
  { framework: 'selenium', strategy: 'explicit_wait', checkMode: 'strict', setting: SELENIUM_STRATEGIES.explicit_wait.setting },
  { framework: 'cypress', strategy: 'explicit_wait', checkMode: 'strict', setting: `cy.wait(${SETTINGS.fixedWaitMs})` },
  { framework: 'cypress', strategy: 'network_wait', checkMode: 'strict', setting: `cy.wait('@listLibrary') ≤${SETTINGS.networkTimeoutMs} ms` },
  ...(WITH_RETRY
    ? [
        { framework: 'cypress', strategy: 'explicit_wait', checkMode: 'retry', setting: `cy.wait(${SETTINGS.fixedWaitMs}) + 4000 ms assertion retry` },
        { framework: 'cypress', strategy: 'network_wait', checkMode: 'retry', setting: `cy.wait('@listLibrary') + 4000 ms assertion retry` },
      ]
    : []),
].filter((c) => !ONLY || c.framework === ONLY)

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function appendRow(row) {
  fs.appendFileSync(CSV, COLUMNS.map((c) => csvCell(row[c])).join(',') + '\n')
}

async function setLatency(ms) {
  const r = await fetch(`${BASE_URL}/__latency?ms=${ms}`)
  const { latencyMs } = await r.json()
  if (latencyMs !== ms) throw new Error(`server latency is ${latencyMs}, expected ${ms}`)
}

async function runSelenium(config, latency) {
  const label = SELENIUM_STRATEGIES[config.strategy].label
  const { driver, browser } = await openBrowser({ headed: HEADED })
  try {
    for (let run = 1; run <= RUNS; run++) {
      const r = await runOnce(driver, config.strategy)
      appendRow({ ...base(config, latency, run, browser), status: r.status, duration_ms: r.durationMs, request_ms: r.requestMs, started_at: r.startedAt, error: r.error })
      console.log(`[${label} | ${latency}ms | Run ${run}/${RUNS}] ${r.status} - ${r.durationMs}ms${r.error ? ` (${r.error})` : ''}`)
    }
  } finally {
    await driver.quit()
  }
}

function runCypress(config, latency) {
  const tmp = path.join(RESULTS_DIR, '.cypress-batch.jsonl')
  fs.rmSync(tmp, { force: true })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE // set by VS Code-like terminals; breaks Cypress start-up
  const cliArgs = ['cypress', 'run', '--browser', 'chrome', HEADED ? '--headed' : '--headless', '--quiet', '--spec', `suites/cypress/${config.strategy}.cy.js`, '--expose', `runs=${RUNS},latency=${latency},checkMode=${config.checkMode}`, '--env', `resultsFile=${tmp}`]
  return new Promise((resolve) => {
    const child = spawn('npx', cliArgs, { cwd: repo, env, shell: true })
    // Show only the progress lines the record task prints.
    child.stdout.on('data', (d) => String(d).split('\n').filter((l) => l.startsWith('[')).forEach((l) => console.log(l.trim())))
    child.on('close', () => {
      const records = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
      for (let run = 1; run <= RUNS; run++) {
        const r = records.find((x) => x.run === run)
        if (r) appendRow({ ...base(config, latency, run, r.browser), status: r.status, duration_ms: r.durationMs, request_ms: r.requestMs, started_at: r.startedAt, error: r.error })
        else {
          // Cypress itself failed before this run reported: recorded as FAIL without a duration.
          appendRow({ ...base(config, latency, run, 'chrome'), status: 'FAIL', duration_ms: '', error: 'Cypress run ended before this test reported' })
          console.log(`[Cypress ${config.strategy} | ${latency}ms | Run ${run}/${RUNS}] FAIL - (no result: Cypress run ended early)`)
        }
      }
      fs.rmSync(tmp, { force: true })
      resolve()
    })
  })
}

function base(config, latency, run, browser) {
  return { framework: config.framework, strategy: config.strategy, check_mode: config.checkMode, latency_ms: latency, run_number: run, browser, headed: HEADED, sync_setting: config.setting }
}

// ---------- main ----------
try {
  await fetch(`${BASE_URL}/__latency`)
} catch {
  console.error(`The system under test isn't running. Start it first:\n  npm run server   (after npm run build-app)`)
  process.exit(1)
}
fs.mkdirSync(RESULTS_DIR, { recursive: true })
if (fs.existsSync(CSV)) fs.renameSync(CSV, CSV.replace('.csv', `.previous-${Date.now()}.csv`))
fs.writeFileSync(CSV, COLUMNS.join(',') + '\n')

const total = CONFIGS.length * LATENCIES.length * RUNS
console.log(`Experiment: ${CONFIGS.length} configurations × ${LATENCIES.length} latencies × ${RUNS} runs = ${total} runs (${HEADED ? 'visible browser' : 'headless'})\n`)
const started = Date.now()
try {
  for (const latency of LATENCIES) {
    await setLatency(latency)
    for (const config of CONFIGS) {
      if (config.framework === 'selenium') await runSelenium(config, latency)
      else await runCypress(config, latency)
    }
  }
} finally {
  await setLatency(0).catch(() => {})
}

const summary = summarize(CSV)
writeSummaries(summary, RESULTS_DIR)
console.log(`\nFinished in ${Math.round((Date.now() - started) / 60000)} min.\n`)
console.table(
  summary.map((s) => ({ config: `${s.framework} ${s.strategy}${s.check_mode === 'retry' ? ' (retry)' : ''}`, latency_ms: s.latency_ms, runs: s.runs, pass: s.passed, breakage_rate: `${(s.breakage_rate * 100).toFixed(0)}%`, mean_ms: s.mean_ms, median_ms: s.median_ms, sd_ms: s.sd_ms })),
)
console.log('\nEXPERIMENT COMPLETE. Results saved to results/experiment_results.csv and results/summary.csv. Share these files with Claude to build your Presentation 2.')
