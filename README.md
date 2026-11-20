# AlteX — Student Portal

AlteX comes in two parts that share code:

| Part | What it is | Where it runs |
| --- | --- | --- |
| **Chrome extension** (`manifest.json`, `js/`, `css/`) | Redesigns the Alte University student portal (`students.alte.edu.ge`) in place and adds live info (next lecture, latest grade, assignments, payment countdown, exam countdowns). | Desktop Chrome/Edge, and any mobile browser that can load Chrome extensions. |
| **PWA** (`pwa/`) | An installable app: academic calendar, exam countdowns, days off, and one-tap links into the portal. Works offline. | Any modern browser; installs on Android and iOS. |
| **Shared** (`shared/`, `css/tokens.css`, `css/exam-strip.css`) | Date helpers, the 2026/2027 academic calendar, the exam-countdown tiles, colour tokens. No portal or extension APIs. | Both. |

## Why the PWA cannot show your grades or timetable

The extension's live features work because it runs **on the portal's own origin**: it reads the token the portal
stores (`localStorage["Student-Token"]`) and calls the portal API (`/student/...`) as the portal itself does.

A PWA is hosted on a different origin, and checks against the portal show:

- `/student/*` responses carry **no CORS headers**, and preflight requests get none either, so browsers
  block another site from reading them;
- pages are sent with `X-Frame-Options: SAMEORIGIN`, so the portal cannot be embedded in the app.

So the PWA does not log in, does not ask for your password and never reads personal data. Instead of faking
those features, it links straight to the matching portal page. Legitimate ways to bring them into the app:

1. **Ask the university to allow the app's origin** (`Access-Control-Allow-Origin: https://<your-pwa-host>`
   with `Authorization` allowed) or to publish a student API. This is the safest option.
2. **A backend proxy** that forwards requests with the student's token. It works technically, but students'
   credentials would pass through a third-party server, which needs the university's consent, proper hosting
   and a security review. It is deliberately **not** implemented.

## Features: mobile vs desktop

| Feature | Desktop extension | Mobile browser with the extension | Installed PWA |
| --- | --- | --- | --- |
| Portal redesign (all pages, dark theme) | ✓ | ✓ (responsive, touch-sized controls) | — (portal opens in the browser) |
| Next lecture, today's lectures, greeting | ✓ | ✓ | — needs portal API |
| Latest grade, score bars, points to pass | ✓ | ✓ | — needs portal API |
| Latest assignments | ✓ | ✓ | — needs portal API |
| Payment countdown | ✓ | ✓ | — needs portal API |
| Masked GPA / personal number | ✓ | ✓ | — needs portal API |
| Welcome screen after login | ✓ | ✓ | — |
| Exam countdowns, next day off | ✓ (timetable page) | ✓ | ✓ offline |
| Full academic calendar | — | — | ✓ offline |
| Quick links to portal pages | nav bar + "მეტი" | nav bar + "მეტი" | ✓ |
| Install to home screen, offline | — | — | ✓ |

## Install the extension (desktop)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** and select this folder.

It activates on `https://students.alte.edu.ge/*`.

## PWA: develop, test, build

Needs Node 18+. No npm dependencies; the end-to-end test uses Playwright if it is installed.

```sh
npm test            # static checks + unit tests (extension + PWA)
npm run build       # production build into dist/ (stamps the service-worker version)
npm run serve       # http://localhost:8080/pwa/  (localhost counts as secure, so install/offline work)
npm run test:e2e    # phone viewports: offline, install flow, update flow, no horizontal scroll, 44px targets
npm run icons       # re-render the PNG icons from pwa/icons/icon.svg
```

## Deploy the PWA

The app must be served over **HTTPS**. `dist/` is plain static files, so any static host works.

**GitHub Pages (set up in `.github/workflows/pwa.yml`)**

1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge to `main` (or run the "PWA" workflow by hand). The workflow runs `npm test`, `npm run build` and
   publishes `dist/`.
3. Open `https://<user>.github.io/<repo>/pwa/`. All paths are relative, so a sub-path is fine.

**Any other host** (Netlify, Cloudflare Pages, nginx…): run `npm run build` and upload `dist/`. Serve
`*.webmanifest` as `application/manifest+json` and `pwa/sw.js` with `Cache-Control: no-cache`, so updates are
picked up straight away.

**Installing**

- **Android (Chrome, Edge, Samsung Internet):** the app shows a "დააყენე AlteX" banner; or use the browser menu
  → *Install app* / *Add to Home screen*.
- **iOS / iPadOS (Safari):** Share → *Add to Home Screen*. The app shows these steps itself; other iOS browsers
  are told to open the page in Safari.
- A dismissed banner never comes back on that device; installing stays available under **ინფო**.

**Updates:** every build gets a new service-worker version (a hash of the shell files). Open apps notice it and
show "ხელმისაწვდომია ახალი ვერსია"; tapping **განახლება** switches to it and reloads. Old caches are deleted.

**Security:** the service worker caches only the app's own static files (listed in `pwa/sw.js`). It never
intercepts or stores portal requests, non-GET requests or anything cross-origin. A Content-Security-Policy limits
the app to its own scripts. The app never stores tokens or personal data.

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | Extension (MV3) manifest: every CSS and JS file in load order |
| `shared/util.js` | Pure helpers: dates, `el()`, `store` (localStorage wrapper; no `chrome.storage`) |
| `shared/academic-calendar.js` | 2026/2027 semesters, exam periods, days off (update yearly) |
| `shared/exam-strip.js` | Exam-countdown tiles (timetable page and PWA home) |
| `css/tokens.css`, `css/exam-strip.css` | Colours and tile styles used by both parts |
| `js/core.js` | Extension only: portal session token and API calls |
| `js/<page>.js`, `css/<page>.css` | Extension: one file per portal page; `js/main.js` (the DOM-watching loop) loads last |
| `pwa/index.html`, `app.js`, `install.js`, `app.css` | PWA screens, install prompt, styles |
| `pwa/sw.js`, `pwa/manifest.webmanifest`, `pwa/icons/` | Service worker, web app manifest, icons (192, 512, maskable, Apple 180) |
| `tools/` | Build, static server, checks, icon renderer |
| `tests/pwa.e2e.cjs` | Browser test of the built PWA |
| `fonts/` | Self-hosted FiraGO and Noto Serif Georgian |

All extension JS files share one scope (one extension's content scripts run in the same isolated world), so the
order in `manifest.json` matters: `shared/` first, `js/main.js` last. `npm test` checks this.
