// The scenario for both Cypress suites. `sync` is the strategy's synchronization step; after it comes
// the check. checkMode "strict" (main experiment): one immediate check ({ timeout: 0 }, no retrying),
// like the Selenium suites. checkMode "retry": Cypress's default assertion retry (4 s), how Cypress
// tests are usually written.
export function defineRuns({ strategy, label, sync, setup = () => {} }) {
  const env = Cypress.expose()
  const runs = Number(env.runs ?? 1)
  const latencyMs = Number(env.latency ?? 0)
  const checkMode = env.checkMode === 'retry' ? 'retry' : 'strict'
  const checkTimeout = checkMode === 'retry' ? 4000 : 0
  const { scenario } = env

  describe(`${label} (${checkMode}) @ ${latencyMs} ms`, () => {
    let t0 = 0
    let startedAt = ''
    let durationMs = null
    let session = {}

    before(() => cy.task('session').then((s) => (session = s)))

    for (let run = 1; run <= runs; run++) {
      it(`run ${run}`, () => {
        durationMs = null
        setup()
        cy.then(() => {
          startedAt = new Date().toISOString()
          t0 = performance.now()
        })
        cy.visit(scenario.path, {
          onBeforeLoad(win) {
            for (const [k, v] of Object.entries(session)) win.localStorage.setItem(k, v)
          },
        })
        sync()
        cy.contains('main *', scenario.expectedText, { timeout: checkTimeout, matchCase: true }).should('be.visible')
        cy.then(() => (durationMs = Math.round(performance.now() - t0)))
      })
    }

    afterEach(function () {
      const test = this.currentTest
      const elapsed = durationMs ?? Math.round(performance.now() - t0)
      cy.window({ log: false }).then((win) => {
        let requestMs = null
        try {
          requestMs = new win.Function(env.requestScript)()
        } catch {
          // page not loaded
        }
        cy.task('record', {
          framework: 'cypress',
          strategy,
          checkMode,
          label: checkMode === 'retry' ? `${label} (retry)` : label,
          browser: `${Cypress.browser.name} ${Cypress.browser.version}`,
          latencyMs,
          run: Number(test.title.replace('run ', '')),
          runs,
          status: test.state === 'passed' ? 'PASS' : 'FAIL',
          durationMs: elapsed,
          startedAt,
          error: test.state === 'passed' ? '' : String(test.err?.message ?? '').split('\n')[0].slice(0, 200),
          requestMs,
        })
      })
    })
  })
}
