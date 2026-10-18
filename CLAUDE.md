# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tocadisc is a music player with a vinyl turntable visual aesthetic. Built with Tauri 2 (Rust backend) and vanilla HTML5, CSS3, and JavaScript frontend (no frameworks, no CDN: fonts and libraries are vendored so the app works offline). Produces lightweight native apps for macOS and Windows.

## Commands

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Build for current platform
npm run build

# Build for specific targets
npm run build:mac      # Mac ARM (aarch64-apple-darwin)
npm run build:win      # Windows (x86_64-pc-windows-msvc)
```

Build outputs are in `src-tauri/target/release/bundle/` (or `target/<triple>/release/bundle/`).

## Architecture

### Project Structure
- `public/` - Frontend web files (served by Tauri)
  - `index.html` - UI structure, plus the in-app modal (`#modal`) and toast (`#toast`)
  - `styles.css` - Styling with CSS custom properties (`:root` variables); `@font-face` for the local DM Sans
  - `app.js` - Single `TurntablePlayer` class handling all functionality
  - `fonts/` - DM Sans woff2 (OFL, see `fonts/OFL.txt`)
  - `vendor/jsmediatags.min.js` - only lazy-loaded in browser mode (no Tauri)
- `src-tauri/` - Rust backend
  - `src/lib.rs` - Tauri commands (mini mode + library) and app setup
  - `src/library.rs` - Folder/file scanning, metadata and artwork via `lofty`, asset-scope authorization
  - `tauri.conf.json` - App configuration, CSP, asset protocol, bundle targets
  - `capabilities/default.json` - Tauri permissions for the window API

### Local files (Tauri)
Local tracks are stored by **path** (`source: 'file'`), so the playlist survives restarts:
1. `pick_audio` (native dialog, `tauri-plugin-dialog`) or the native drag-drop event returns paths.
2. `scan_paths` walks them, reads tags with `lofty`, finds folder covers, and calls
   `asset_protocol_scope().allow_file()` for every audio/cover file. The asset scope in
   `tauri.conf.json` is intentionally empty: only scanned files are ever readable.
3. The frontend plays `convertFileSrc(path)`. On startup the saved paths go through `scan_paths`
   again (re-authorization + fresh metadata); missing files are marked `unavailable`.
4. `get_artwork` returns embedded cover bytes as a raw `ipc::Response`; only the current track's
   cover is loaded, as a blob URL that is revoked on the next track.

Browser mode (no `window.__TAURI__`) falls back to `File` objects (`source: 'blob'`), which are not persisted.

### TurntablePlayer Class (public/app.js)
State management:
- `playlist[]` - Track objects `{id, source: 'file'|'url'|'blob', title, artist, album, duration, path?, url?, hasArtwork, folderArtwork, unavailable?, noCors?}`
- `currentIndex`, `repeatMode` (0 off, 1 all, 2 one), `isShuffle` + `shuffleHistory`, `volume`, `isMiniMode`
- Persistence in `localStorage`: `tocadiscs-playlist` (tracks + index), `tocadiscs-settings` (volume, balance, EQ, repeat, shuffle), `tocadiscs-saved-playlists`, `tocadiscs-theme`. Old v1.0 data is migrated on read.

Key points:
- Two audio elements: `audioGraph` (`crossOrigin='anonymous'`, routed through Web Audio) and `audioPlain` for URLs without CORS (Web Audio would output silence). A URL that fails on the graph element is retried on the plain one (`noCors`).
- Never use `prompt`/`alert`/`confirm` (they do not work in the Tauri webview): use `showModal()` / `showToast()`.

### Web Audio API Chain
`MediaElementSource → BiquadFilters (7-band EQ) → StereoPanner → Analyser → Gain (volume) → Destination`
- The analyser sits before the volume gain so the visualizer does not depend on volume; when the graph is active the element volume stays at 1 and the gain is the only volume control.
- The AudioContext is created on the first `play()` (user gesture), using the current EQ/balance slider values.
- Visualizer: 16 logarithmic bands 40 Hz–16 kHz (`fftSize` 2048) with a +3 dB/octave tilt, single `requestAnimationFrame` loop.

### Mini mode (src-tauri/src/lib.rs)
- `enter_mini_mode` / `exit_mini_mode` / `resize_mini_mode` (340×140, 340×280 with EQ).
- macOS: do **not** use tao's `set_decorations()` — it rebuilds the NSWindow `styleMask` from scratch and applies it asynchronously, which broke the title bar, resizing and size on restore. The `platform` module snapshots the native `styleMask` + `frame` and restores them synchronously (objc2-app-kit). After any style-mask change the webview is refocused, otherwise keyboard shortcuts stop working.
- Windows: tao decorations, logical size/position, maximized state restored.

### CSS Animations
- `.vinyl.playing` - Vinyl rotation (1.8s/revolution)
- `.tonearm.playing` - Tonearm movement (26deg)
- `.container.mini-mode` - Compact floating player

### Keyboard Shortcuts
- Space: Play/Pause · Arrow Left/Right: Seek ±5 s · Arrow Up/Down: Volume ±10%
- M: mini mode · S: shuffle · R: repeat · D: theme · N/P: next/previous · 1–7: EQ presets
- Media keys via the MediaSession API

## CI/CD

GitHub Actions workflow (`.github/workflows/build.yml`) builds for Mac ARM, Mac Intel, and Windows on every push to main (and on manual dispatch). Tagged releases (v*) automatically create GitHub Releases with downloadable binaries. macOS bundles are ad-hoc signed (`signingIdentity: "-"`), not notarized.

## Language

UI text is in Catalan.
