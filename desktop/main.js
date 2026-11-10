// Neon Sprawl desktop shell (Electron). Serves the bundled game from a private app://
// origin so saves (localStorage) live in the user's app-data folder and persist.
const { app, BrowserWindow, protocol, net, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const GAME_DIR = path.join(__dirname, 'game');
const ORIGIN = 'app://neon-sprawl';

// Laptops with two GPUs: prefer the faster one.
app.commandLine.appendSwitch('force_high_performance_gpu');
// Some laptop GPU drivers are on Chromium's blocklist; the game needs WebGL, so try anyway.
app.commandLine.appendSwitch('ignore-gpu-blocklist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  function serveGame() {
    protocol.handle('app', (req) => {
      const { pathname } = new URL(req.url);
      const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
      const file = path.normalize(path.join(GAME_DIR, rel));
      if (!file.startsWith(GAME_DIR) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
  }

  function createWindow() {
    win = new BrowserWindow({
      width: 1600,
      height: 900,
      minWidth: 1024,
      minHeight: 640,
      title: 'Neon Sprawl',
      backgroundColor: '#05030a',
      icon: path.join(__dirname, 'icon.png'),
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: true,
      },
    });
    win.once('ready-to-show', () => { win.maximize(); win.show(); });
    win.loadURL(ORIGIN + '/index.html');

    // F11 / Alt+Enter: fullscreen. Ctrl+Shift+I: developer tools (for bug reports).
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
        win.setFullScreen(!win.isFullScreen());
        e.preventDefault();
      } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        win.webContents.toggleDevTools();
        e.preventDefault();
      }
    });

    // Never navigate away from the game; send any web links to the real browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
    });

    // "Export save file" -> native Save As dialog, defaulting to Documents.
    win.webContents.session.on('will-download', (e, item) => {
      item.setSaveDialogOptions({
        title: 'Export Neon Sprawl save',
        defaultPath: path.join(app.getPath('documents'), item.getFilename()),
        filters: [{ name: 'Neon Sprawl save', extensions: ['json'] }],
      });
    });

    win.webContents.on('render-process-gone', (e, details) => {
      if (details.reason === 'clean-exit') return;
      const choice = dialog.showMessageBoxSync(win, {
        type: 'error', title: 'Neon Sprawl', buttons: ['Restart', 'Quit'],
        message: 'The game stopped unexpectedly.',
        detail: `Reason: ${details.reason}. Your last save is safe. If this keeps happening, choose Low graphics in Settings.`,
      });
      if (choice === 0) win.reload(); else app.quit();
    });

    win.on('closed', () => { win = null; });
  }

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    serveGame();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
