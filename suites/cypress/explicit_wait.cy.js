// Cypress explicit (fixed) wait: wait a fixed time, then check once.
import { defineRuns } from './shared.js'

defineRuns({
  strategy: 'explicit_wait',
  label: 'Cypress Explicit',
  sync: () => cy.wait(Cypress.expose('settings').fixedWaitMs),
})
