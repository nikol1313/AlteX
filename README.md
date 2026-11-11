# AlteX — Student Portal Chrome Extension

Visual redesign of the Alte University student portal (`students.alte.edu.ge`).

## What it does

- Injects a custom stylesheet (`styles.css`) that restyles the portal UI.
- Runs a content script (`content.js`) that adapts page behavior and markup.
- Bundles self-hosted fonts (FiraGO, Georgia serif) so the redesign renders consistently offline.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

The extension activates automatically on `https://students.alte.edu.ge/*`.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest, content script + font declarations |
| `styles.css` | Portal redesign styles |
| `content.js` | DOM adaptation script |
| `fonts/` | Self-hosted webfonts |
