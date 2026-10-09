// Cypress settings for the experiment: no retries, videos or screenshots (they would add time), and a
// `record` task that appends each run's result to the file the runner reads.
import { appendFileSync } from 'node:fs'
import { defineConfig } from 'cypress'
import { BASE_URL, REQUEST_MS_SCRIPT, SCENARIO, SETTINGS, sessionStorageItems } from './backend/config.mjs'

export default defineConfig({
  e2e: {
    baseUrl: BASE_URL,
    specPattern: 'suites/cypress/*.cy.js',
    supportFile: false,
    video: false,
    screenshotOnRunFailure: false,
    retries: 0,
    viewportWidth: 1280,
    viewportHeight: 900,
    pageLoadTimeout: SETTINGS.pageLoadTimeoutMs,
    // Values the specs read with Cypress.expose(); runs/latency come from --expose on the command line.
    expose: { settings: SETTINGS, scenario: SCENARIO, requestScript: REQUEST_MS_SCRIPT },
    setupNodeEvents(on, config) {
      on('task', {
        session: () => sessionStorageItems(),
        record(result) {
          const file = config.env.resultsFile
          if (file) appendFileSync(file, JSON.stringify(result) + '\n')
          console.log(`[${result.label} | ${result.latencyMs}ms | Run ${result.run}/${result.runs}] ${result.status} - ${result.durationMs}ms${result.error ? ` (${result.error})` : ''}`)
          return null
        },
      })
      return config
    },
  },
})
