// Results page: reads data/summary.json and data/experiment_results.csv (copied from results/ at build)
// and draws the charts and tables. No libraries — charts are plain SVG.

const CONFIGS = [
  { key: 'selenium|implicit_wait|strict', label: 'Selenium · implicit wait', color: '#2563eb', dash: '' },
  { key: 'selenium|explicit_wait|strict', label: 'Selenium · explicit wait', color: '#0891b2', dash: '' },
  { key: 'cypress|explicit_wait|strict', label: 'Cypress · fixed wait', color: '#dc2626', dash: '' },
  { key: 'cypress|network_wait|strict', label: 'Cypress · network wait', color: '#16a34a', dash: '' },
  { key: 'cypress|explicit_wait|retry', label: 'Cypress · fixed wait + retry', color: '#f97316', dash: '6 4', retry: true },
  { key: 'cypress|network_wait|retry', label: 'Cypress · network wait + retry', color: '#65a30d', dash: '6 4', retry: true },
]

const keyOf = (r) => `${r.framework}|${r.strategy}|${r.check_mode}`
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

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
  const [head, ...data] = rows
  return data.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

// Line chart: x = latency, one line per configuration. `value(s)` gives y, `band(s)` an optional ±.
function lineChart(el, summary, { value, band, yMax, yLabel, fmt, includeRetry }) {
  const W = 900
  const H = 380
  const m = { l: 64, r: 44, t: 16, b: 48 }
  const lats = [...new Set(summary.map((s) => s.latency_ms))].sort((a, b) => a - b)
  const x = (lat) => m.l + (lats.indexOf(lat) / Math.max(1, lats.length - 1)) * (W - m.l - m.r)
  const y = (v) => H - m.b - (v / yMax) * (H - m.t - m.b)
  const ticks = Array.from({ length: 6 }, (_, i) => (yMax * i) / 5)
  const configs = CONFIGS.filter((c) => includeRetry || !c.retry)
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)} by latency">`
  for (const t of ticks)
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="currentColor" stroke-opacity=".12"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`
  for (const lat of lats) svg += `<text x="${x(lat)}" y="${H - m.b + 20}" text-anchor="middle">${lat} ms</text>`
  svg += `<text x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">Added latency</text>`
  for (const c of configs) {
    const pts = summary.filter((s) => keyOf(s) === c.key).sort((a, b) => a.latency_ms - b.latency_ms)
    if (!pts.length) continue
    if (band)
      for (const p of pts) {
        const [lo, hi] = band(p)
        svg += `<line x1="${x(p.latency_ms)}" x2="${x(p.latency_ms)}" y1="${y(Math.max(0, lo))}" y2="${y(Math.min(yMax, hi))}" stroke="${c.color}" stroke-opacity=".35" stroke-width="6"/>`
      }
    svg += `<polyline fill="none" stroke="${c.color}" stroke-width="2.5" stroke-dasharray="${c.dash}" points="${pts.map((p) => `${x(p.latency_ms)},${y(value(p))}`).join(' ')}"/>`
    for (const p of pts) svg += `<circle cx="${x(p.latency_ms)}" cy="${y(value(p))}" r="4" fill="${c.color}"><title>${esc(c.label)} @ ${p.latency_ms} ms: ${fmt(value(p))}</title></circle>`
  }
  svg += '</svg>'
  const legend = configs.map((c) => `<span><i style="background:${c.color}"></i>${esc(c.label)}</span>`).join('')
  el.innerHTML = svg + `<div class="legend">${legend}</div>`
}

function kpis(summary, runs) {
  const total = runs.length
  const fails = runs.filter((r) => r.status === 'FAIL').length
  const worst = [...summary].filter((s) => s.check_mode === 'strict').sort((a, b) => b.breakage_rate - a.breakage_rate)[0]
  const label = (s) => CONFIGS.find((c) => c.key === keyOf(s))?.label ?? keyOf(s)
  const robust = CONFIGS.filter((c) => !c.retry && summary.filter((s) => keyOf(s) === c.key).every((s) => s.failed === 0)).map((c) => c.label)
  return `
    <div class="kpi"><b>${total}</b><span>real test runs</span></div>
    <div class="kpi"><b>${((fails / Math.max(1, total)) * 100).toFixed(1)}%</b><span>of all runs failed</span></div>
    <div class="kpi"><b>${worst ? `${(worst.breakage_rate * 100).toFixed(0)}%` : '–'}</b><span>worst breakage: ${worst ? `${esc(label(worst))} at ${worst.latency_ms} ms` : '–'}</span></div>
    <div class="kpi"><b>${robust.length}</b><span>strategies never failed (strict): ${esc(robust.join(', ') || 'none')}</span></div>`
}

function summaryTable(summary) {
  const cols = ['Configuration', 'Latency', 'Runs', 'Passed', 'Breakage', 'Mean ms', 'Median ms', 'SD ms', 'Min', 'Max']
  const label = (s) => CONFIGS.find((c) => c.key === keyOf(s))?.label ?? keyOf(s)
  const rows = [...summary]
    .sort((a, b) => CONFIGS.findIndex((c) => c.key === keyOf(a)) - CONFIGS.findIndex((c) => c.key === keyOf(b)) || a.latency_ms - b.latency_ms)
    .map(
      (s) =>
        `<tr><td>${esc(label(s))}</td><td class="num">${s.latency_ms}</td><td class="num">${s.runs}</td><td class="num">${s.passed}</td><td class="num ${s.failed ? 'FAIL' : 'PASS'}">${(s.breakage_rate * 100).toFixed(0)}%</td><td class="num">${s.mean_ms ?? ''}</td><td class="num">${s.median_ms ?? ''}</td><td class="num">${s.sd_ms ?? ''}</td><td class="num">${s.min_ms ?? ''}</td><td class="num">${s.max_ms ?? ''}</td></tr>`,
    )
  return `<thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>`
}

function runsTable(runs) {
  const cols = ['#', 'Framework', 'Strategy', 'Check', 'Latency', 'Run', 'Status', 'Duration ms', 'Request ms', 'Started', 'Error']
  const rows = runs.map(
    (r, i) =>
      `<tr><td class="num">${i + 1}</td><td>${esc(r.framework)}</td><td>${esc(r.strategy)}</td><td>${esc(r.check_mode)}</td><td class="num">${esc(r.latency_ms)}</td><td class="num">${esc(r.run_number)}</td><td class="${r.status}">${esc(r.status)}</td><td class="num">${esc(r.duration_ms)}</td><td class="num">${esc(r.request_ms)}</td><td>${esc(r.started_at.replace('T', ' ').slice(0, 19))}</td><td>${esc(r.error)}</td></tr>`,
  )
  return `<thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>`
}

async function main() {
  let summary, runs
  try {
    ;[summary, runs] = await Promise.all([
      fetch('data/summary.json').then((r) => r.json()),
      fetch('data/experiment_results.csv').then((r) => r.text()).then(parseCsv),
    ])
  } catch {
    document.getElementById('kpis').textContent = 'Results not found. Run the experiment, then npm run site.'
    return
  }
  document.getElementById('kpis').innerHTML = kpis(summary, runs)

  const draw = () => {
    const includeRetry = document.getElementById('show-retry').checked
    lineChart(document.getElementById('chart-break'), summary, { value: (s) => s.breakage_rate * 100, yMax: 100, yLabel: 'Breakage rate', fmt: (v) => `${Math.round(v)}%`, includeRetry })
    const maxMs = Math.max(...summary.map((s) => (s.mean_ms ?? 0) + (s.sd_ms ?? 0)))
    const yMax = Math.ceil(maxMs / 500) * 500 || 1000
    lineChart(document.getElementById('chart-time'), summary, { value: (s) => s.mean_ms ?? 0, band: (s) => [s.mean_ms - s.sd_ms, s.mean_ms + s.sd_ms], yMax, yLabel: 'Mean execution time', fmt: (v) => `${Math.round(v)}`, includeRetry })
  }
  document.getElementById('show-retry').addEventListener('change', draw)
  draw()

  document.getElementById('summary').innerHTML = summaryTable(summary)
  const latSel = document.getElementById('f-latency')
  for (const l of [...new Set(runs.map((r) => r.latency_ms))]) latSel.insertAdjacentHTML('beforeend', `<option>${esc(l)}</option>`)
  const filter = () => {
    const f = { framework: document.getElementById('f-framework').value, latency_ms: latSel.value, status: document.getElementById('f-status').value }
    const shown = runs.filter((r) => Object.entries(f).every(([k, v]) => !v || r[k] === v))
    document.getElementById('runs').innerHTML = runsTable(shown)
    document.getElementById('runs-count').textContent = `${shown.length} of ${runs.length} runs`
  }
  for (const id of ['f-framework', 'f-latency', 'f-status']) document.getElementById(id).addEventListener('change', filter)
  filter()
}

main()
