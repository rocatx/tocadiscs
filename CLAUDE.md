# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tocadisc is a music player with a vinyl turntable visual aesthetic. Built with Tauri (Rust backend) and vanilla HTML5, CSS3, and JavaScript frontend (no frameworks). Produces lightweight native apps (~3MB DMG).

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

Build outputs are in `src-tauri/target/release/bundle/`.

## Architecture

### Project Structure
- `public/` - Frontend web files (served by Tauri)
  - `index.html` - UI structure with responsive grid layout
  - `styles.css` - Styling with CSS custom properties (`:root` variables)
  - `app.js` - Single `TurntablePlayer` class handling all functionality
- `src-tauri/` - Rust backend
  - `src/lib.rs` - Tauri commands for window manipulation
  - `tauri.conf.json` - App configuration, window settings, bundle targets
  - `capabilities/default.json` - Tauri permissions for window API

### TurntablePlayer Class (public/app.js)
State management:
- `playlist[]` - Array of track objects `{title, artist, url, isLocal, artwork, file}`
- `currentIndex` - Currently playing track
- `repeatMode` - 0: off, 1: all, 2: one
- `isShuffle`, `isMiniMode` - Mode toggles

Key methods:
- `handleFiles()` - Processes audio files (MP3, FLAC, WAV, OGG, M4A, AAC), extracts metadata with jsmediatags, uses folder images as fallback artwork
- `setupAudioContext()` - Initializes Web Audio API for equalizer/balance
- `updatePlayState()` - Syncs UI animations with playback
- `toggleMiniMode()` - Switches to compact player, saves/restores window size and position using Tauri window API with scaleFactor conversion

### Tauri Commands (src-tauri/src/lib.rs)
- `enter_mini_mode` - Resizes window to 340x140, sets always-on-top
- `exit_mini_mode` - Restores original window size

### External Libraries
- `jsmediatags` (CDN) - Extracts ID3 tags and artwork from audio files

### Web Audio API Chain
`MediaElementSource → BiquadFilters (7-band EQ) → StereoPanner → Analyser → Destination`

### CSS Animations
- `.vinyl.playing` - Vinyl rotation (1.8s/revolution)
- `.tonearm.playing` - Tonearm movement (26deg)
- `.container.mini-mode` - Compact floating player

### Keyboard Shortcuts
- Space: Play/Pause
- Arrow Left/Right: Seek ±5 seconds
- Arrow Up/Down: Volume ±10%

## CI/CD

GitHub Actions workflow (`.github/workflows/build.yml`) builds for Mac ARM, Mac Intel, and Windows on every push. Tagged releases (v*) automatically create GitHub Releases with downloadable binaries.

## Language

UI text is in Catalan.
