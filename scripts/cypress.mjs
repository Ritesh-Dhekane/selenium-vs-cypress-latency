// Starts Cypress with ELECTRON_RUN_AS_NODE removed: editors like VS Code set it, and Cypress then fails
// to start ("bad option: --smoke-test").
//   node scripts/cypress.mjs open
//   node scripts/cypress.mjs run --browser chrome --headed --spec suites/cypress/network_wait.cy.js --expose runs=3,latency=500
import { spawnSync } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync('npx', ['cypress', ...process.argv.slice(2)], { stdio: 'inherit', env, shell: true })
process.exit(result.status ?? 1)
