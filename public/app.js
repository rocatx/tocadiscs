// Reproductor de Música Tocadiscs
// ================================

const AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const COVER_NAMES = ['cover', 'folder', 'artwork', 'front', 'album'];

const STORAGE_KEYS = {
    playlist: 'tocadiscs-playlist',
    settings: 'tocadiscs-settings',
    savedPlaylists: 'tocadiscs-saved-playlists',
    theme: 'tocadiscs-theme'
};

// Visualitzador: bandes logarítmiques entre aquestes freqüències (Hz)
const VIZ_MIN_FREQ = 40;
const VIZ_MAX_FREQ = 16000;
// Compensació de pendent (dB per octava): sense ella les bandes aguts gairebé no es mouen
const VIZ_TILT_DB_PER_OCTAVE = 3;
const VIZ_MAX_HEIGHT = 50;

const REPEAT_LABELS = ['Repetir: desactivat', 'Repetir: totes', 'Repetir: una'];

// localStorage pot fallar (mode privat, dades bloquejades): mai ha de trencar l'app
function readStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.warn(`Dades guardades no vàlides (${key}):`, e);
        return fallback;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn(`No s'ha pogut guardar ${key}:`, e);
    }
}

function fileExtension(name) {
    const match = /\.([^./\\]+)$/.exec(name || '');
    return match ? match[1].toLowerCase() : '';
}

function stripExtension(name) {
    return (name || '').replace(/\.[^/.]+$/, '');
}

// Tipus MIME d'una imatge a partir dels primers bytes
function sniffImageType(bytes) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    return 'image/jpeg';
}

class TurntablePlayer {
    constructor() {
        // Tauri (app d'escriptori) o navegador (desenvolupament)
        this.tauri = window.__TAURI__ || null;

        // Elements DOM
        this.vinyl = document.getElementById('vinyl');
        this.tonearm = document.getElementById('tonearm');
        this.trackTitle = document.getElementById('trackTitle');
        this.trackArtist = document.getElementById('trackArtist');
        this.labelTitle = document.getElementById('labelTitle');
        this.timeCurrent = document.getElementById('timeCurrent');
        this.timeTotal = document.getElementById('timeTotal');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressBar = document.getElementById('progressBar');
        this.equalizer = document.getElementById('equalizer');
        this.eqBars = this.equalizer.querySelectorAll('.eq-bar');
        this.playlistItems = document.getElementById('playlistItems');
        this.playlistCount = document.getElementById('playlistCount');

        // Botons
        this.btnPlay = document.getElementById('btnPlay');
        this.btnStop = document.getElementById('btnStop');
        this.btnPrev = document.getElementById('btnPrev');
        this.btnNext = document.getElementById('btnNext');
        this.btnShuffle = document.getElementById('btnShuffle');
        this.btnRepeat = document.getElementById('btnRepeat');
        this.btnMute = document.getElementById('btnMute');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.balanceSlider = document.getElementById('balanceSlider');

        // Fonts d'àudio
        this.fileInput = document.getElementById('fileInput');
        this.folderInput = document.getElementById('folderInput');
        this.urlInput = document.getElementById('urlInput');
        this.btnLoadUrl = document.getElementById('btnLoadUrl');
        this.fileLabels = document.querySelectorAll('.file-input-label');

        // Caràtula
        this.labelArtwork = document.getElementById('labelArtwork');
        this.vinylLabel = document.getElementById('vinylLabel');

        // Tabs
        this.tabs = document.querySelectorAll('.tab');
        this.panels = document.querySelectorAll('.source-panel');

        // Dos elements d'àudio: el primer passa per Web Audio (EQ, balanç, visualitzador);
        // el segon reprodueix directament les URLs que no permeten CORS, que a través de
        // Web Audio sonarien en silenci.
        this.audioGraph = document.getElementById('audioPlayer');
        this.audioGraph.crossOrigin = 'anonymous';
        this.audioPlain = new Audio();
        this.audio = this.audioGraph;

        // Estat
        this.playlist = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.wantsToPlay = false;
        this.isShuffle = false;
        this.shuffleHistory = [];
        this.repeatMode = 0; // 0: off, 1: all, 2: one
        this.volume = 0.8;
        this.previousVolume = 0.8;
        this.nextTrackId = 1;
        this.skipCount = 0;

        // Web Audio API
        this.audioContext = null;
        this.analyser = null;
        this.filters = [];
        this.panner = null;
        this.gainNode = null;
        this.vizBands = [];
        this.vizData = null;
        this.vizFrame = null;

        // Caràtula de la pista actual
        this.currentArtworkBlobUrl = null;
        this.artworkRequest = 0;

        // Equalitzador
        this.eqSection = document.getElementById('equalizerSection');
        this.eqPreset = document.getElementById('eqPreset');
        this.eqToggle = document.getElementById('eqToggle');
        this.eqSliders = document.querySelectorAll('.eq-slider');
        this.eqFrequencies = [60, 150, 400, 1000, 2400, 6000, 15000];

        // Presets de l'equalitzador (valors en dB)
        this.eqPresets = {
            flat: [0, 0, 0, 0, 0, 0, 0],
            rock: [4, 3, -1, 0, 1, 3, 4],
            pop: [-1, 2, 4, 3, 0, -1, -2],
            jazz: [3, 1, 0, 1, -1, 2, 3],
            classical: [0, 0, 0, 0, -2, -2, -4],
            bass: [6, 4, 2, 0, 0, 0, 0],
            vocal: [-2, 0, 2, 4, 2, 0, -2]
        };

        // Mode mini
        this.container = document.querySelector('.container');
        this.btnMiniMode = document.getElementById('btnMiniMode');
        this.btnMiniEq = document.getElementById('btnMiniEq');
        this.isMiniMode = false;
        this.isMiniEqOpen = false;
        this.isTogglingMiniMode = false;

        // Mode fosc
        this.btnTheme = document.getElementById('btnTheme');

        // Cerca
        this.playlistSearch = document.getElementById('playlistSearch');
        this.searchClear = document.getElementById('searchClear');
        this.searchQuery = '';
        this.renderScheduled = false;

        // Gestió de playlists
        this.btnPlaylistMenu = document.getElementById('btnPlaylistMenu');
        this.playlistMenu = document.getElementById('playlistMenu');
        this.btnSavePlaylist = document.getElementById('btnSavePlaylist');
        this.btnLoadPlaylist = document.getElementById('btnLoadPlaylist');
        this.btnClearPlaylist = document.getElementById('btnClearPlaylist');

        // Diàleg i avisos (substitueixen prompt/alert, que no funcionen dins Tauri)
        this.modal = document.getElementById('modal');
        this.modalTitle = document.getElementById('modalTitle');
        this.modalMessage = document.getElementById('modalMessage');
        this.modalInput = document.getElementById('modalInput');
        this.modalList = document.getElementById('modalList');
        this.modalOk = document.getElementById('modalOk');
        this.modalCancel = document.getElementById('modalCancel');
        this.modalResolve = null;
        this.toast = document.getElementById('toast');
        this.toastTimer = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSettings();
        this.initTheme();
        this.setupDragDrop();
        this.setupMediaSession();
        this.restorePlaylist();
    }

    invoke(command, args) {
        return this.tauri.core.invoke(command, args);
    }

    setupEventListeners() {
        // Controls de reproducció
        this.btnPlay.addEventListener('click', () => this.togglePlay());
        this.btnStop.addEventListener('click', () => this.stop());
        this.btnPrev.addEventListener('click', () => this.playPrevious());
        this.btnNext.addEventListener('click', () => this.playNext());
        this.btnShuffle.addEventListener('click', () => this.toggleShuffle());
        this.btnRepeat.addEventListener('click', () => this.toggleRepeat());

        // Volum i balanç
        this.btnMute.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value / 100));
        this.balanceSlider.addEventListener('input', (e) => this.setBalance(e.target.value / 100));

        // Progrés
        this.progressContainer.addEventListener('click', (e) => this.seek(e));

        // Àudio events (els dos elements; només compta el que està actiu)
        [this.audioGraph, this.audioPlain].forEach(el => this.bindAudioEvents(el));

        // Font d'àudio
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        this.folderInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        this.btnLoadUrl.addEventListener('click', () => this.loadFromUrl());
        this.urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.loadFromUrl();
        });

        // A Tauri els selectors natius retornen rutes, que es poden recordar entre sessions
        if (this.tauri) {
            this.fileLabels.forEach(label => {
                label.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.pickAudio(label.contains(this.folderInput));
                });
            });
        }

        // Tabs
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Equalitzador
        this.eqToggle.addEventListener('click', () => this.toggleEqView());
        this.eqPreset.addEventListener('change', (e) => this.applyEqPreset(e.target.value));
        this.eqSliders.forEach((slider, index) => {
            slider.addEventListener('input', (e) => this.setEqBand(index, parseFloat(e.target.value)));
        });

        // Mode mini
        this.btnMiniMode.addEventListener('click', () => this.toggleMiniMode());
        this.btnMiniEq.addEventListener('click', () => this.toggleMiniEq());
        this.setupMiniModeDrag();

        // Mode fosc
        this.btnTheme.addEventListener('click', () => this.toggleTheme());

        // Cerca
        this.playlistSearch.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderPlaylist();
        });
        this.playlistSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.clearSearch();
        });
        this.searchClear.addEventListener('click', () => this.clearSearch());

        // Llista: un sol listener per a tots els elements (es re-renderitza sovint)
        this.playlistItems.addEventListener('click', (e) => this.onPlaylistClick(e));

        // Gestió de playlists
        this.btnPlaylistMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            this.playlistMenu.classList.toggle('open');
        });
        document.addEventListener('click', () => this.playlistMenu.classList.remove('open'));
        this.btnSavePlaylist.addEventListener('click', () => this.saveNamedPlaylist());
        this.btnLoadPlaylist.addEventListener('click', () => this.showLoadPlaylistDialog());
        this.btnClearPlaylist.addEventListener('click', () => this.clearCurrentPlaylist());

        // Diàleg
        this.modalOk.addEventListener('click', () => this.closeModal(true));
        this.modalCancel.addEventListener('click', () => this.closeModal(false));
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal(false);
        });
        this.modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal(false);
            if (e.key === 'Enter' && e.target === this.modalInput) this.closeModal(true);
        });

        // Dreceres de teclat
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    onKeyDown(e) {
        if (this.modalResolve) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        // Espai/Enter sobre un botó enfocat: que actuï el botó, no la drecera
        if (tag === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.seekBy(-5);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.seekBy(5);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.setVolume(Math.min(1, this.volume + 0.1));
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.setVolume(Math.max(0, this.volume - 0.1));
                break;
            case 'KeyM':
                this.toggleMiniMode();
                break;
            case 'KeyS':
                this.toggleShuffle();
                break;
            case 'KeyR':
                this.toggleRepeat();
                break;
            case 'KeyD':
                this.toggleTheme();
                break;
            case 'KeyN':
                this.playNext();
                break;
            case 'KeyP':
                this.playPrevious();
                break;
            case 'Digit1':
            case 'Digit2':
            case 'Digit3':
            case 'Digit4':
            case 'Digit5':
            case 'Digit6':
            case 'Digit7': {
                // Presets d'equalitzador (1-7)
                const presetNames = Object.keys(this.eqPresets);
                const presetName = presetNames[parseInt(e.code.replace('Digit', ''), 10) - 1];
                if (presetName) this.applyEqPreset(presetName);
                break;
            }
        }
    }

    // ---------------------------------------------------------------
    // Elements d'àudio
    // ---------------------------------------------------------------

    bindAudioEvents(el) {
        const ifActive = (handler) => (e) => {
            if (e.target === this.audio) handler(e);
        };
        el.addEventListener('timeupdate', ifActive(() => this.updateProgress()));
        el.addEventListener('loadedmetadata', ifActive(() => this.updateDuration()));
        el.addEventListener('ended', ifActive(() => this.onTrackEnd()));
        el.addEventListener('play', ifActive(() => this.onPlay()));
        el.addEventListener('pause', ifActive(() => this.onPause()));
        el.addEventListener('playing', ifActive(() => { this.skipCount = 0; }));
        el.addEventListener('error', ifActive(() => this.onAudioError(el)));
    }

    // Alliberar un element d'àudio que deixa d'estar actiu
    resetAudioElement(el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
    }

    useAudioElement(el) {
        if (this.audio === el) return;
        this.resetAudioElement(this.audio);
        this.audio = el;
        this.applyVolume();
        this.eqSection.classList.toggle('eq-unavailable', el === this.audioPlain);
    }

    onAudioError(el) {
        if (!el.getAttribute('src')) return;
        const track = this.playlist[this.currentIndex];
        if (!track) return;

        // URL sense CORS: reintentar amb l'element directe (sense EQ ni visualitzador)
        if (track.source === 'url' && el === this.audioGraph && !track.noCors) {
            track.noCors = true;
            this.savePlaylistToStorage();
            this.loadTrack(this.currentIndex);
            if (this.wantsToPlay) this.play();
            return;
        }

        track.unavailable = true;
        this.renderPlaylist();
        this.showToast(`No s'ha pogut reproduir «${track.title}»`);

        // Si estava sonant, passar a la següent (sense entrar en bucle si cap no funciona)
        if (this.wantsToPlay && this.skipCount < this.playlist.length) {
            this.skipCount++;
            const next = this.getNextTrackIndex('next', true);
            if (next !== -1 && next !== this.currentIndex) {
                this.loadTrack(next);
                this.play();
                return;
            }
        }
        this.skipCount = 0;
        this.stop();
    }

    // ---------------------------------------------------------------
    // Web Audio API: equalitzador, balanç, volum i visualitzador
    // ---------------------------------------------------------------

    // S'ha de crear dins d'un gest de l'usuari (clic o tecla) per evitar bloquejos d'autoplay
    ensureAudioContext() {
        if (this.audioContext) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass();

            // Filtres de l'equalitzador amb els valors que ja mostren els sliders
            this.filters = this.eqFrequencies.map((freq, index) => {
                const filter = this.audioContext.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1;
                filter.gain.value = parseFloat(this.eqSliders[index].value) || 0;
                return filter;
            });

            this.panner = this.audioContext.createStereoPanner();
            this.panner.pan.value = this.balanceSlider.value / 100;

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.75;
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -25;

            this.gainNode = this.audioContext.createGain();

            // source -> filtres -> panner -> analyser -> gain (volum) -> destination
            // L'analyser va abans del volum perquè les barres no depenguin del volum
            const source = this.audioContext.createMediaElementSource(this.audioGraph);
            let lastNode = source;
            this.filters.forEach(filter => {
                lastNode.connect(filter);
                lastNode = filter;
            });
            lastNode.connect(this.panner);
            this.panner.connect(this.analyser);
            this.analyser.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);

            this.setupVisualizerBands();
            this.applyVolume();
        } catch (error) {
            console.warn('Web Audio API no disponible:', error);
            this.audioContext = null;
        }
    }

    // Un sol control de volum: el guany del graf (si el so hi passa) o el de l'element
    applyVolume() {
        if (this.audioContext && this.audio === this.audioGraph) {
            this.audioGraph.volume = 1;
            this.gainNode.gain.value = this.volume;
        } else {
            this.audio.volume = this.volume;
        }
    }

    // Alternar vista de l'equalitzador (col·lapsar/expandir)
    toggleEqView() {
        this.eqSection.classList.toggle('collapsed');
        this.saveSettings();
    }

    // Aplicar preset de l'equalitzador
    applyEqPreset(presetName) {
        const preset = this.eqPresets[presetName];
        if (!preset) return;

        this.eqPreset.value = presetName;
        preset.forEach((gain, index) => {
            this.eqSliders[index].value = gain;
            this.setEqBand(index, gain, false);
        });
        this.saveSettings();
    }

    // Ajustar una banda de l'equalitzador
    setEqBand(index, gain, save = true) {
        if (this.filters[index]) {
            this.filters[index].gain.value = gain;
        }
        if (save) this.saveSettings();
    }

    // Bandes logarítmiques: cada barra cobreix la mateixa fracció d'octava
    setupVisualizerBands() {
        const binHz = this.audioContext.sampleRate / this.analyser.fftSize;
        const binCount = this.analyser.frequencyBinCount;
        const barCount = this.eqBars.length;
        const ratio = VIZ_MAX_FREQ / VIZ_MIN_FREQ;
        const dbRange = this.analyser.maxDecibels - this.analyser.minDecibels;

        this.vizData = new Uint8Array(binCount);
        this.vizBands = Array.from({ length: barCount }, (_, i) => {
            const low = VIZ_MIN_FREQ * Math.pow(ratio, i / barCount);
            const high = VIZ_MIN_FREQ * Math.pow(ratio, (i + 1) / barCount);
            const start = Math.min(binCount - 1, Math.max(1, Math.floor(low / binHz)));
            const end = Math.min(binCount, Math.max(start + 1, Math.ceil(high / binHz)));
            const octaves = Math.log2(Math.sqrt(low * high) / VIZ_MIN_FREQ);
            const tilt = (VIZ_TILT_DB_PER_OCTAVE * octaves / dbRange) * 255;
            return { start, end, tilt };
        });
    }

    // Visualitzador: un únic bucle d'animació actiu
    startVisualizer() {
        if (this.vizFrame || !this.analyser) return;

        const draw = () => {
            if (!this.isPlaying || this.audio !== this.audioGraph) {
                this.vizFrame = null;
                this.resetVisualizer();
                return;
            }
            // No calcular res si les barres no es veuen (mode mini, controls d'EQ...)
            if (this.equalizer.offsetParent !== null) {
                this.analyser.getByteFrequencyData(this.vizData);
                this.vizBands.forEach((band, i) => {
                    let peak = 0;
                    for (let j = band.start; j < band.end; j++) {
                        if (this.vizData[j] > peak) peak = this.vizData[j];
                    }
                    const level = peak === 0 ? 0 : Math.min(255, peak + band.tilt);
                    this.eqBars[i].style.height = `${Math.max(2, (level / 255) * VIZ_MAX_HEIGHT)}px`;
                });
            }
            this.vizFrame = requestAnimationFrame(draw);
        };

        this.vizFrame = requestAnimationFrame(draw);
    }

    resetVisualizer() {
        this.eqBars.forEach(bar => { bar.style.height = '2px'; });
    }

    // ---------------------------------------------------------------
    // Mode mini
    // ---------------------------------------------------------------

    async toggleMiniMode() {
        if (this.isTogglingMiniMode) return;
        this.isTogglingMiniMode = true;
        const entering = !this.isMiniMode;

        // En entrar, la classe s'aplica abans d'encongir la finestra; en sortir, la finestra
        // es restaura abans de treure la classe, per no pintar el layout complet a 340x140
        if (entering) {
            this.container.classList.add('mini-mode');
        }

        try {
            if (this.tauri) {
                await this.invoke(entering ? 'enter_mini_mode' : 'exit_mini_mode');
            }
            this.isMiniMode = entering;
        } catch (e) {
            console.error('Error Tauri Mini Mode:', e);
            this.showToast(String(e));
            // Si ha fallat a mig entrar, deixar la finestra com estava
            if (entering && this.tauri) {
                try { await this.invoke('exit_mini_mode'); } catch (err) { /* ja informat */ }
            }
        }

        if (!this.isMiniMode) {
            this.container.classList.remove('mini-mode');
            // Si sortim del mode mini, tancar l'EQ mini si estava obert
            if (this.isMiniEqOpen) {
                this.isMiniEqOpen = false;
                this.container.classList.remove('mini-show-eq');
            }
        }
        this.isTogglingMiniMode = false;
    }

    async toggleMiniEq() {
        if (!this.isMiniMode) return;

        this.isMiniEqOpen = !this.isMiniEqOpen;
        this.container.classList.toggle('mini-show-eq', this.isMiniEqOpen);

        if (this.tauri) {
            try {
                await this.invoke('resize_mini_mode', { expanded: this.isMiniEqOpen });
            } catch (e) {
                console.error('Error resizing Tauri mini mode:', e);
            }
        }
    }

    // En mode mini la finestra no té barra de títol: es mou arrossegant el reproductor
    setupMiniModeDrag() {
        this.container.addEventListener('mousedown', (e) => {
            if (!this.isMiniMode || !this.tauri || e.button !== 0) return;
            if (e.target.closest('button, input, select')) return;
            this.tauri.window.getCurrentWindow().startDragging().catch(err => {
                console.warn('No s\'ha pogut moure la finestra:', err);
            });
        });
    }

    // ---------------------------------------------------------------
    // Fonts d'àudio
    // ---------------------------------------------------------------

    switchTab(tabName) {
        this.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        this.panels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
        });
    }

    // Selector natiu (Tauri): fitxers o carpeta
    async pickAudio(folder) {
        let paths;
        try {
            paths = await this.invoke('pick_audio', { folder });
        } catch (e) {
            console.error('Error obrint el selector:', e);
            this.showToast('No s\'ha pogut obrir el selector de fitxers');
            return;
        }
        if (paths.length > 0) this.addPaths(paths); // buit = cancel·lat
    }

    // Rutes triades o arrossegades a la finestra (Tauri)
    async addPaths(paths) {
        this.showToast('Llegint fitxers…', 0);
        try {
            const scanned = await this.invoke('scan_paths', { paths });
            if (scanned.length === 0) {
                this.showToast('No s\'ha trobat cap fitxer d\'àudio');
                return;
            }
            this.addTracks(scanned.map(t => this.trackFromScan(t)));
        } catch (e) {
            console.error('Error llegint fitxers:', e);
            this.showToast('No s\'han pogut llegir els fitxers');
        }
    }

    trackFromScan(scanned) {
        return {
            id: this.nextTrackId++,
            source: 'file',
            path: scanned.path,
            title: scanned.title,
            artist: scanned.artist || 'Artista desconegut',
            album: scanned.album || '',
            duration: scanned.duration || null,
            hasArtwork: scanned.hasArtwork,
            folderArtwork: scanned.folderArtwork || null
        };
    }

    setupDragDrop() {
        if (this.tauri) {
            // A Tauri el drop HTML no rep fitxers (sobretot a Windows): cal l'event natiu
            this.tauri.webview.getCurrentWebview().onDragDropEvent((event) => {
                const { type, paths } = event.payload;
                if (type === 'enter' || type === 'over') {
                    this.container.classList.add('drag-over');
                } else if (type === 'leave') {
                    this.container.classList.remove('drag-over');
                } else if (type === 'drop') {
                    this.container.classList.remove('drag-over');
                    if (paths && paths.length > 0) this.addPaths(paths);
                }
            }).catch(e => console.warn('Drag and drop no disponible:', e));
            return;
        }

        this.fileLabels.forEach(label => {
            label.addEventListener('dragover', (e) => {
                e.preventDefault();
                label.classList.add('drag-over');
            });
            label.addEventListener('dragleave', () => label.classList.remove('drag-over'));
            label.addEventListener('drop', (e) => {
                e.preventDefault();
                label.classList.remove('drag-over');
                if (e.dataTransfer.files.length > 0) this.handleFiles(e.dataTransfer.files);
            });
        });
    }

    // Navegador (sense Tauri): objectes File, que no es poden recordar entre sessions
    async handleFiles(files) {
        const fileArray = Array.from(files);
        const isImage = (file) => file.type.startsWith('image/') || IMAGE_EXTENSIONS.includes(fileExtension(file.name));
        const isAudio = (file) => file.type.startsWith('audio/') || AUDIO_EXTENSIONS.includes(fileExtension(file.name));

        // Imatge de carpeta (cover.jpg, folder.jpg...) com a caràtula per defecte
        const images = fileArray.filter(isImage);
        const imageFile = images.find(file => COVER_NAMES.includes(stripExtension(file.name).toLowerCase())) || images[0];
        const folderArtwork = imageFile ? URL.createObjectURL(imageFile) : null;

        const audioFiles = fileArray.filter(isAudio);
        if (audioFiles.length === 0) {
            if (folderArtwork) URL.revokeObjectURL(folderArtwork);
            this.showToast('No s\'ha trobat cap fitxer d\'àudio');
            return;
        }

        const tracks = audioFiles.map(file => ({
            id: this.nextTrackId++,
            source: 'blob',
            url: URL.createObjectURL(file),
            title: stripExtension(file.name),
            artist: 'Fitxer local',
            album: '',
            duration: null,
            artworkUrl: null,
            folderArtwork,
            file
        }));
        this.addTracks(tracks);

        // Metadades amb jsmediatags (només en mode navegador)
        const jsmediatags = await this.loadJsMediaTags();
        if (!jsmediatags) return;
        tracks.forEach(track => {
            jsmediatags.read(track.file, {
                onSuccess: ({ tags }) => {
                    if (!this.playlist.includes(track)) return;
                    if (tags.title) track.title = tags.title;
                    if (tags.artist) track.artist = tags.artist;
                    if (tags.album) track.album = tags.album;
                    if (tags.picture && tags.picture.data) {
                        const bytes = new Uint8Array(tags.picture.data);
                        track.artworkUrl = URL.createObjectURL(new Blob([bytes], { type: sniffImageType(bytes) }));
                    }
                    this.renderPlaylist();
                    if (this.playlist[this.currentIndex] === track) {
                        this.updateTrackInfo(track);
                        this.loadArtwork(track);
                    }
                },
                onError: (error) => {
                    console.warn(`Error extraient metadades de ${track.file.name}:`, error);
                }
            });
        });
    }

    loadJsMediaTags() {
        if (window.jsmediatags) return Promise.resolve(window.jsmediatags);
        if (!this.jsMediaTagsPromise) {
            this.jsMediaTagsPromise = new Promise(resolve => {
                const script = document.createElement('script');
                script.src = 'vendor/jsmediatags.min.js';
                script.onload = () => resolve(window.jsmediatags || null);
                script.onerror = () => resolve(null);
                document.head.appendChild(script);
            });
        }
        return this.jsMediaTagsPromise;
    }

    // Carregar des d'URL
    loadFromUrl() {
        const url = this.urlInput.value.trim();
        if (!url) return;

        let urlObj;
        try {
            urlObj = new URL(url);
        } catch (e) {
            urlObj = null;
        }
        if (!urlObj || !['http:', 'https:'].includes(urlObj.protocol)) {
            this.showToast('Cal una adreça que comenci per http:// o https://');
            return;
        }

        // Intentar extreure nom del fitxer de l'URL
        let title = 'Àudio extern';
        const filename = urlObj.pathname.split('/').pop();
        if (filename) {
            try {
                title = decodeURIComponent(stripExtension(filename)) || title;
            } catch (e) { /* nom no descodificable */ }
        }

        this.addTracks([{
            id: this.nextTrackId++,
            source: 'url',
            url,
            title,
            artist: urlObj.hostname,
            album: '',
            duration: null
        }]);
        this.urlInput.value = '';
    }

    // ---------------------------------------------------------------
    // Llista de reproducció
    // ---------------------------------------------------------------

    addTracks(tracks) {
        if (tracks.length === 0) return;
        const wasEmpty = this.playlist.length === 0;
        this.playlist.push(...tracks);
        this.renderPlaylist();
        this.savePlaylistToStorage();

        // Si la llista era buida, carregar la primera cançó
        if (wasEmpty) {
            this.loadTrack(0);
        }
        this.showToast(tracks.length === 1 ? `Afegida «${tracks[0].title}»` : `${tracks.length} pistes afegides`);
    }

    // Agrupar re-renderitzats (p. ex. quan arriben moltes metadades seguides)
    renderPlaylist() {
        if (this.renderScheduled) return;
        this.renderScheduled = true;
        requestAnimationFrame(() => {
            this.renderScheduled = false;
            this.renderPlaylistNow();
        });
    }

    renderPlaylistNow() {
        // Filtrar pistes segons la cerca
        const filteredTracks = this.playlist.map((track, index) => ({ track, index }))
            .filter(({ track }) => {
                if (!this.searchQuery) return true;
                return track.title.toLowerCase().includes(this.searchQuery) ||
                    track.artist.toLowerCase().includes(this.searchQuery) ||
                    (track.album || '').toLowerCase().includes(this.searchQuery);
            });

        const lastIndex = this.playlist.length - 1;
        this.playlistItems.innerHTML = filteredTracks.map(({ track, index }) => {
            const classes = ['playlist-item'];
            if (index === this.currentIndex) classes.push('active');
            if (track.unavailable) classes.push('unavailable');
            const unavailableTitle = track.unavailable ? ' title="No disponible"' : '';
            return `
            <li class="${classes.join(' ')}" data-index="${index}"${unavailableTitle}>
                <span class="item-number">${index + 1}</span>
                <div class="item-info">
                    <div class="item-title">${this.highlightSearch(track.title)}</div>
                    <div class="item-artist">${this.highlightSearch(track.artist)}</div>
                </div>
                <span class="item-duration">${track.duration ? this.formatTime(track.duration) : ''}</span>
                <div class="item-actions">
                    <button class="item-move item-move-up" data-action="up" title="Pujar" aria-label="Pujar" ${index === 0 ? 'disabled' : ''}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
                        </svg>
                    </button>
                    <button class="item-move item-move-down" data-action="down" title="Baixar" aria-label="Baixar" ${index === lastIndex ? 'disabled' : ''}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                        </svg>
                    </button>
                    <button class="item-remove" data-action="remove" title="Eliminar" aria-label="Eliminar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
            </li>`;
        }).join('');

        const count = this.playlist.length;
        this.playlistCount.textContent = `${count} pist${count === 1 ? 'a' : 'es'}`;
    }

    onPlaylistClick(e) {
        const item = e.target.closest('.playlist-item');
        if (!item) return;
        const index = parseInt(item.dataset.index, 10);
        const button = e.target.closest('button[data-action]');

        if (!button) {
            this.playlist[index].unavailable = false;
            this.skipCount = 0;
            this.loadTrack(index);
            this.play();
            return;
        }
        e.stopPropagation();
        switch (button.dataset.action) {
            case 'up':
                this.moveTrack(index, index - 1);
                break;
            case 'down':
                this.moveTrack(index, index + 1);
                break;
            case 'remove':
                this.removeFromPlaylist(index);
                break;
        }
    }

    // Intercanviar una pista amb la del costat
    moveTrack(from, to) {
        if (to < 0 || to >= this.playlist.length) return;

        [this.playlist[from], this.playlist[to]] = [this.playlist[to], this.playlist[from]];

        // Ajustar currentIndex si és necessari
        if (this.currentIndex === from) {
            this.currentIndex = to;
        } else if (this.currentIndex === to) {
            this.currentIndex = from;
        }
        this.shuffleHistory = [];

        this.renderPlaylist();
        this.savePlaylistToStorage();
    }

    // Eliminar de la playlist
    removeFromPlaylist(index) {
        const [removed] = this.playlist.splice(index, 1);
        this.releaseTrack(removed);
        this.shuffleHistory = [];

        // Ajustar currentIndex
        if (index < this.currentIndex) {
            this.currentIndex--;
        } else if (index === this.currentIndex) {
            const keepPlaying = this.wantsToPlay;
            if (this.playlist.length === 0) {
                this.stop();
                this.currentIndex = -1;
                this.resetAudioElement(this.audio);
                this.updateTrackInfo(null);
                this.clearArtwork();
            } else {
                this.loadTrack(index < this.playlist.length ? index : 0);
                if (keepPlaying) this.play();
            }
        }

        this.renderPlaylist();
        this.savePlaylistToStorage();
    }

    // Alliberar les URLs blob d'una pista eliminada, si cap altra pista les fa servir
    releaseTrack(track) {
        if (!track) return;
        const inUse = (url) => this.playlist.some(t => t.url === url || t.artworkUrl === url || t.folderArtwork === url);
        [track.url, track.artworkUrl, track.folderArtwork].forEach(url => {
            if (url && url.startsWith('blob:') && !inUse(url)) {
                URL.revokeObjectURL(url);
            }
        });
    }

    // URL reproduïble de la pista
    trackSrc(track) {
        if (track.source === 'file') {
            return this.tauri ? this.tauri.core.convertFileSrc(track.path) : '';
        }
        return track.url;
    }

    // Carregar pista
    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentIndex = index;
        const track = this.playlist[index];

        // Les URLs sense CORS van per l'element directe; la resta pel graf de Web Audio
        const useGraph = !(track.source === 'url' && track.noCors);
        this.useAudioElement(useGraph ? this.audioGraph : this.audioPlain);
        this.audio.src = this.trackSrc(track);

        this.updateTrackInfo(track);
        this.loadArtwork(track);
        this.updateMediaSession(track);
        this.renderPlaylist();
        this.savePlaylistToStorage();
    }

    // Caràtula de la pista actual: incrustada al fitxer o imatge de la carpeta
    async loadArtwork(track) {
        const request = ++this.artworkRequest;
        let url = null;

        if (track.source === 'blob') {
            url = track.artworkUrl || track.folderArtwork;
        } else if (track.source === 'file' && this.tauri) {
            if (track.hasArtwork) {
                try {
                    const buffer = await this.invoke('get_artwork', { path: track.path });
                    if (request !== this.artworkRequest) return;
                    const bytes = new Uint8Array(buffer);
                    if (bytes.length > 0) {
                        url = URL.createObjectURL(new Blob([bytes], { type: sniffImageType(bytes) }));
                    }
                } catch (e) {
                    console.warn('No s\'ha pogut llegir la caràtula:', e);
                }
            }
            if (!url && track.folderArtwork) {
                url = this.tauri.core.convertFileSrc(track.folderArtwork);
            }
        }

        if (request !== this.artworkRequest) {
            if (url && url.startsWith('blob:') && track.source === 'file') URL.revokeObjectURL(url);
            return;
        }

        // Alliberar la caràtula blob anterior (només les creades aquí, no les de les pistes)
        if (this.currentArtworkBlobUrl) {
            URL.revokeObjectURL(this.currentArtworkBlobUrl);
            this.currentArtworkBlobUrl = null;
        }
        if (url && url.startsWith('blob:') && track.source === 'file') {
            this.currentArtworkBlobUrl = url;
        }

        this.updateArtwork(url);
        this.updateMediaSession(track, url);
    }

    // Treure la caràtula (llista buida): invalida les lectures en curs i allibera el blob
    clearArtwork() {
        this.artworkRequest++;
        if (this.currentArtworkBlobUrl) {
            URL.revokeObjectURL(this.currentArtworkBlobUrl);
            this.currentArtworkBlobUrl = null;
        }
        this.updateArtwork(null);
    }

    // Actualitzar carátula del vinil
    updateArtwork(artworkUrl) {
        if (artworkUrl) {
            this.labelArtwork.src = artworkUrl;
            this.labelArtwork.classList.add('visible');
            this.vinylLabel.classList.add('has-artwork');
        } else {
            this.labelArtwork.removeAttribute('src');
            this.labelArtwork.classList.remove('visible');
            this.vinylLabel.classList.remove('has-artwork');
        }
    }

    // Actualitzar info de la pista
    updateTrackInfo(track) {
        if (track) {
            const title = track.title || 'Sense títol';
            this.trackTitle.textContent = title;
            this.trackArtist.textContent = track.artist || '---';
            this.labelTitle.textContent = title;
            this.timeTotal.textContent = track.duration ? this.formatTime(track.duration) : '0:00';
        } else {
            this.trackTitle.textContent = 'Sense cançó';
            this.trackArtist.textContent = '---';
            this.labelTitle.textContent = '';
            this.timeTotal.textContent = '0:00';
        }
        this.timeCurrent.textContent = '0:00';
        this.progressBar.style.width = '0%';
    }

    // ---------------------------------------------------------------
    // Controls de reproducció
    // ---------------------------------------------------------------

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (this.playlist.length === 0) return;

        // Si no hi ha cap pista carregada, carregar la primera
        if (this.currentIndex === -1 || !this.audio.getAttribute('src')) {
            this.loadTrack(Math.max(0, this.currentIndex));
        }

        this.wantsToPlay = true;
        if (this.audio === this.audioGraph) {
            this.ensureAudioContext();
        }
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.audio.play().catch(err => {
            // AbortError: s'ha canviat de pista abans que comencés a sonar (normal)
            if (err.name !== 'AbortError') console.error('Error en reproducció:', err);
        });
    }

    pause() {
        this.wantsToPlay = false;
        this.audio.pause();
    }

    stop() {
        this.wantsToPlay = false;
        this.audio.pause();
        if (this.audio.getAttribute('src')) this.audio.currentTime = 0;
        this.isPlaying = false;
        this.updatePlayState();
    }

    playPrevious() {
        if (this.playlist.length === 0) return;

        // Si hem passat més de 3 segons, tornar al principi de la cançó
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            return;
        }

        const newIndex = this.getNextTrackIndex('prev');
        if (newIndex === -1) return;
        const keepPlaying = this.wantsToPlay;
        this.loadTrack(newIndex);
        if (keepPlaying) this.play();
    }

    playNext() {
        if (this.playlist.length === 0) return;

        const newIndex = this.getNextTrackIndex('next');
        if (newIndex === -1) return;
        const keepPlaying = this.wantsToPlay;
        this.loadTrack(newIndex);
        if (keepPlaying) this.play();
    }

    onTrackEnd() {
        if (this.repeatMode === 2) { // Repetir una
            this.audio.currentTime = 0;
            this.play();
            return;
        }

        // En aleatori, s'acaba quan s'han escoltat totes les pistes que es poden reproduir
        const playableCount = this.playlist.filter(t => !t.unavailable).length;
        const atEnd = this.isShuffle
            ? this.shuffleHistory.length >= playableCount - 1
            : this.currentIndex >= this.playlist.length - 1;
        if (this.repeatMode === 0 && atEnd) {
            this.stop();
            this.shuffleHistory = [];
            return;
        }

        const next = this.getNextTrackIndex('next');
        // Sense repetició no es torna a començar per dalt (p. ex. si les últimes no hi són)
        const wrapped = !this.isShuffle && next !== -1 && next <= this.currentIndex;
        if (next === -1 || (this.repeatMode === 0 && wrapped)) {
            if (this.repeatMode === 1 && next === -1) {
                // Una sola pista disponible amb "repetir totes": tornar-la a reproduir
                this.audio.currentTime = 0;
                this.play();
                return;
            }
            this.stop();
            this.shuffleHistory = [];
            return;
        }
        this.loadTrack(next);
        this.play();
    }

    // Índex de la pista següent/anterior, saltant les no disponibles
    getNextTrackIndex(direction = 'next', fromError = false) {
        const count = this.playlist.length;
        if (count === 0) return -1;
        const playable = (i) => !this.playlist[i].unavailable;

        if (this.isShuffle) {
            if (direction === 'prev' && !fromError) {
                while (this.shuffleHistory.length > 0) {
                    const previous = this.shuffleHistory.pop();
                    if (previous < count && playable(previous)) return previous;
                }
            }
            // Aleatori sense repetir la pista actual ni les ja escoltades (si en queden)
            const candidates = this.playlist.map((_, i) => i).filter(i => i !== this.currentIndex && playable(i));
            const unheard = candidates.filter(i => !this.shuffleHistory.includes(i));
            const pool = unheard.length > 0 ? unheard : candidates;
            if (pool.length === 0) return -1;
            if (direction === 'next' && this.currentIndex !== -1) this.shuffleHistory.push(this.currentIndex);
            return pool[Math.floor(Math.random() * pool.length)];
        }

        const step = direction === 'next' ? 1 : -1;
        for (let offset = 1; offset <= count; offset++) {
            const candidate = (((this.currentIndex + step * offset) % count) + count) % count;
            if (playable(candidate) && candidate !== this.currentIndex) return candidate;
        }
        return -1;
    }

    onPlay() {
        this.isPlaying = true;
        this.updatePlayState();
        this.startVisualizer();
    }

    onPause() {
        this.isPlaying = false;
        this.updatePlayState();
    }

    updatePlayState() {
        // Botó play/pause
        this.btnPlay.classList.toggle('playing', this.isPlaying);
        this.btnPlay.title = this.isPlaying ? 'Pausar' : 'Reproduir';

        // Animacions del tocadiscs
        this.vinyl.classList.toggle('playing', this.isPlaying);
        this.tonearm.classList.toggle('playing', this.isPlaying);

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
        }
    }

    // Shuffle
    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        this.shuffleHistory = [];
        this.btnShuffle.classList.toggle('active', this.isShuffle);
        this.saveSettings();
    }

    // Repeat
    toggleRepeat() {
        this.repeatMode = (this.repeatMode + 1) % 3;
        this.updateRepeatView();
        this.saveSettings();
    }

    updateRepeatView() {
        this.btnRepeat.classList.toggle('active', this.repeatMode > 0);
        this.btnRepeat.classList.toggle('repeat-one', this.repeatMode === 2);
        this.btnRepeat.title = REPEAT_LABELS[this.repeatMode];
        this.btnRepeat.setAttribute('aria-label', REPEAT_LABELS[this.repeatMode]);
    }

    // Volum
    setVolume(value) {
        this.volume = Math.min(1, Math.max(0, value));
        this.applyVolume();
        this.volumeSlider.value = Math.round(this.volume * 100);
        this.btnMute.classList.toggle('muted', this.volume === 0);
        this.saveSettings();
    }

    toggleMute() {
        if (this.volume > 0) {
            this.previousVolume = this.volume;
            this.setVolume(0);
        } else {
            this.setVolume(this.previousVolume || 0.8);
        }
    }

    // Balanç
    setBalance(value) {
        if (this.panner) {
            this.panner.pan.value = value;
        }
        this.saveSettings();
    }

    // Progrés
    updateProgress() {
        const { currentTime, duration } = this.audio;
        const progress = Number.isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0;
        this.progressBar.style.width = `${progress}%`;
        this.timeCurrent.textContent = this.formatTime(currentTime);
    }

    updateDuration() {
        const { duration } = this.audio;
        this.timeTotal.textContent = Number.isFinite(duration) ? this.formatTime(duration) : '∞';

        // Desar la durada real (les URLs no en tenen fins que es carreguen)
        const track = this.playlist[this.currentIndex];
        if (track && Number.isFinite(duration) && !track.duration) {
            track.duration = duration;
            this.renderPlaylist();
            this.savePlaylistToStorage();
        }
    }

    seek(e) {
        const { duration } = this.audio;
        if (!Number.isFinite(duration) || duration <= 0) return;
        const rect = this.progressContainer.getBoundingClientRect();
        const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        this.audio.currentTime = percent * duration;
    }

    seekBy(seconds) {
        const { duration, currentTime } = this.audio;
        if (!Number.isFinite(duration) || duration <= 0) return;
        this.audio.currentTime = Math.min(duration, Math.max(0, currentTime + seconds));
    }

    // Tecles multimèdia i "Now Playing" del sistema
    setupMediaSession() {
        if (!('mediaSession' in navigator)) return;
        const handlers = {
            play: () => this.play(),
            pause: () => this.pause(),
            stop: () => this.stop(),
            previoustrack: () => this.playPrevious(),
            nexttrack: () => this.playNext(),
            seekto: (details) => {
                if (Number.isFinite(details.seekTime)) this.audio.currentTime = details.seekTime;
            }
        };
        Object.entries(handlers).forEach(([action, handler]) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (e) { /* acció no suportada */ }
        });
    }

    updateMediaSession(track, artworkUrl = null) {
        if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || 'Sense títol',
            artist: track.artist || '',
            album: track.album || '',
            artwork: artworkUrl ? [{ src: artworkUrl }] : []
        });
    }

    // ---------------------------------------------------------------
    // Utilitats
    // ---------------------------------------------------------------

    formatTime(seconds) {
        if (!Number.isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Escapar HTML per evitar XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Ressaltar text de cerca (s'escapa cada tros, no el resultat)
    highlightSearch(text) {
        const value = text || '';
        if (!this.searchQuery) return this.escapeHtml(value);
        const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'i');
        // Amb un grup de captura, els trossos senars del split són les coincidències
        return value.split(regex).map((part, i) =>
            i % 2 === 1 ? `<mark>${this.escapeHtml(part)}</mark>` : this.escapeHtml(part)
        ).join('');
    }

    // Escapar caràcters especials de regex
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    clearSearch() {
        this.searchQuery = '';
        this.playlistSearch.value = '';
        this.renderPlaylist();
    }

    // Avís temporal (duration 0 = fins al següent avís)
    showToast(message, duration = 2600) {
        this.toast.textContent = message;
        this.toast.classList.add('visible');
        clearTimeout(this.toastTimer);
        if (duration > 0) {
            this.toastTimer = setTimeout(() => this.toast.classList.remove('visible'), duration);
        }
    }

    // Diàleg propi: { title, message, input, list, okLabel, cancelLabel, showCancel }
    // Retorna una promesa amb { ok, value, choice }
    showModal({ title, message = '', input = null, list = null, okLabel = 'D\'acord', cancelLabel = 'Cancel·lar', showCancel = true }) {
        if (this.modalResolve) this.closeModal(false);

        this.modalTitle.textContent = title;
        this.modalMessage.textContent = message;
        this.modalMessage.hidden = !message;
        this.modalInput.hidden = !input;
        this.modalInput.value = input ? (input.value || '') : '';
        this.modalInput.placeholder = input ? (input.placeholder || '') : '';
        this.modalOk.textContent = okLabel;
        this.modalOk.hidden = Boolean(list);
        this.modalCancel.textContent = cancelLabel;
        this.modalCancel.hidden = !showCancel;

        this.modalList.innerHTML = '';
        this.modalList.hidden = !list;
        (list || []).forEach(entry => {
            const li = document.createElement('li');
            const choose = document.createElement('button');
            choose.className = 'modal-list-choice';
            choose.innerHTML = `<span class="modal-list-label"></span><span class="modal-list-sublabel"></span>`;
            choose.querySelector('.modal-list-label').textContent = entry.label;
            choose.querySelector('.modal-list-sublabel').textContent = entry.sublabel || '';
            choose.addEventListener('click', () => this.closeModal(true, entry.value));
            li.appendChild(choose);
            if (entry.onDelete) {
                const remove = document.createElement('button');
                remove.className = 'modal-list-delete';
                remove.title = 'Eliminar';
                remove.setAttribute('aria-label', `Eliminar ${entry.label}`);
                remove.textContent = '×';
                remove.addEventListener('click', () => {
                    entry.onDelete();
                    li.remove();
                    if (this.modalList.children.length === 0) this.closeModal(false);
                });
                li.appendChild(remove);
            }
            this.modalList.appendChild(li);
        });

        this.modal.hidden = false;
        const focusTarget = input ? this.modalInput : (list ? this.modalList.querySelector('button') : this.modalOk);
        if (focusTarget) setTimeout(() => focusTarget.focus(), 0);

        return new Promise(resolve => { this.modalResolve = resolve; });
    }

    closeModal(ok, choice = null) {
        if (!this.modalResolve) return;
        const resolve = this.modalResolve;
        this.modalResolve = null;
        this.modal.hidden = true;
        resolve({ ok, value: this.modalInput.value, choice });
    }

    // ---------------------------------------------------------------
    // Playlists guardades
    // ---------------------------------------------------------------

    // Les pistes de fitxers locals del navegador (blob) no es poden recordar
    serializeTracks(tracks) {
        return tracks
            .filter(track => track.source !== 'blob')
            .map(track => ({
                source: track.source,
                path: track.path,
                url: track.url,
                title: track.title,
                artist: track.artist,
                album: track.album,
                duration: track.duration,
                hasArtwork: track.hasArtwork,
                folderArtwork: track.folderArtwork,
                noCors: track.noCors
            }));
    }

    // Reconstruir pistes desades; a Tauri es tornen a autoritzar les rutes i es
    // refresquen les metadades. Els fitxers que ja no hi són queden com a no disponibles.
    async hydrateTracks(saved) {
        const tracks = saved
            .map(raw => {
                // Format antic (v1.0): { title, artist, url, isLocal: false }
                const source = raw.source || (raw.isLocal ? null : 'url');
                if (source === 'url' && raw.url) {
                    return { ...raw, source, id: this.nextTrackId++, album: raw.album || '' };
                }
                if (source === 'file' && raw.path) {
                    return { ...raw, source, id: this.nextTrackId++, album: raw.album || '', unavailable: !this.tauri };
                }
                return null;
            })
            .filter(track => track && track.title);

        const files = tracks.filter(t => t.source === 'file');
        if (this.tauri && files.length > 0) {
            try {
                const scanned = await this.invoke('scan_paths', { paths: files.map(t => t.path) });
                const byPath = new Map(scanned.map(s => [s.path, s]));
                files.forEach(track => {
                    const fresh = byPath.get(track.path);
                    if (fresh) {
                        Object.assign(track, this.trackFromScan(fresh), { id: track.id });
                    } else {
                        track.unavailable = true;
                    }
                });
            } catch (e) {
                console.error('Error restaurant fitxers:', e);
                files.forEach(track => { track.unavailable = true; });
            }
        }
        return tracks;
    }

    async saveNamedPlaylist() {
        this.playlistMenu.classList.remove('open');

        const tracksToSave = this.serializeTracks(this.playlist);
        if (tracksToSave.length === 0) {
            this.showToast('No hi ha pistes que es puguin guardar');
            return;
        }

        const { ok, value } = await this.showModal({
            title: 'Guardar playlist',
            message: `${tracksToSave.length} pist${tracksToSave.length === 1 ? 'a' : 'es'}`,
            input: { placeholder: 'Nom de la playlist' },
            okLabel: 'Guardar'
        });
        const name = (value || '').trim();
        if (!ok || !name) return;

        const savedPlaylists = readStorage(STORAGE_KEYS.savedPlaylists, {});
        if (savedPlaylists[name]) {
            const confirm = await this.showModal({
                title: 'Substituir playlist',
                message: `Ja existeix una playlist anomenada «${name}». Vols substituir-la?`,
                okLabel: 'Substituir'
            });
            if (!confirm.ok) return;
        }

        savedPlaylists[name] = {
            tracks: tracksToSave,
            savedAt: new Date().toISOString()
        };
        writeStorage(STORAGE_KEYS.savedPlaylists, savedPlaylists);
        this.showToast(`Playlist «${name}» guardada`);
    }

    async showLoadPlaylistDialog() {
        this.playlistMenu.classList.remove('open');

        const savedPlaylists = readStorage(STORAGE_KEYS.savedPlaylists, {});
        const names = Object.keys(savedPlaylists);
        if (names.length === 0) {
            this.showToast('No hi ha playlists guardades');
            return;
        }

        const { ok, choice } = await this.showModal({
            title: 'Carregar playlist',
            message: 'Les pistes s\'afegeixen al final de la llista.',
            list: names.map(name => {
                const count = (savedPlaylists[name].tracks || []).length;
                return {
                    label: name,
                    sublabel: `${count} pist${count === 1 ? 'a' : 'es'}`,
                    value: name,
                    onDelete: () => {
                        const current = readStorage(STORAGE_KEYS.savedPlaylists, {});
                        delete current[name];
                        writeStorage(STORAGE_KEYS.savedPlaylists, current);
                    }
                };
            })
        });
        if (!ok || !choice) return;

        const playlist = readStorage(STORAGE_KEYS.savedPlaylists, {})[choice];
        if (!playlist) return;
        const tracks = await this.hydrateTracks(playlist.tracks || []);
        if (tracks.length === 0) {
            this.showToast('Aquesta playlist no té pistes vàlides');
            return;
        }
        this.addTracks(tracks);
    }

    async clearCurrentPlaylist() {
        this.playlistMenu.classList.remove('open');
        if (this.playlist.length === 0) return;

        const count = this.playlist.length;
        const { ok } = await this.showModal({
            title: 'Esborrar llista',
            message: `S'esborraran les ${count} pistes de la llista actual.`,
            okLabel: 'Esborrar'
        });
        if (!ok) return;

        this.stop();
        const removed = this.playlist;
        this.playlist = [];
        removed.forEach(track => this.releaseTrack(track));
        this.currentIndex = -1;
        this.shuffleHistory = [];
        this.resetAudioElement(this.audio);
        this.updateTrackInfo(null);
        this.clearArtwork();
        this.renderPlaylist();
        this.savePlaylistToStorage();
    }

    // ---------------------------------------------------------------
    // Tema i persistència
    // ---------------------------------------------------------------

    // Inicialitzar tema (detectar preferència guardada o del sistema)
    initTheme() {
        let savedTheme = null;
        try {
            savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
        } catch (e) { /* sense emmagatzematge */ }
        if (savedTheme === 'dark' || savedTheme === 'light') {
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
        // Si no hi ha tema guardat, el CSS s'encarrega de detectar prefers-color-scheme
    }

    // Alternar entre mode clar i fosc
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = currentTheme ? currentTheme === 'dark' : prefersDark;
        const newTheme = isDark ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        try {
            localStorage.setItem(STORAGE_KEYS.theme, newTheme);
        } catch (e) { /* sense emmagatzematge */ }
    }

    saveSettings() {
        if (this.loadingSettings) return;
        writeStorage(STORAGE_KEYS.settings, {
            volume: this.volume,
            balance: parseFloat(this.balanceSlider.value) || 0,
            eqGains: Array.from(this.eqSliders, slider => parseFloat(slider.value) || 0),
            eqPreset: this.eqPreset.value,
            eqCollapsed: this.eqSection.classList.contains('collapsed'),
            repeatMode: this.repeatMode,
            isShuffle: this.isShuffle
        });
    }

    loadSettings() {
        // Compatibilitat: abans el volum i els modes es guardaven amb la playlist
        const legacy = readStorage(STORAGE_KEYS.playlist, {}) || {};
        const settings = readStorage(STORAGE_KEYS.settings, null) || {
            volume: legacy.volume,
            repeatMode: legacy.repeatMode,
            isShuffle: legacy.isShuffle
        };

        this.loadingSettings = true;
        this.setVolume(typeof settings.volume === 'number' ? settings.volume : 0.8);

        if (typeof settings.balance === 'number') {
            this.balanceSlider.value = Math.min(100, Math.max(-100, settings.balance));
        }
        if (settings.eqPreset && this.eqPresets[settings.eqPreset]) {
            this.eqPreset.value = settings.eqPreset;
        }
        if (Array.isArray(settings.eqGains)) {
            settings.eqGains.forEach((gain, index) => {
                if (this.eqSliders[index] && typeof gain === 'number') this.eqSliders[index].value = gain;
            });
        }
        this.eqSection.classList.toggle('collapsed', Boolean(settings.eqCollapsed));

        if ([0, 1, 2].includes(settings.repeatMode)) this.repeatMode = settings.repeatMode;
        this.updateRepeatView();
        this.isShuffle = Boolean(settings.isShuffle);
        this.btnShuffle.classList.toggle('active', this.isShuffle);
        this.loadingSettings = false;
    }

    // Guardar playlist a localStorage
    savePlaylistToStorage() {
        const current = this.playlist[this.currentIndex];
        const persistable = this.playlist.filter(track => track.source !== 'blob');
        writeStorage(STORAGE_KEYS.playlist, {
            tracks: this.serializeTracks(this.playlist),
            // Índex dins de les pistes guardades (no de tota la llista)
            currentIndex: current ? persistable.indexOf(current) : -1
        });
    }

    // Carregar playlist des de localStorage
    async restorePlaylist() {
        const state = readStorage(STORAGE_KEYS.playlist, null);
        if (!state || !Array.isArray(state.tracks) || state.tracks.length === 0) {
            this.renderPlaylist();
            return;
        }

        const tracks = await this.hydrateTracks(state.tracks);
        if (tracks.length === 0) {
            this.renderPlaylist();
            return;
        }
        // Les pistes restaurades van davant de les que l'usuari hagi pogut afegir mentrestant
        this.playlist.unshift(...tracks);
        if (this.currentIndex !== -1) {
            this.currentIndex += tracks.length;
            this.renderPlaylist();
            this.savePlaylistToStorage();
            return;
        }

        const index = Number.isInteger(state.currentIndex) && state.currentIndex >= 0 && state.currentIndex < tracks.length
            ? state.currentIndex
            : 0;
        this.loadTrack(index);
    }
}

// Inicialitzar el reproductor quan el DOM estigui llest
document.addEventListener('DOMContentLoaded', () => {
    window.player = new TurntablePlayer();
});
