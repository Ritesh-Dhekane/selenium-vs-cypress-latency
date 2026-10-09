// Shared settings for the server, the test suites and the runner.

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8787'
export const CLIENT_ID = 'experiment-client'
// The request whose response is delayed: the one the scenario waits for.
export const DELAYED_ACTION = 'listLibrary'

// A test session: a token in the shape of a Google ID token (the local backend only reads its
// claims) and a saved Sem II choice, so the app opens straight to the signed-in pages.
export function sessionStorageItems() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    aud: CLIENT_ID,
    email: 'experiment@example.com',
    email_verified: true,
    name: 'Experiment Runner',
    given_name: 'Experiment',
    exp: Math.floor(Date.now() / 1000) + 24 * 3600,
  })}.test`
  return {
    'notes-pro.auth.idToken': token,
    'notes-pro.study': JSON.stringify({
      semester: 'MCA-Sem-II',
      electives: { electives: ['machine-learning-techniques', 'power-bi'] },
      updatedAt: new Date().toISOString(),
    }),
  }
}

// The scenario: open the Subjects page; listLibrary loads; this subject card must be visible.
export const SCENARIO = { path: '/subjects', expectedText: 'Java Programming' }

// Synchronization settings, documented in the README. Each strategy does its sync step and then one
// immediate check (no hidden retries), except the explicit wait, whose sync step is the check itself.
export const SETTINGS = {
  implicitWaitMs: 5000, // Selenium implicit wait
  explicitTimeoutMs: 10000, // Selenium WebDriverWait timeout
  fixedWaitMs: 1000, // Cypress cy.wait(ms)
  networkTimeoutMs: 10000, // Cypress cy.wait('@listLibrary') timeout
  pageLoadTimeoutMs: 30000,
}

// Browser-side: how long the delayed request took, from the browser's resource timing (found by the
// Server-Timing name the server adds). Empty when the request didn't happen.
export const REQUEST_MS_SCRIPT = `
  const e = performance.getEntriesByType('resource').find((r) => (r.serverTiming || []).some((t) => t.name === '${DELAYED_ACTION}'))
  return e ? Math.round(e.responseEnd - e.startTime) : null`
