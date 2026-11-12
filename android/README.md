# AlteX for Android

The student portal in a WebView, with the AlteX extension's CSS and JS injected.

**[Download AlteX.apk](https://github.com/nikol1313/AlteX-chrome-extension/releases/latest/download/AlteX.apk)**

## How it works

- `app/build.gradle.kts` packs the content scripts listed in `../manifest.json` (same order) into `assets/altex.js`.
- The app injects it at document start, on `https://students.alte.edu.ge` only.
- The code runs on the portal's own origin, so it uses the portal's login token and API like the desktop extension.
- Version comes from `manifest.json` (`3.3.3` → versionCode `30303`).
- Links outside the portal open in the browser.
- "Remember me": login stored encrypted (Android Keystore, `LoginStore.java`), removed on log out.
- Update check: on launch (max every 6 h) the app reads the latest Release tag; if newer, a banner links to the APK.

## Release

1. Bump `"version"` in `manifest.json`.
2. `git tag android-vX.Y.Z && git push origin android-vX.Y.Z`

GitHub Actions builds the signed APK and publishes it as `AlteX.apk` on Releases.
Secrets: `ALTEX_KEYSTORE_B64`, `ALTEX_KEYSTORE_PASSWORD`. Keep the keystore: a new key means users must reinstall.

## Build locally

JDK 17 + Android SDK, then from `android/`: `gradle assembleDebug`

## Limits

- Updates aren't automatic: the banner links to the new APK, the user installs it over the old one.
- In-page `blob:` downloads don't work.
