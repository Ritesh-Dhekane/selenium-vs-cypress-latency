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
