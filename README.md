# Selenium vs Cypress under network latency

**An Empirical Comparison of Selenium and Cypress Synchronization Strategies Under Network Latency**

MCA Semester III research project · Ritesh Dhekane (MC25075) · Guide: Nikhil Murkunde

This repository contains everything needed to reproduce the experiment: the system under test, the four
test suites, the runner, the raw results and the results website.

## What is measured
The same UI scenario is automated four ways and run under added network latency:

| Framework | Strategy | Synchronization |
|---|---|---|
| Selenium | Implicit wait | `driver.manage().setTimeouts({ implicit })` |
| Selenium | Explicit wait | `WebDriverWait` until the element's text is visible |
| Cypress | Explicit (fixed) wait | `cy.wait(<ms>)`, then a single assertion |
| Cypress | Network wait | `cy.intercept` + `cy.wait('@listLibrary')`, then the assertion |

Scenario: open the **Subjects** page of 2AM Notes Pro (Semester II), wait for the library request
(`listLibrary`) and check that the **Java Programming** subject card is visible.

Latency: 0, 500, 1000, 1500 and 2000 ms, added on the server to the `listLibrary` response, identical for
both frameworks.

## System under test
[2AM Notes Pro](https://github.com/Ritesh-Dhekane/2am-notes-pro) (React + Vite) with its real Google Apps
Script backend code, run locally (`backend/`) over a local copy of the Semester II Drive folder, so latency
can be controlled exactly and Google's own response time doesn't add noise. Tests sign in with a test
session (`backend/config.mjs`) instead of Google sign-in.

### Check rule
- **strict** (main experiment): after its synchronization step each strategy makes **one immediate check**
  (no retrying), so the result shows whether the wait strategy alone guarantees the UI is ready. The
  Selenium explicit wait is the exception: its wait *is* the check.
- **retry** (extra comparison, Cypress only): the same two Cypress suites with Cypress's default 4 s assertion
  retry after the wait — how Cypress tests are usually written.

Settings: implicit wait 5000 ms; `WebDriverWait` 10000 ms; `cy.wait(1000)`; `cy.wait('@listLibrary')`
timeout 10000 ms (`backend/config.mjs`). Every run is a full page load in a **visible** Chrome window;
duration is measured inside the test from navigation to the check.

## Results
- `results/experiment_results.csv` — one row per run: `framework, strategy, check_mode, latency_ms,
  run_number, status, duration_ms, request_ms, started_at, browser, headed, sync_setting, error`.
  `request_ms` is how long the delayed request took, from the browser's resource timing.
- `results/summary.csv` / `summary.json` — per configuration and latency: runs, passed, failed,
  breakage rate, mean / median / SD / min / max duration, mean duration of passing runs.
- `results/run-log.txt` — the console output of the run.
- Website: `npm run site` (http://localhost:8790), published to GitHub Pages from `site/`.

## Reproduce
Needs Node 20+ and Google Chrome. Expects `2am-notes-pro/` (app source) and `drive/MCA-Sem-II/` (data)
next to this repo; override with `APP_SOURCE` and `DRIVE_DATA`.
```
npm install
npm run build-app      # builds 2am-notes-pro into app-dist/, pointed at the local backend
npm run server         # app + backend on http://localhost:8787 (leave running)
npm run experiment     # in a second terminal: 6 configurations × 5 latencies × 10 runs
```
Options: `npm run experiment -- --runs 3 --latencies 0,1000 --only cypress --headless --no-retry-mode`.
Single suites: `npm run selenium -- explicit_wait 500 3`, `npm run cypress:open`.
`GET /__latency?ms=500` sets the added latency by hand.

## Cite
Dhekane, R. (2026). *An Empirical Comparison of Selenium and Cypress Synchronization Strategies Under
Network Latency* [Code and dataset]. GitHub. https://github.com/Ritesh-Dhekane/selenium-vs-cypress-latency

## License
MIT — see [LICENSE](LICENSE). You may reuse the code and data with attribution.
