# AlteX for Android

An Android app that opens the student portal (`students.alte.edu.ge`) with the AlteX redesign and live
features (grades, timetable, assignments, finances), distributed as an APK on GitHub Releases.

## How it works

The app is a WebView on the portal. At build time, `bundleExtension` in `app/build.gradle.kts` reads the
extension's `manifest.json` and packs every content-script CSS and JS file, in the same order, into
`assets/altex.js`. The app injects that script at document start on `https://students.alte.edu.ge` only.

The extension's code therefore runs on the portal's own origin, like the desktop content scripts. It reads
the portal's login token and calls the portal API itself. There is no server in between, and nothing leaves
the phone except the portal's own traffic. (This is what the PWA cannot do: the portal API sends no CORS
headers, so a different website cannot read it.)

There is nothing Android-specific to keep in sync: change `js/` or `css/`, rebuild, and the app has it. The
version comes from `manifest.json` (`3.2.0` → versionName `3.2.0`, versionCode `30200`), so bump it there
before each release, or Android will refuse to install the new APK over the old one.

- Portal links stay in the app. Other links (LMS, lecturers' links, e-mail) open in the phone's browser.
- Fonts are served from the app under `https://students.alte.edu.ge/__altex/fonts/`, intercepted locally.
- The build fails if the bundle still contains extension-only APIs (`chrome-extension://`, `chrome.runtime`, …).
- **Remember me:** the login form gets a "დამახსოვრება ამ ტელეფონზე" checkbox (only in the app, see `js/login.js`).
  After a successful login the app stores the username and password encrypted with an Android Keystore key
  (`LoginStore.java`) and signs in again when the portal's 24-hour session ends. "გასვლა" (log out) deletes it.
  Only the portal origin can reach the bridge (`window.AltexApp`, a WebMessageListener). SMS codes are still typed by hand.
- **Icon:** the wordmark from `altex-128x128.png`, re-rendered in FiraGO at full resolution so launchers can mask it
  (`res/mipmap-xxxhdpi/ic_launcher_foreground.png` on `@color/bg`); the extension's `icons/` come from the same render.

## One-time setup: signing key

Android only installs an update over an existing app when both are signed with the same key. Make the key
once, keep it safe, and never commit it (`android/.gitignore` excludes it).

```sh
openssl req -x509 -newkey rsa:4096 -sha256 -days 10000 -nodes -subj "/CN=AlteX" \
  -keyout altex.key -out altex.crt
openssl pkcs12 -export -inkey altex.key -in altex.crt -name altex -out altex.p12   # asks for a password
rm altex.key altex.crt
```

Back up `altex.p12` and its password (e.g. a password manager). **If you lose it, students have to uninstall
the app and install it again, and they lose their login.**

Add two repository secrets (GitHub → Settings → Secrets and variables → Actions → New repository secret):

| Secret | Value |
| --- | --- |
| `ALTEX_KEYSTORE_B64` | output of `base64 -w0 altex.p12` |
| `ALTEX_KEYSTORE_PASSWORD` | the password you typed above |

## Release

1. Bump `"version"` in `manifest.json` and commit.
2. Tag and push: `git tag android-v3.2.0 && git push origin android-v3.2.0`
3. GitHub Actions (`.github/workflows/android.yml`) builds the signed APK and creates a Release with
   `AlteX-3.2.0.apk` attached. It is free for public repositories.

Share one link with students; it always downloads the newest release:

    https://github.com/nikol1313/AlteX-chrome-extension/releases/latest/download/AlteX.apk

They open it on the phone, allow installs from the browser when Android asks, and install. A newer APK installs
over the old one and keeps them logged in.

## Build locally (optional)

Without the signing secrets, every push still builds a debug APK: open the run under GitHub → Actions and
download it from **Artifacts**.

To build on your own machine you need JDK 17, the Android SDK (Android Studio installs both) and Gradle 8.11+
(or open `android/` in Android Studio). From `android/`:

```sh
gradle assembleDebug    # app/build/outputs/apk/debug/app-debug.apk
```

A debug APK is signed with your machine's debug key, so it cannot update a release install (or the other
way round). Use it for testing only.

## Limits

- No automatic updates: students install new APKs from the Releases page themselves.
- File downloads that the portal makes inside the page (`blob:` links) do not work in the WebView. Files with a
  normal URL open in the browser.
