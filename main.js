const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 400,
        minHeight: 600,
        title: 'Tocadiscs',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 15, y: 15 }
    });

    mainWindow.loadFile('index.html');

    // Crear menú personalitzat
    const template = [
        {
            label: 'Tocadiscs',
            submenu: [
                { role: 'about', label: 'Sobre Tocadiscs' },
                { type: 'separator' },
                { role: 'hide', label: 'Amagar' },
                { role: 'hideOthers', label: 'Amagar altres' },
                { role: 'unhide', label: 'Mostrar tot' },
                { type: 'separator' },
                { role: 'quit', label: 'Sortir' }
            ]
        },
        {
            label: 'Editar',
            submenu: [
                { role: 'undo', label: 'Desfer' },
                { role: 'redo', label: 'Refer' },
                { type: 'separator' },
                { role: 'cut', label: 'Tallar' },
                { role: 'copy', label: 'Copiar' },
                { role: 'paste', label: 'Enganxar' },
                { role: 'selectAll', label: 'Seleccionar tot' }
            ]
        },
        {
            label: 'Visualització',
            submenu: [
                { role: 'reload', label: 'Recarregar' },
                { role: 'toggleDevTools', label: 'Eines de desenvolupador' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Mida original' },
                { role: 'zoomIn', label: 'Ampliar' },
                { role: 'zoomOut', label: 'Reduir' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Pantalla completa' }
            ]
        },
        {
            label: 'Finestra',
            submenu: [
                { role: 'minimize', label: 'Minimitzar' },
                { role: 'zoom', label: 'Zoom' },
                { type: 'separator' },
                { role: 'front', label: 'Portar al davant' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
