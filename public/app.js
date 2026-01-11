// Reproductor de Música Tocadiscs
// ================================

class TurntablePlayer {
    constructor() {
        // Elements DOM
        this.audio = document.getElementById('audioPlayer');
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
        this.playlistItems = document.getElementById('playlistItems');
        this.presetList = document.getElementById('presetList');

        // Botons
        this.btnPlay = document.getElementById('btnPlay');
        this.btnStop = document.getElementById('btnStop');
        this.btnPrev = document.getElementById('btnPrev');
        this.btnNext = document.getElementById('btnNext');
        this.btnShuffle = document.getElementById('btnShuffle');
        this.btnRepeat = document.getElementById('btnRepeat');
        this.btnMute = document.getElementById('btnMute');
        this.volumeSlider = document.getElementById('volumeSlider');

        // Inputs
        this.fileInput = document.getElementById('fileInput');
        this.folderInput = document.getElementById('folderInput');
        this.urlInput = document.getElementById('urlInput');
        this.btnLoadUrl = document.getElementById('btnLoadUrl');

        // Tabs
        this.tabs = document.querySelectorAll('.tab');
        this.panels = document.querySelectorAll('.source-panel');

        // Estat
        this.playlist = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.isShuffle = false;
        this.repeatMode = 0; // 0: off, 1: all, 2: one
        this.previousVolume = 0.8;

        // Web Audio API per l'equalitzador
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.isAudioContextSetup = false;
        this.filters = [];
        this.panner = null;

        // Balance slider
        this.balanceSlider = document.getElementById('balanceSlider');

        // Elements equalitzador
        this.eqSection = document.getElementById('equalizerSection');
        this.eqPreset = document.getElementById('eqPreset');
        this.eqToggle = document.getElementById('eqToggle');
        this.eqSliders = document.querySelectorAll('.eq-slider');

        // Freqüències de l'equalitzador
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
        this.isMiniMode = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.audio.volume = 0.8;
        this.updateVolumeSlider();
    }

    setupEventListeners() {
        // Controls de reproducció
        this.btnPlay.addEventListener('click', () => this.togglePlay());
        this.btnStop.addEventListener('click', () => this.stop());
        this.btnPrev.addEventListener('click', () => this.playPrevious());
        this.btnNext.addEventListener('click', () => this.playNext());
        this.btnShuffle.addEventListener('click', () => this.toggleShuffle());
        this.btnRepeat.addEventListener('click', () => this.toggleRepeat());

        // Volum
        this.btnMute.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value / 100));

        // Balanç
        this.balanceSlider.addEventListener('input', (e) => this.setBalance(e.target.value / 100));

        // Progrés
        this.progressContainer.addEventListener('click', (e) => this.seek(e));

        // Àudio events
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('ended', () => this.onTrackEnd());
        this.audio.addEventListener('play', () => this.onPlay());
        this.audio.addEventListener('pause', () => this.onPause());

        // Font d'àudio
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.folderInput.addEventListener('change', (e) => this.handleFolderSelect(e));
        this.btnLoadUrl.addEventListener('click', () => this.loadFromUrl());
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadFromUrl();
        });

        // Tabs
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Drag and drop
        const fileLabel = document.querySelector('.file-input-label');
        fileLabel.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileLabel.style.borderColor = 'var(--accent-color)';
            fileLabel.style.background = 'rgba(231, 76, 60, 0.1)';
        });
        fileLabel.addEventListener('dragleave', () => {
            fileLabel.style.borderColor = '';
            fileLabel.style.background = '';
        });
        fileLabel.addEventListener('drop', (e) => {
            e.preventDefault();
            fileLabel.style.borderColor = '';
            fileLabel.style.background = '';
            if (e.dataTransfer.files.length > 0) {
                this.handleFiles(e.dataTransfer.files);
            }
        });

        // Equalitzador
        this.eqToggle.addEventListener('click', () => this.toggleEqView());
        this.eqPreset.addEventListener('change', (e) => this.applyEqPreset(e.target.value));
        this.eqSliders.forEach((slider, index) => {
            slider.addEventListener('input', (e) => this.setEqBand(index, parseFloat(e.target.value)));
        });

        // Mode mini
        this.btnMiniMode.addEventListener('click', () => this.toggleMiniMode());
        this.setupMiniModeDrag();

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'ArrowLeft':
                    this.audio.currentTime -= 5;
                    break;
                case 'ArrowRight':
                    this.audio.currentTime += 5;
                    break;
                case 'ArrowUp':
                    this.setVolume(Math.min(1, this.audio.volume + 0.1));
                    break;
                case 'ArrowDown':
                    this.setVolume(Math.max(0, this.audio.volume - 0.1));
                    break;
            }
        });
    }

    // Configurar Web Audio API per l'equalitzador
    setupAudioContext() {
        if (this.isAudioContextSetup) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;

            // Crear filtres per cada banda de l'equalitzador
            this.filters = this.eqFrequencies.map(freq => {
                const filter = this.audioContext.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1;
                filter.gain.value = 0;
                return filter;
            });

            // Crear panner per al balanç
            this.panner = this.audioContext.createStereoPanner();
            this.panner.pan.value = 0;

            // Connectar en cadena: source -> filters -> panner -> analyser -> destination
            this.source = this.audioContext.createMediaElementSource(this.audio);
            let lastNode = this.source;
            this.filters.forEach(filter => {
                lastNode.connect(filter);
                lastNode = filter;
            });
            lastNode.connect(this.panner);
            this.panner.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.isAudioContextSetup = true;
            this.startEqualizer();
        } catch (error) {
            console.warn('Web Audio API no disponible:', error);
        }
    }

    // Alternar vista de l'equalitzador
    toggleEqView() {
        this.eqSection.classList.toggle('show-sliders');
    }

    // Aplicar preset de l'equalitzador
    applyEqPreset(presetName) {
        const preset = this.eqPresets[presetName];
        if (!preset) return;

        preset.forEach((gain, index) => {
            this.setEqBand(index, gain);
            this.eqSliders[index].value = gain;
        });
    }

    // Ajustar una banda de l'equalitzador
    setEqBand(index, gain) {
        if (this.filters[index]) {
            this.filters[index].gain.value = gain;
        }
    }

    // Mode mini
    async toggleMiniMode() {
        this.isMiniMode = !this.isMiniMode;
        this.container.classList.toggle('mini-mode', this.isMiniMode);

        // Comunicar amb Tauri si està disponible
        console.log('Tauri disponible?', !!window.__TAURI__);
        console.log('Tauri object:', window.__TAURI__);

        if (window.__TAURI__) {
            try {
                console.log('Tauri.window:', window.__TAURI__.window);
                const { getCurrentWindow } = window.__TAURI__.window;
                const appWindow = getCurrentWindow();
                console.log('appWindow:', appWindow);

                if (this.isMiniMode) {
                    // Guardar mida original
                    const size = await appWindow.outerSize();
                    this.originalSize = { width: size.width, height: size.height };

                    // Canviar a mode mini
                    await appWindow.setMinSize({ width: 340, height: 140 });
                    await appWindow.setSize({ width: 340, height: 140 });
                    await appWindow.setAlwaysOnTop(true);
                    await appWindow.setResizable(false);
                } else {
                    // Restaurar mida original
                    await appWindow.setAlwaysOnTop(false);
                    await appWindow.setResizable(true);
                    await appWindow.setMinSize({ width: 400, height: 600 });
                    if (this.originalSize) {
                        await appWindow.setSize(this.originalSize);
                    } else {
                        await appWindow.setSize({ width: 1000, height: 800 });
                    }
                }
            } catch (e) {
                console.error('Error amb Tauri window:', e);
            }
        }

        if (!this.isMiniMode) {
            // Restaurar posició original
            this.container.style.left = '';
            this.container.style.top = '';
            this.container.style.right = '';
            this.container.style.bottom = '';
        }
    }

    setupMiniModeDrag() {
        this.container.addEventListener('mousedown', (e) => {
            if (!this.isMiniMode) return;
            if (e.target.closest('button, input, select')) return;

            this.isDragging = true;
            const rect = this.container.getBoundingClientRect();
            this.dragOffset.x = e.clientX - rect.left;
            this.dragOffset.y = e.clientY - rect.top;
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;

            this.container.style.left = `${x}px`;
            this.container.style.top = `${y}px`;
            this.container.style.right = 'auto';
            this.container.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
    }

    // Equalitzador visual
    startEqualizer() {
        if (!this.analyser) return;

        const bars = this.equalizer.querySelectorAll('.eq-bar');
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const barCount = bars.length;
        const step = Math.floor(bufferLength / barCount);

        const animate = () => {
            if (!this.isPlaying) {
                bars.forEach(bar => bar.style.height = '4px');
                return;
            }

            this.analyser.getByteFrequencyData(dataArray);

            bars.forEach((bar, i) => {
                // Agafar la mitjana de les freqüències per cada barra
                let sum = 0;
                for (let j = 0; j < step; j++) {
                    sum += dataArray[i * step + j];
                }
                const average = sum / step;
                const height = Math.max(4, (average / 255) * 40);
                bar.style.height = `${height}px`;
            });

            requestAnimationFrame(animate);
        };

        animate();
    }

    // Canviar pestanya
    switchTab(tabName) {
        this.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        this.panels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
        });
    }

    // Carregar fitxers locals
    handleFileSelect(e) {
        this.handleFiles(e.target.files);
    }

    handleFiles(files) {
        Array.from(files).forEach(file => {
            // Acceptar àudio/* i també FLAC (alguns navegadors no detecten el tipus MIME correctament)
            const isAudio = file.type.startsWith('audio/') ||
                           file.name.toLowerCase().endsWith('.flac') ||
                           file.name.toLowerCase().endsWith('.mp3') ||
                           file.name.toLowerCase().endsWith('.wav') ||
                           file.name.toLowerCase().endsWith('.ogg') ||
                           file.name.toLowerCase().endsWith('.m4a') ||
                           file.name.toLowerCase().endsWith('.aac');
            if (isAudio) {
                const url = URL.createObjectURL(file);
                this.addToPlaylist({
                    title: file.name.replace(/\.[^/.]+$/, ''),
                    artist: 'Fitxer local',
                    url: url,
                    isLocal: true
                });
            }
        });
    }

    // Carregar des d'URL
    loadFromUrl() {
        const url = this.urlInput.value.trim();
        if (!url) return;

        // Intentar extreure nom del fitxer de l'URL
        let title = 'Àudio extern';
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            const filename = path.split('/').pop();
            if (filename) {
                title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ''));
            }
        } catch (e) {}

        this.addToPlaylist({
            title: title,
            artist: 'URL externa',
            url: url,
            isLocal: false
        });

        this.urlInput.value = '';
    }

    // Carregar carpeta
    handleFolderSelect(e) {
        this.handleFiles(e.target.files);
    }

    // Afegir a la playlist
    addToPlaylist(track) {
        this.playlist.push(track);
        this.renderPlaylist();

        // Si és la primera cançó, carregar-la
        if (this.playlist.length === 1) {
            this.loadTrack(0);
        }
    }

    // Renderitzar playlist
    renderPlaylist() {
        this.playlistItems.innerHTML = this.playlist.map((track, index) => `
            <li class="playlist-item ${index === this.currentIndex ? 'active' : ''}" data-index="${index}">
                <span class="item-number">${index + 1}</span>
                <div class="item-info">
                    <div class="item-title">${track.title}</div>
                    <div class="item-artist">${track.artist}</div>
                </div>
                <button class="item-remove" data-index="${index}" title="Eliminar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </li>
        `).join('');

        // Event listeners per la playlist
        this.playlistItems.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.item-remove')) {
                    const index = parseInt(item.dataset.index);
                    this.loadTrack(index);
                    this.play();
                }
            });
        });

        this.playlistItems.querySelectorAll('.item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.removeFromPlaylist(index);
            });
        });
    }

    // Eliminar de la playlist
    removeFromPlaylist(index) {
        // Si és local, alliberar l'objectURL
        if (this.playlist[index].isLocal) {
            URL.revokeObjectURL(this.playlist[index].url);
        }

        this.playlist.splice(index, 1);

        // Ajustar currentIndex
        if (index < this.currentIndex) {
            this.currentIndex--;
        } else if (index === this.currentIndex) {
            if (this.playlist.length === 0) {
                this.currentIndex = -1;
                this.stop();
                this.updateTrackInfo(null);
            } else if (this.currentIndex >= this.playlist.length) {
                this.currentIndex = 0;
                this.loadTrack(this.currentIndex);
            } else {
                this.loadTrack(this.currentIndex);
            }
        }

        this.renderPlaylist();
    }

    // Carregar pista
    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentIndex = index;
        const track = this.playlist[index];
        this.audio.src = track.url;
        this.updateTrackInfo(track);
        this.renderPlaylist();

        // Configurar context d'àudio la primera vegada
        if (!this.isAudioContextSetup) {
            // Ho farem al primer play per evitar errors d'autoplay
        }
    }

    // Actualitzar info de la pista
    updateTrackInfo(track) {
        if (track) {
            const title = track.title || 'Sense títol';
            this.trackTitle.textContent = title;
            this.trackArtist.textContent = track.artist || '---';
            this.labelTitle.textContent = title;
        } else {
            this.trackTitle.textContent = 'Sense cançó';
            this.trackArtist.textContent = '---';
            this.labelTitle.textContent = '';
            this.timeCurrent.textContent = '0:00';
            this.timeTotal.textContent = '0:00';
            this.progressBar.style.width = '0%';
        }
    }

    // Controls de reproducció
    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (this.playlist.length === 0) return;

        // Reproduir primer, després intentar configurar equalitzador
        this.audio.play().then(() => {
            // Intentar configurar context d'àudio per l'equalitzador (només fitxers locals)
            const currentTrack = this.playlist[this.currentIndex];
            if (currentTrack && currentTrack.isLocal && !this.isAudioContextSetup) {
                try {
                    this.setupAudioContext();
                } catch (e) {
                    console.warn('Equalitzador no disponible:', e);
                }
            }
            // Reprendre context d'àudio si està suspès
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }).catch(err => {
            console.error('Error reproduint:', err);
        });
    }

    pause() {
        this.audio.pause();
    }

    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
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

        let newIndex;
        if (this.isShuffle) {
            newIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            newIndex = this.currentIndex - 1;
            if (newIndex < 0) newIndex = this.playlist.length - 1;
        }

        this.loadTrack(newIndex);
        if (this.isPlaying) this.play();
    }

    playNext() {
        if (this.playlist.length === 0) return;

        let newIndex;
        if (this.isShuffle) {
            newIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            newIndex = this.currentIndex + 1;
            if (newIndex >= this.playlist.length) newIndex = 0;
        }

        this.loadTrack(newIndex);
        if (this.isPlaying) this.play();
    }

    onTrackEnd() {
        switch (this.repeatMode) {
            case 2: // Repetir una
                this.audio.currentTime = 0;
                this.play();
                break;
            case 1: // Repetir totes
                this.loadTrack(this.getNextIndex());
                this.play();
                break;
            case 0: // Sense repetir
                if (this.currentIndex < this.playlist.length - 1) {
                    this.loadTrack(this.currentIndex + 1);
                    this.play();
                } else {
                    this.stop();
                }
                break;
        }
    }

    getNextIndex() {
        if (this.isShuffle) {
            return Math.floor(Math.random() * this.playlist.length);
        }
        let next = this.currentIndex + 1;
        return next >= this.playlist.length ? 0 : next;
    }

    onPlay() {
        this.isPlaying = true;
        this.updatePlayState();
        this.startEqualizer();
    }

    onPause() {
        this.isPlaying = false;
        this.updatePlayState();
    }

    updatePlayState() {
        // Botó play/pause
        this.btnPlay.classList.toggle('playing', this.isPlaying);

        // Animacions del tocadiscs
        this.vinyl.classList.toggle('playing', this.isPlaying);
        this.tonearm.classList.toggle('playing', this.isPlaying);
    }

    // Shuffle
    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        this.btnShuffle.classList.toggle('active', this.isShuffle);
    }

    // Repeat
    toggleRepeat() {
        this.repeatMode = (this.repeatMode + 1) % 3;
        this.btnRepeat.classList.toggle('active', this.repeatMode > 0);

        // Indicador visual del mode
        if (this.repeatMode === 2) {
            this.btnRepeat.style.position = 'relative';
            this.btnRepeat.innerHTML = `
                <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                <span style="position: absolute; font-size: 8px; font-weight: bold; bottom: 8px; right: 8px;">1</span>
            `;
        } else {
            this.btnRepeat.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
        }
    }

    // Volum
    setVolume(value) {
        this.audio.volume = value;
        this.volumeSlider.value = value * 100;
        this.btnMute.classList.toggle('muted', value === 0);
    }

    toggleMute() {
        if (this.audio.volume > 0) {
            this.previousVolume = this.audio.volume;
            this.setVolume(0);
        } else {
            this.setVolume(this.previousVolume);
        }
    }

    updateVolumeSlider() {
        this.volumeSlider.value = this.audio.volume * 100;
    }

    // Balanç
    setBalance(value) {
        if (this.panner) {
            this.panner.pan.value = value;
        }
    }

    // Progrés
    updateProgress() {
        const progress = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressBar.style.width = `${progress || 0}%`;
        this.timeCurrent.textContent = this.formatTime(this.audio.currentTime);
    }

    updateDuration() {
        this.timeTotal.textContent = this.formatTime(this.audio.duration);
    }

    seek(e) {
        const rect = this.progressContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.audio.currentTime = percent * this.audio.duration;
    }

    // Utilitats
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// Inicialitzar el reproductor quan el DOM estigui llest
document.addEventListener('DOMContentLoaded', () => {
    window.player = new TurntablePlayer();
});

// Registrar Service Worker per PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('Service Worker registrat:', registration.scope);
            })
            .catch((error) => {
                console.log('Error registrant Service Worker:', error);
            });
    });
}
