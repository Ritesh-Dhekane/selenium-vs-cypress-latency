// Cypress network wait: wait for the listLibrary request to complete, then check once.
import { defineRuns } from './shared.js'

defineRuns({
  strategy: 'network_wait',
  label: 'Cypress Network',
  setup: () =>
    cy.intercept('POST', '/exec', (req) => {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      if (body?.action === 'listLibrary') req.alias = 'listLibrary'
    }),
  sync: () => cy.wait('@listLibrary', { timeout: Cypress.expose('settings').networkTimeoutMs }),
})
