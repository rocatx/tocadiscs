# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tocadiscs is a browser-based music player with a vinyl turntable visual aesthetic. Built with vanilla HTML5, CSS3, and JavaScript (no frameworks or build tools). Supports PWA installation for offline use.

## Running the Application

### Browser
Open `index.html` directly in a browser. No server required for basic functionality.

**Note:** The equalizer visualization only works with local files due to CORS restrictions with the Web Audio API.

### Desktop App (Electron)
```bash
# Instal·lar dependències
npm install

# Executar en mode desenvolupament
npm start

# Construir per Mac
npm run build:mac

# Construir per Windows
npm run build:win

# Construir per ambdues plataformes
npm run build
```

Els executables es generaran a la carpeta `dist/`.

## Architecture

### Files
- `index.html` - UI structure with responsive grid layout (single column mobile, two-column desktop)
- `styles.css` - Styling with CSS custom properties for theming (`:root` variables)
- `app.js` - Single `TurntablePlayer` class handling all functionality
- `sw.js` - Service worker for PWA offline caching (cache-first strategy)
- `manifest.json` - PWA manifest for installability
- `main.js` - Electron main process for desktop app
- `package.json` - Dependencies and build scripts for Electron

### TurntablePlayer Class (app.js)
The player maintains state for:
- `playlist[]` - Array of track objects `{title, artist, url, isLocal}`
- `currentIndex` - Currently playing track
- `repeatMode` - 0: off, 1: all, 2: one
- `isShuffle` - Shuffle mode toggle
- `isMiniMode` - Compact draggable player mode

Key methods:
- `handleFiles()` - Processes audio files (supports MP3, FLAC, WAV, OGG, M4A, AAC)
- `setupAudioContext()` - Initializes Web Audio API for equalizer and balance
- `updatePlayState()` - Syncs UI animations (vinyl spin, tonearm position) with playback
- `toggleMiniMode()` - Switches to compact floating player

### Web Audio API Chain
When playing local files, audio is routed through:
`MediaElementSource → BiquadFilters (7-band EQ) → StereoPanner → Analyser → Destination`

### CSS Animations
- `.vinyl.playing` - Triggers vinyl rotation (1.8s per revolution)
- `.tonearm.playing` - Moves tonearm onto record (26deg rotation)
- `.container.mini-mode` - Compact floating player with drag support and track title display
- `.equalizer-section.show-sliders` - Horizontal layout with preset selector and EQ sliders aligned

### Keyboard Shortcuts
- Space: Play/Pause
- Arrow Left/Right: Seek ±5 seconds
- Arrow Up/Down: Volume ±10%

## Language

UI text is in Catalan.
