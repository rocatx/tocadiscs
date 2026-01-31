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

        // Carátula
        this.labelArtwork = document.getElementById('labelArtwork');
        this.vinylLabel = document.getElementById('vinylLabel');

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
        this.currentFolderArtworkUrl = null; // Per memory leak prevention

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

        // Referències per event listeners (per poder fer cleanup)
        this.boundMouseMove = null;
        this.boundMouseUp = null;

        // Mode fosc
        this.btnTheme = document.getElementById('btnTheme');

        // Cerca
        this.playlistSearch = document.getElementById('playlistSearch');
        this.searchClear = document.getElementById('searchClear');
        this.searchQuery = '';

        // Gestió de playlists
        this.btnPlaylistMenu = document.getElementById('btnPlaylistMenu');
        this.playlistMenu = document.getElementById('playlistMenu');
        this.btnSavePlaylist = document.getElementById('btnSavePlaylist');
        this.btnLoadPlaylist = document.getElementById('btnLoadPlaylist');
        this.btnClearPlaylist = document.getElementById('btnClearPlaylist');

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.audio.volume = 0.8;
        this.updateVolumeSlider();
        this.initTheme();
        this.loadPlaylistFromStorage();
        this.loadEqPreference();
    }

    // Demanar permís per notificacions
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    // Mostrar notificació de pista
    showTrackNotification(track) {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        const options = {
            body: track.artist || 'Artista desconegut',
            icon: track.artwork || undefined,
            silent: true,
            tag: 'tocadiscs-track'  // Reemplaça notificacions anteriors
        };

        try {
            new Notification(track.title || 'Sense títol', options);
        } catch (e) {
            // Notificacions no disponibles
        }
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
        this.eqToggle.addEventListener('click', () => this.toggleEqCollapse());
        this.eqPreset.addEventListener('change', (e) => this.applyEqPreset(e.target.value));
        this.eqSliders.forEach((slider, index) => {
            slider.addEventListener('input', (e) => this.setEqBand(index, parseFloat(e.target.value)));
        });

        // Inicialitzar EQ expandit per defecte
        this.eqSection.classList.add('expanded');

        // Mode mini
        this.btnMiniMode.addEventListener('click', () => this.toggleMiniMode());
        this.setupMiniModeDrag();

        // Mode fosc
        this.btnTheme.addEventListener('click', () => this.toggleTheme());

        // Cerca
        this.playlistSearch.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderPlaylist();
        });
        this.playlistSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearSearch();
            }
        });
        this.searchClear.addEventListener('click', () => this.clearSearch());

        // Gestió de playlists
        this.btnPlaylistMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            this.playlistMenu.classList.toggle('open');
        });
        document.addEventListener('click', () => {
            this.playlistMenu.classList.remove('open');
        });
        this.btnSavePlaylist.addEventListener('click', () => this.saveNamedPlaylist());
        this.btnLoadPlaylist.addEventListener('click', () => this.showLoadPlaylistDialog());
        this.btnClearPlaylist.addEventListener('click', () => this.clearCurrentPlaylist());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.audio.currentTime -= 5;
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.audio.currentTime += 5;
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.setVolume(Math.min(1, this.audio.volume + 0.1));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.setVolume(Math.max(0, this.audio.volume - 0.1));
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
                case 'Digit7':
                    // Presets d'equalitzador (1-7)
                    const presetIndex = parseInt(e.code.replace('Digit', '')) - 1;
                    const presetNames = ['flat', 'rock', 'pop', 'jazz', 'classical', 'bass', 'vocal'];
                    if (presetNames[presetIndex]) {
                        this.applyEqPreset(presetNames[presetIndex]);
                        this.eqPreset.value = presetNames[presetIndex];
                    }
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

    // Alternar collapse/expand de l'equalitzador
    toggleEqCollapse() {
        this.eqSection.classList.toggle('expanded');

        // Guardar preferència
        const isExpanded = this.eqSection.classList.contains('expanded');
        localStorage.setItem('tocadiscs-eq-expanded', isExpanded);
    }

    // Caregar preferència d'EQ al iniciar
    loadEqPreference() {
        const isExpanded = localStorage.getItem('tocadiscs-eq-expanded');
        if (isExpanded === 'false') {
            this.eqSection.classList.remove('expanded');
        }
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

        // Collapsar EQ en mode mini
        if (this.isMiniMode) {
            this.eqSection.classList.remove('expanded');
        }

        // Comunicar amb Tauri si està disponible
        console.log('__TAURI__ disponible:', !!window.__TAURI__);
        if (window.__TAURI__) {
            try {
                console.log('Intentant accedir a window API...');
                const { getCurrentWindow, LogicalSize, LogicalPosition } = window.__TAURI__.window;
                console.log('getCurrentWindow:', getCurrentWindow);
                console.log('LogicalSize:', LogicalSize);
                const appWindow = getCurrentWindow();
                console.log('appWindow:', appWindow);

                if (this.isMiniMode) {
                    console.log('Entrant en mode mini...');
                    // Guardar mida original i posició
                    const size = await appWindow.innerSize();
                    const position = await appWindow.outerPosition();
                    const scaleFactor = await appWindow.scaleFactor();
                    // Convertir a coordenades lògiques
                    this.originalSize = {
                        width: size.width / scaleFactor,
                        height: size.height / scaleFactor
                    };
                    this.originalPosition = {
                        x: position.x / scaleFactor,
                        y: position.y / scaleFactor
                    };
                    console.log('Mida original:', this.originalSize, 'Posició:', this.originalPosition);

                    // Canviar a mode mini
                    console.log('setDecorations(false)...');
                    await appWindow.setDecorations(false);
                    console.log('setMinSize...');
                    await appWindow.setMinSize(new LogicalSize(340, 160));
                    console.log('setSize...');
                    await appWindow.setSize(new LogicalSize(340, 160));
                    console.log('setAlwaysOnTop...');
                    await appWindow.setAlwaysOnTop(true);
                    console.log('setResizable...');
                    await appWindow.setResizable(false);
                    console.log('Mode mini activat!');
                } else {
                    console.log('Sortint de mode mini...');
                    // Restaurar mida original
                    await appWindow.setDecorations(true);
                    await appWindow.setAlwaysOnTop(false);
                    await appWindow.setResizable(true);
                    await appWindow.setMinSize(new LogicalSize(400, 600));
                    if (this.originalSize) {
                        await appWindow.setSize(new LogicalSize(this.originalSize.width, this.originalSize.height));
                    } else {
                        await appWindow.setSize(new LogicalSize(1000, 800));
                    }
                    // Restaurar posició original
                    if (this.originalPosition) {
                        await appWindow.setPosition(new LogicalPosition(this.originalPosition.x, this.originalPosition.y));
                    }
                    console.log('Mode normal restaurat!');
                }
            } catch (e) {
                console.error('Error Tauri:', e);
            }
        } else {
            console.log('Tauri no disponible, mode navegador');
        }

        // Netejar sempre els estils inline de posició
        this.container.style.left = '';
        this.container.style.top = '';
        this.container.style.right = '';
        this.container.style.bottom = '';
        this.container.style.transform = '';
    }

    setupMiniModeDrag() {
        // Mousedown al container
        this.container.addEventListener('mousedown', async (e) => {
            if (!this.isMiniMode) return;
            if (e.target.closest('button, input, select')) return;

            // Si estem a Tauri, usar el drag natiu de la finestra
            if (window.__TAURI__) {
                try {
                    const { getCurrentWindow } = window.__TAURI__.window;
                    await getCurrentWindow().startDragging();
                    return; // El drag natiu s'encarrega de tot
                } catch (err) {
                    // Si falla, usar el drag del navegador
                }
            }

            // Drag del navegador (fallback)
            this.isDragging = true;
            this.container.classList.add('dragging');

            // Eliminar transform per poder usar left/top absoluts
            const rect = this.container.getBoundingClientRect();
            this.container.style.transform = 'none';
            this.container.style.left = `${rect.left}px`;
            this.container.style.top = `${rect.top}px`;

            this.dragOffset.x = e.clientX - rect.left;
            this.dragOffset.y = e.clientY - rect.top;
        });

        // Crear funcions bound per poder fer cleanup
        this.boundMouseMove = (e) => {
            if (!this.isDragging) return;

            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;

            // Limitar als marges de la pantalla
            const maxX = window.innerWidth - this.container.offsetWidth;
            const maxY = window.innerHeight - this.container.offsetHeight;

            this.container.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
            this.container.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
        };

        this.boundMouseUp = () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.container.classList.remove('dragging');

                // Guardar posició a localStorage
                const rect = this.container.getBoundingClientRect();
                localStorage.setItem('tocadiscs-minimode-pos', JSON.stringify({
                    x: rect.left,
                    y: rect.top
                }));
            }
        };

        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
    }

    // Netejar event listeners del mini mode (evitar memory leaks)
    cleanupMiniModeDrag() {
        if (this.boundMouseMove) {
            document.removeEventListener('mousemove', this.boundMouseMove);
        }
        if (this.boundMouseUp) {
            document.removeEventListener('mouseup', this.boundMouseUp);
        }
        this.isDragging = false;
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
                // L'altura màxima és 150px per ocupar tot l'espai
                const height = Math.max(4, (average / 255) * 150);
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
        const fileArray = Array.from(files);

        // Buscar imatge de carpeta (cover.jpg, folder.jpg, etc.)
        const imageNames = ['cover', 'folder', 'artwork', 'front', 'album'];
        const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
        let folderArtwork = null;

        const imageFile = fileArray.find(file => {
            const name = file.name.toLowerCase();
            const isImage = file.type.startsWith('image/') || imageExts.some(ext => name.endsWith(ext));
            if (!isImage) return false;
            // Prioritzar noms comuns de covers
            const baseName = name.replace(/\.[^/.]+$/, '');
            return imageNames.includes(baseName);
        }) || fileArray.find(file => {
            // Si no trobem un nom comú, agafar qualsevol imatge
            const name = file.name.toLowerCase();
            return file.type.startsWith('image/') || imageExts.some(ext => name.endsWith(ext));
        });

        if (imageFile) {
            // Revocar URL anterior per evitar memory leak
            if (this.currentFolderArtworkUrl) {
                URL.revokeObjectURL(this.currentFolderArtworkUrl);
            }
            folderArtwork = URL.createObjectURL(imageFile);
            this.currentFolderArtworkUrl = folderArtwork;
        }

        fileArray.forEach(file => {
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
                const track = {
                    title: file.name.replace(/\.[^/.]+$/, ''),
                    artist: 'Fitxer local',
                    url: url,
                    isLocal: true,
                    artwork: folderArtwork,  // Usar imatge de carpeta si existeix
                    file: file  // Guardem referència per extreure artwork
                };

                // Intentar extreure metadades amb jsmediatags
                if (window.jsmediatags) {
                    window.jsmediatags.read(file, {
                        onSuccess: (tag) => {
                            if (tag.tags) {
                                if (tag.tags.title) track.title = tag.tags.title;
                                if (tag.tags.artist) track.artist = tag.tags.artist;

                                // Extreure artwork
                                if (tag.tags.picture && tag.tags.picture.data) {
                                    const { data, format } = tag.tags.picture;
                                    const base64 = this.arrayBufferToBase64(data);
                                    // Normalitzar el format MIME
                                    let mimeType = format || 'jpeg';
                                    if (!mimeType.startsWith('image/')) {
                                        mimeType = 'image/' + mimeType;
                                    }
                                    // Corregir 'image/jpg' a 'image/jpeg' (MIME correcte)
                                    if (mimeType === 'image/jpg') {
                                        mimeType = 'image/jpeg';
                                    }
                                    track.artwork = `data:${mimeType};base64,${base64}`;
                                }

                                this.renderPlaylist();

                                // Si és la pista actual, actualitzar la carátula
                                if (this.playlist[this.currentIndex] === track) {
                                    this.updateArtwork(track.artwork);
                                    this.updateTrackInfo(track);
                                }
                            }
                        },
                        onError: () => {
                            // No passa res si no es poden llegir les metadades
                        }
                    });
                }

                this.addToPlaylist(track);
            }
        });
    }

    // Convertir array de bytes a base64
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Actualitzar carátula del vinil
    updateArtwork(artworkUrl) {
        if (artworkUrl) {
            this.labelArtwork.src = artworkUrl;
            this.labelArtwork.classList.add('visible');
            this.vinylLabel.classList.add('has-artwork');
        } else {
            this.labelArtwork.src = '';
            this.labelArtwork.classList.remove('visible');
            this.vinylLabel.classList.remove('has-artwork');
        }
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
        this.savePlaylistToStorage();

        // Si és la primera cançó, carregar-la
        if (this.playlist.length === 1) {
            this.loadTrack(0);
        }
    }

    // Renderitzar playlist
    renderPlaylist() {
        // Filtrar pistes segons la cerca
        const filteredTracks = this.playlist.map((track, index) => ({ track, index }))
            .filter(({ track }) => {
                if (!this.searchQuery) return true;
                return track.title.toLowerCase().includes(this.searchQuery) ||
                       track.artist.toLowerCase().includes(this.searchQuery);
            });

        this.playlistItems.innerHTML = filteredTracks.map(({ track, index }) => `
            <li class="playlist-item ${index === this.currentIndex ? 'active' : ''}" data-index="${index}">
                <span class="item-number">${index + 1}</span>
                <div class="item-info">
                    <div class="item-title">${this.highlightSearch(this.escapeHtml(track.title))}</div>
                    <div class="item-artist">${this.highlightSearch(this.escapeHtml(track.artist))}</div>
                </div>
                <div class="item-actions">
                    <button class="item-move item-move-up" data-index="${index}" title="Pujar" ${index === 0 ? 'disabled' : ''}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
                        </svg>
                    </button>
                    <button class="item-move item-move-down" data-index="${index}" title="Baixar" ${index === this.playlist.length - 1 ? 'disabled' : ''}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                        </svg>
                    </button>
                    <button class="item-remove" data-index="${index}" title="Eliminar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
            </li>
        `).join('');

        // Event listeners per la playlist
        this.playlistItems.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.item-actions')) {
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

        this.playlistItems.querySelectorAll('.item-move-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.moveTrackUp(index);
            });
        });

        this.playlistItems.querySelectorAll('.item-move-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.moveTrackDown(index);
            });
        });

        // Actualitzar comptador
        const countEl = document.getElementById('playlistCount');
        if (countEl) {
            countEl.textContent = `${this.playlist.length} piste${this.playlist.length !== 1 ? 's' : ''}`;
        }
    }

    // Moure pista amunt
    moveTrackUp(index) {
        if (index <= 0) return;

        // Intercanviar posicions
        [this.playlist[index], this.playlist[index - 1]] = [this.playlist[index - 1], this.playlist[index]];

        // Ajustar currentIndex si és necessari
        if (this.currentIndex === index) {
            this.currentIndex = index - 1;
        } else if (this.currentIndex === index - 1) {
            this.currentIndex = index;
        }

        this.renderPlaylist();
        this.savePlaylistToStorage();
    }

    // Moure pista avall
    moveTrackDown(index) {
        if (index >= this.playlist.length - 1) return;

        // Intercanviar posicions
        [this.playlist[index], this.playlist[index + 1]] = [this.playlist[index + 1], this.playlist[index]];

        // Ajustar currentIndex si és necessari
        if (this.currentIndex === index) {
            this.currentIndex = index + 1;
        } else if (this.currentIndex === index + 1) {
            this.currentIndex = index;
        }

        this.renderPlaylist();
        this.savePlaylistToStorage();
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
        this.savePlaylistToStorage();
    }

    // Carregar pista
    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        const previousIndex = this.currentIndex;
        this.currentIndex = index;
        const track = this.playlist[index];
        this.audio.src = track.url;
        this.updateTrackInfo(track);
        this.updateArtwork(track.artwork || null);
        this.renderPlaylist();

        // Mostrar notificació si la pista ha canviat i estem reproduint
        if (previousIndex !== index && this.isPlaying) {
            this.showTrackNotification(track);
        }

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
                    // Equalitzador no disponible
                }
            }
            // Reprendre context d'àudio si està suspès
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }).catch(err => {
            // Error reproduint
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

    // Escapar HTML per evitar XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Ressaltar text de cerca (sense XSS)
    highlightSearch(text) {
        if (!this.searchQuery) return text;
        const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) => {
            if (i % 2 === 1) {
                return `<mark>${this.escapeHtml(part)}</mark>`;
            }
            return this.escapeHtml(part);
        }).join('');
    }

    // Escapar caràcters especials de regex
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Esborrar cerca
    clearSearch() {
        this.searchQuery = '';
        this.playlistSearch.value = '';
        this.renderPlaylist();
    }

    // Guardar playlist amb nom
    saveNamedPlaylist() {
        this.playlistMenu.classList.remove('open');

        const name = prompt('Nom de la playlist:');
        if (!name || !name.trim()) return;

        if (this.playlist.length === 0) {
            alert('La playlist està buida. Afegeix pistes primer.');
            return;
        }

        // Guardem TOTES les pistes (locals + URL)
        const tracksToSave = this.playlist.map(track => ({
            title: track.title,
            artist: track.artist,
            url: track.url,
            isLocal: track.isLocal,
            artwork: track.artwork
        }));

        // Obtenir playlists guardades
        const savedPlaylists = JSON.parse(localStorage.getItem('tocadiscs-saved-playlists') || '{}');

        if (savedPlaylists[name.trim()]) {
            const overwrite = confirm(`La playlist "${name.trim()}" ja existeix. Vols sobrescriure-la?`);
            if (!overwrite) return;
        }

        savedPlaylists[name.trim()] = {
            tracks: tracksToSave,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem('tocadiscs-saved-playlists', JSON.stringify(savedPlaylists));

        const localCount = tracksToSave.filter(t => t.isLocal).length;
        const urlCount = tracksToSave.filter(t => !t.isLocal).length;
        let message = `Playlist "${name.trim()}" guardada amb ${tracksToSave.length} pistes.`;
        if (localCount > 0) {
            message += `\n\n📌 Nota: ${localCount} pista${localCount > 1 ? 's' : ''} local${localCount > 1 ? 's' : ''} (es carregarà la metadada, no els fitxers)`;
        }
        alert(message);
    }

    // Mostrar diàleg per carregar playlist
    showLoadPlaylistDialog() {
        this.playlistMenu.classList.remove('open');

        const savedPlaylists = JSON.parse(localStorage.getItem('tocadiscs-saved-playlists') || '{}');
        const playlistNames = Object.keys(savedPlaylists);

        if (playlistNames.length === 0) {
            alert('No hi ha playlists guardades.');
            return;
        }

        const options = playlistNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
        const choice = prompt(`Selecciona una playlist (número):\n\n${options}`);

        if (!choice) return;

        const index = parseInt(choice) - 1;
        if (isNaN(index) || index < 0 || index >= playlistNames.length) {
            alert('Opció no vàlida.');
            return;
        }

        const selectedName = playlistNames[index];
        const playlistData = savedPlaylists[selectedName];

        // Afegir pistes a la llista actual
        const localTracks = [];
        playlistData.tracks.forEach(track => {
            if (track.isLocal) {
                // Les pistes locals només es carreguen com a metadada
                localTracks.push(track);
            }
            this.playlist.push(track);
        });

        this.renderPlaylist();
        this.savePlaylistToStorage();

        if (this.playlist.length > 0 && this.currentIndex === -1) {
            this.loadTrack(0);
        }

        let message = `Playlist "${selectedName}" carregada amb ${playlistData.tracks.length} pistes.`;
        if (localTracks.length > 0) {
            message += `\n\n⚠️ ${localTracks.length} pista${localTracks.length > 1 ? 's' : ''} local${localTracks.length > 1 ? 's' : ''} (sense arxius de so)\nCarrega els fitxers originals per reproduir-les.`;
        }
        alert(message);
    }

    // Esborrar llista actual
    clearCurrentPlaylist() {
        this.playlistMenu.classList.remove('open');

        if (this.playlist.length === 0) {
            alert('La llista ja està buida');
            return;
        }

        const confirmed = confirm(`Segur que vols esborrar tota la llista? (${this.playlist.length} pistes)`);
        if (!confirmed) return;

        // Alliberar objectURLs
        this.playlist.forEach(track => {
            if (track.isLocal && track.url) {
                URL.revokeObjectURL(track.url);
            }
        });

        this.playlist = [];
        this.currentIndex = -1;
        this.stop();
        this.updateTrackInfo(null);
        this.updateArtwork(null);
        this.renderPlaylist();
        this.savePlaylistToStorage();

        alert('Llista esborrada correctament');
    }

    // Inicialitzar tema (detectar preferència guardada o del sistema)
    initTheme() {
        const savedTheme = localStorage.getItem('tocadiscs-theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
        // Si no hi ha tema guardat, el CSS s'encarrega de detectar prefers-color-scheme
    }

    // Alternar entre mode clar i fosc
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        let newTheme;
        if (currentTheme === 'dark') {
            newTheme = 'light';
        } else if (currentTheme === 'light') {
            newTheme = 'dark';
        } else {
            // No hi ha tema explícit, usa l'oposat del sistema
            newTheme = prefersDark ? 'light' : 'dark';
        }

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('tocadiscs-theme', newTheme);
    }

    // Guardar playlist a localStorage
    savePlaylistToStorage() {
        // Només guardem les pistes d'URL (les locals no es poden persistir)
        const persistableTracks = this.playlist
            .filter(track => !track.isLocal)
            .map(track => ({
                title: track.title,
                artist: track.artist,
                url: track.url,
                isLocal: false
            }));

        const state = {
            tracks: persistableTracks,
            currentIndex: this.currentIndex,
            volume: this.audio.volume,
            repeatMode: this.repeatMode,
            isShuffle: this.isShuffle
        };

        localStorage.setItem('tocadiscs-playlist', JSON.stringify(state));
    }

    // Carregar playlist des de localStorage
    loadPlaylistFromStorage() {
        const saved = localStorage.getItem('tocadiscs-playlist');
        if (!saved) return;

        try {
            const state = JSON.parse(saved);

            // Restaurar pistes
            if (state.tracks && state.tracks.length > 0) {
                state.tracks.forEach(track => {
                    this.playlist.push(track);
                });
                this.renderPlaylist();

                // Restaurar índex si és vàlid
                if (state.currentIndex >= 0 && state.currentIndex < this.playlist.length) {
                    this.loadTrack(state.currentIndex);
                } else if (this.playlist.length > 0) {
                    this.loadTrack(0);
                }
            }

            // Restaurar volum
            if (typeof state.volume === 'number') {
                this.setVolume(state.volume);
            }

            // Restaurar repeat mode
            if (typeof state.repeatMode === 'number') {
                this.repeatMode = state.repeatMode;
                this.btnRepeat.classList.toggle('active', this.repeatMode > 0);
                if (this.repeatMode === 2) {
                    this.btnRepeat.innerHTML = `
                        <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                        <span style="position: absolute; font-size: 8px; font-weight: bold; bottom: 8px; right: 8px;">1</span>
                    `;
                }
            }

            // Restaurar shuffle
            if (state.isShuffle) {
                this.isShuffle = true;
                this.btnShuffle.classList.add('active');
            }
        } catch (e) {
            // Error parsejant, ignorar
        }
    }

    // Esborrar playlist guardada
    clearSavedPlaylist() {
        localStorage.removeItem('tocadiscs-playlist');
    }
}

// Inicialitzar el reproductor quan el DOM estigui llest
document.addEventListener('DOMContentLoaded', () => {
    window.player = new TurntablePlayer();
});

// Registrar Service Worker per PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {
            // Service Worker no disponible o error de registre
        });
    });
}
