# 📋 REVISIÓ TOCADISC - Problemes & Solucions

**Data**: 31 Gener 2026
**Revisor**: Claude Code
**Estado Projecte**: Funcional però amb problemes crítics i XSS

---

## 🔴 CRÍTICS (Seguretat & Funcionalitat)

### ❌ CRÍTICA #1: Mode Mini no Funciona
**Fitxer**: `public/app.js:370-445`
**Problema**:
- Crida APIs que no existeixen en Tauri
- `setDecorations()`, `setMinSize()`, `setSize()` no són els mètodes correctes
- Les funcions Rust `enter_mini_mode()` i `exit_mini_mode()` existen però never es criden

**Codi Actual (❌ incorrecte)**:
```javascript
const { getCurrentWindow, LogicalSize, LogicalPosition } = window.__TAURI__.window;
await appWindow.setDecorations(false);
await appWindow.setMinSize(new LogicalSize(340, 160));
```

**Solució Correcta (✅)**:
```javascript
if (window.__TAURI__) {
    const { invoke } = window.__TAURI__.core;
    try {
        if (this.isMiniMode) {
            await invoke('enter_mini_mode');
        } else {
            await invoke('exit_mini_mode');
        }
    } catch (e) {
        console.error('Mode mini error:', e);
    }
}
```

**Impacte**: Mode mini totalment no-funcional. L'usuari veu errors a la consola.
**Effort Arreglar**: 15 minuts
**Prioritat**: 🔴 ALTA

---

### ❌ CRÍTICA #2: XSS en Highlight de Cerca
**Fitxer**: `public/app.js:1122-1126`
**Problema**:
```javascript
highlightSearch(text) {
    if (!this.searchQuery) return text;
    const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>'); // ❌ HTML injectat directament
}
```

**Attack Vector**:
- Usuari cerca per `<script>alert('xss')</script>`
- El regex lo trobarà i injectarà `<mark><script>...</script></mark>` al DOM
- `innerHTML` ho renderitzarà com a codi executable

**Solució (✅)**:
```javascript
highlightSearch(text) {
    if (!this.searchQuery) return text;
    const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
    const span = document.createElement('span');
    span.innerHTML = text.replace(regex, '<mark>$1</mark>');
    // O millor:
    const parts = text.split(regex);
    return parts.map((part, i) =>
        regex.test(part) ? `<mark>${part}</mark>` : part
    ).join('');
}
```

**Impacte**: Potential XSS attack (baixa probabilitat però alt risc si es descobreix)
**Effort Arreglar**: 10 minuts
**Prioritat**: 🔴 ALTA

---

### ❌ CRÍTICA #3: CSP Policy Null (Seguretat)
**Fitxer**: `src-tauri/tauri.conf.json:26`
**Problema**:
```json
"csp": null
```

Això desactiva Content Security Policy completament. Si mai es carrega JavaScript d'una font no fiable, no hi ha protecció.

**Solució (✅)**:
```json
"csp": "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; font-src 'self' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:"
```

**Impacte**: Deixa la porta oberta a XSS si es carrega contingut extern
**Effort Arreglar**: 5 minuts
**Prioritat**: 🔴 ALTA

---

## 🟡 IMPORTANTS (Bugs & Memory Leaks)

### ⚠️ IMPORTANT #1: Memory Leaks - Object URLs
**Fitxer**: `public/app.js:593-595`
**Problema**:
```javascript
if (imageFile) {
    folderArtwork = URL.createObjectURL(imageFile); // ❌ Never revoked
}
```

Cada vegada que carregu una carpeta, crea un nou Object URL que mai es neteja. Després de carregar 100 carpetes, tinc 100 URLs en memòria.

**Solució (✅)**:
```javascript
// Guardar la URL antiga per revocar-la
if (this.currentFolderArtworkUrl) {
    URL.revokeObjectURL(this.currentFolderArtworkUrl);
}
folderArtwork = URL.createObjectURL(imageFile);
this.currentFolderArtworkUrl = folderArtwork;
```

**Impacte**: Memory leak gradual. Després de molta ús, l'app ralentitza
**Effort Arreglar**: 10 minuts
**Prioritat**: 🟡 MITJA

---

### ⚠️ IMPORTANT #2: Error Handling Silenciós
**Fitxer**: `public/app.js:650-652`
**Problema**:
```javascript
onError: () => {
    // Notificacions no disponibles
}
```

Qualsevol error en extreure metadades s'oculta. L'usuari no sap per què les cançons no mostren títol/artista.

**Solució (✅)**:
```javascript
onError: (error) => {
    console.warn(`Error extrenyent metadades de ${file.name}:`, error);
    // Opcionalment: mostrar notificació visual
}
```

**Impacte**: Difícil debugar problemes amb metadades
**Effort Arreglar**: 5 minuts
**Prioritat**: 🟡 MITJA

---

### ⚠️ IMPORTANT #3: localStorage No Está Validada
**Fitxer**: `public/app.js:1290-1336`
**Problema**:
```javascript
loadPlaylistFromStorage() {
    const saved = localStorage.getItem('tocadiscs-playlist');
    if (!saved) return;

    try {
        const state = JSON.parse(saved); // ❌ Si és corrupta?
        // ...
    } catch (e) {
        // Error parsejant, ignorar
    }
}
```

Si localStorage es corrupteix per alguna raó (user malware, etc.), es perd tota la playlist.

**Solució (✅)**:
```javascript
loadPlaylistFromStorage() {
    const saved = localStorage.getItem('tocadiscs-playlist');
    if (!saved) return;

    try {
        const state = JSON.parse(saved);
        if (!Array.isArray(state.tracks)) throw new Error('Invalid tracks');
        // Validar cada track
        state.tracks.forEach(t => {
            if (!t.url || !t.title) throw new Error('Invalid track');
        });
        // ... usar state
    } catch (e) {
        console.error('Playlist corrupta, inicialitzant nova:', e);
        this.clearSavedPlaylist();
    }
}
```

**Impacte**: Perduda de dades si localStorage es corrupteix
**Effort Arreglar**: 15 minuts
**Prioritat**: 🟡 MITJA

---

## 🟠 MILLORES (Codi & Performance)

### 📝 MILLORA #1: Codi Duplicat - Shuffle Logic
**Fitxer**: `public/app.js:954-1017`
**Problema**: La lògica de "quin track és el següent?" està repetida 4 vegades:
- `playNext()` linea 975-984
- `playPrevious()` línea 954-972
- `getNextIndex()` línea 1011-1016
- `onTrackEnd()` línea 990-1009

**Solució (✅)**: Crear mètode genèric:
```javascript
getNextTrackIndex(direction = 'next') {
    if (this.playlist.length === 0) return -1;

    if (this.isShuffle) {
        return Math.floor(Math.random() * this.playlist.length);
    }

    let next = this.currentIndex + (direction === 'next' ? 1 : -1);
    return (next + this.playlist.length) % this.playlist.length;
}
```

Després usar-lo en tots els llocs.

**Impacte**: Codi més mantenible. Si canvies shuffle logic, només un lloc
**Effort Arreglar**: 20 minuts
**Prioritat**: 🟠 BAIXA

---

### 📝 MILLORA #2: Analyser No Hauria de Funcionar en Mode Mini
**Fitxer**: `public/app.js:522-555`
**Problema**:
```javascript
startEqualizer() {
    // Corre sempre si isPlaying === true
    // En mode mini, l'equalitzador no es veu, però l'analyser corre
}
```

Està gastant CPU per actualitzar visualitzacions que no es veuen.

**Solució (✅)**:
```javascript
startEqualizer() {
    if (this.isMiniMode) return; // No mostrar-se, no computar
    if (!this.analyser) return;
    // ... rest
}
```

**Impacte**: Millor battery life en mode mini (especialment mòbil)
**Effort Arreglar**: 5 minuts
**Prioritat**: 🟠 BAIXA

---

### 📝 MILLORA #3: Accessibility - Falten ARIA Labels
**Fitxer**: `public/index.html` (múltiples)
**Problema**: Els buttons no tenen `aria-label`:
```html
<button id="btnPlay" title="Reproduir">
```

Screen readers llegeixen l'SVG, no el títol.

**Solució (✅)**:
```html
<button id="btnPlay" aria-label="Reproduir/Pausar" title="Reproduir">
```

**Impacte**: App més accessible per a usuaris amb visual impairment
**Effort Arreglar**: 30 minuts (totes les labels)
**Prioritat**: 🟠 BAIXA

---

## 📊 RESUM PER PRIORITAT

### 🔴 CRÍTICS - ARREGLAR PRIMER
- [ ] #1: Mode Mini (Tauri API) - 15 min
- [ ] #2: XSS Highlights - 10 min
- [ ] #3: CSP Policy - 5 min

**Total**: ~30 minuts. **IMPRESCINDIBLE**.

### 🟡 IMPORTANTS - ARREGLAR AVIAT
- [ ] #1: Memory Leaks (ObjectURLs) - 10 min
- [ ] #2: Error Handling - 5 min
- [ ] #3: localStorage Validation - 15 min

**Total**: ~30 minuts. **Recomanat**.

### 🟠 MILLORES - OPCIONAL AVUI
- [ ] #1: Codi Duplicat - 20 min
- [ ] #2: Analyser CPU - 5 min
- [ ] #3: ARIA Labels - 30 min

**Total**: ~55 minuts. **Per més tard**.

---

## 🎯 PRÒXIM PAS

**Pregunta al usuari**:
> Vols que arreglem primers els **CRÍTICS** (seguretat + funcionalitat)?
> O prefereixes ara les **sugerències de disseny i funcionament**?

---

## 📝 NOTES
- Tots els problemes están ubicats exactament (fitxer:línia)
- Les solucions són code-ready (es poden copiar quasi directament)
- Effort estimat realista (basats en la complexitat actual)
