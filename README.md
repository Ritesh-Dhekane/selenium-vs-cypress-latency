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

## Run it
Expects these folders next to this repo: `2am-notes-pro/` (app source) and `drive/MCA-Sem-II/` (data);
override with `APP_SOURCE` and `DRIVE_DATA`.
```
npm install
npm run build-app      # builds 2am-notes-pro into app-dist/, pointed at the local backend
npm run server         # app + backend on http://localhost:8787
```
`GET /__latency?ms=500` sets the added latency (`/__latency` shows it).

## License
MIT — see [LICENSE](LICENSE). You may reuse the code and data with attribution.
