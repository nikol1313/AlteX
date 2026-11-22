# AlteX — Student Portal Chrome Extension

Visual redesign of the Alte University student portal (`students.alte.edu.ge`).

## Problem
The Alte University student portal is functional, but the experience is far from user-friendly. Its outdated design, cluttered layout, confusing navigation, and unnecessary clicks make even simple tasks frustrating. Important information is harder to find than it should be, the timetable is difficult to read, and several interface elements lack the clarity students need.

Students shouldn't have to fight the portal just to keep up with university life.

## What it does

- Injects stylesheets (`css/`) that restyle the portal UI.
- Runs content scripts (`js/`) that adapt page behavior and markup (read-only: nothing is submitted for you).
- Bundles self-hosted fonts (FiraGO, Georgia serif) so the redesign renders consistently offline.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

The extension activates automatically on `https://students.alte.edu.ge/*`.

## Android app

`android/` wraps the portal in an Android WebView and injects this same extension code, so phones get the
redesign and live data too. It is built from `manifest.json` (no separate copy of the code) and released as an
APK on GitHub Releases. See [`android/README.md`](android/README.md).

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest; lists every CSS and JS file in load order |
| `css/base.css` | Colour tokens, reset, header, nav bar, shared boxes, tables, dialogs, footer |
| `css/<page>.css` | One file per page: dashboard, timetable, applications, learning-card, finances, registration, programs, chancellery, assignments, login |
| `js/core.js` | Shared helpers: dates, `el()`, storage, session, API |
| `js/academic-calendar.js` | 2026/2027 exam periods and days off (update yearly) |
| `js/<page>.js` | One file per page, each exposing `enhance…`/`mount…` functions |
| `js/main.js` | The loop: runs every page function when the portal's DOM changes (max ~5×/s) |
| `fonts/` | Self-hosted webfonts |
| `android/` | Android app (WebView + this extension), see `android/README.md` |
| `.github/workflows/android.yml` | Builds the APK on every push; tags `android-v*` publish a Release |

All JS files share one scope (content scripts of one extension run in the same isolated world), so `main.js` must stay last in `manifest.json`.
