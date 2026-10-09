// Selenium suites: implicit wait and explicit wait. One visible Chrome window is reused for all runs of
// a batch; every run is a full page load of the Subjects page.
//   node suites/selenium.mjs <implicit_wait|explicit_wait> [latencyMs] [runs]   (needs `npm run server`)
import { Builder, By, until } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { pathToFileURL } from 'node:url'
import { BASE_URL, REQUEST_MS_SCRIPT, SCENARIO, SETTINGS, sessionStorageItems } from '../backend/config.mjs'

export const SELENIUM_STRATEGIES = {
  implicit_wait: { label: 'Selenium Implicit', setting: `implicit wait ${SETTINGS.implicitWaitMs} ms` },
  explicit_wait: { label: 'Selenium Explicit', setting: `WebDriverWait ${SETTINGS.explicitTimeoutMs} ms` },
}

// Any element in the page's main area whose whole text is the expected subject name.
const TARGET = By.xpath(`//main//*[normalize-space(.)='${SCENARIO.expectedText}']`)

export async function openBrowser({ headed = true } = {}) {
  const options = new chrome.Options().addArguments('--window-size=1280,900', '--no-first-run', '--disable-search-engine-choice-screen')
  if (!headed) options.addArguments('--headless=new')
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build()
  // Sign the app in with the test session (stored on the app's origin).
  await driver.get(`${BASE_URL}/__latency`)
  for (const [k, v] of Object.entries(sessionStorageItems())) await driver.executeScript('localStorage.setItem(arguments[0], arguments[1])', k, v)
  const caps = await driver.getCapabilities()
  return { driver, browser: `chrome ${caps.get('browserVersion')}` }
}

// One run of the scenario. Returns status, duration (navigation → check) and details.
export async function runOnce(driver, strategy) {
  const startedAt = new Date().toISOString()
  await driver.manage().setTimeouts({ implicit: strategy === 'implicit_wait' ? SETTINGS.implicitWaitMs : 0, pageLoad: SETTINGS.pageLoadTimeoutMs })
  const t0 = performance.now()
  let status = 'PASS'
  let error = ''
  try {
    await driver.get(BASE_URL + SCENARIO.path)
    let element
    if (strategy === 'implicit_wait') {
      element = await driver.findElement(TARGET) // waits up to the implicit timeout for the element to exist
    } else {
      element = await driver.wait(until.elementLocated(TARGET), SETTINGS.explicitTimeoutMs)
      await driver.wait(until.elementIsVisible(element), SETTINGS.explicitTimeoutMs)
    }
    // The single check, same as the Cypress suites: visible, with the expected text.
    const visible = await element.isDisplayed()
    const text = (await element.getText()).trim()
    if (!visible || text !== SCENARIO.expectedText) throw new Error(`check failed: visible=${visible} text="${text}"`)
  } catch (err) {
    status = 'FAIL'
    error = String(err?.message ?? err).split('\n')[0].slice(0, 200)
  }
  const durationMs = Math.round(performance.now() - t0)
  let requestMs = null
  try {
    requestMs = await driver.executeScript(REQUEST_MS_SCRIPT)
  } catch {
    // page gone or script failed: leave empty
  }
  return { status, durationMs, startedAt, error, requestMs }
}

// CLI: one batch, printing progress lines.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [strategy = 'explicit_wait', latency = '0', runs = '3'] = process.argv.slice(2)
  await fetch(`${BASE_URL}/__latency?ms=${latency}`)
  const { driver } = await openBrowser()
  try {
    for (let i = 1; i <= Number(runs); i++) {
      const r = await runOnce(driver, strategy)
      console.log(`[${SELENIUM_STRATEGIES[strategy].label} | ${latency}ms | Run ${i}/${runs}] ${r.status} - ${r.durationMs}ms${r.error ? ` (${r.error})` : ''}`)
    }
  } finally {
    await driver.quit()
    await fetch(`${BASE_URL}/__latency?ms=0`)
  }
}
