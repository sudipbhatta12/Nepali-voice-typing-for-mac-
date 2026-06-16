const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { createStreamingRecognizer, transcribeAudio } = require('./src/services/googleSpeech');
const { pasteText } = require('./src/utils/pasteText');
const {
  defaultSettings,
  loadSettings,
  saveSettings
} = require('./src/utils/settingsStore');

let mainWindow;
let settingsWindow;
let tray;
let currentShortcutWarning = '';
const streamingSessions = new Map();

function isMac() {
  return process.platform === 'darwin';
}

function toElectronAccelerator(shortcut) {
  return String(shortcut || '')
    .replace(/option/gi, 'Alt')
    .replace(/\s*\+\s*/g, '+')
    .trim();
}

function createMainWindow() {
  const settings = loadSettings();

  mainWindow = new BrowserWindow({
    width: 220,
    height: 110,
    minWidth: 220,
    minHeight: 110,
    maxWidth: 280,
    maxHeight: 140,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    focusable: false,
    show: false,
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    applyMainWindowSettings(settings);
    mainWindow.show();
    sendShortcutWarning();
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 690,
    minWidth: 500,
    minHeight: 620,
    title: 'Nepali Voice Typer Settings',
    backgroundColor: '#111317',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTray() {
  if (tray) {
    return;
  }

  const trayIcon = nativeImage
    .createFromPath(path.join(__dirname, 'src', 'assets', 'icon.png'))
    .resize({ width: 18, height: 18 });

  if (isMac()) {
    trayIcon.setTemplateImage(true);
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Nepali Voice Typer');
  tray.on('click', () => {
    toggleMainWindow();
  });
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const isVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
  const menu = Menu.buildFromTemplate([
    {
      label: isVisible ? 'Hide Floating Mic' : 'Show Floating Mic',
      click: () => toggleMainWindow()
    },
    {
      label: 'Start/Stop Listening',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (!mainWindow.isVisible()) {
            mainWindow.show();
          }
          mainWindow.webContents.send('shortcut:toggle-recording');
        }
      }
    },
    {
      label: 'Settings',
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit Nepali Voice Typer',
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(menu);
}

function applyMainWindowSettings(settings) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const shouldStayOnTop = Boolean(settings.alwaysOnTop);
  mainWindow.setAlwaysOnTop(shouldStayOnTop, isMac() ? 'floating' : 'normal');

  if (isMac()) {
    mainWindow.setVisibleOnAllWorkspaces(shouldStayOnTop, {
      visibleOnFullScreen: true
    });
  }
}

function applyLoginItemSettings(settings) {
  if (!isMac() || !app.isPackaged) {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: Boolean(settings.startAtLogin),
    openAsHidden: false
  });
}

function registerShortcuts(settings) {
  globalShortcut.unregisterAll();
  currentShortcutWarning = '';

  const toggleRecording = toElectronAccelerator(settings.shortcutToggle);
  const toggleWindow = toElectronAccelerator(settings.shortcutHide);

  if (toggleRecording) {
    const ok = globalShortcut.register(toggleRecording, () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) {
          mainWindow.show();
        }
        mainWindow.webContents.send('shortcut:toggle-recording');
      }
    });

    if (!ok) {
      currentShortcutWarning = `Could not register shortcut ${settings.shortcutToggle}. Try a different shortcut in Settings.`;
    }
  }

  if (toggleWindow) {
    const ok = globalShortcut.register(toggleWindow, () => {
      toggleMainWindow();
    });

    if (!ok) {
      currentShortcutWarning = `Could not register shortcut ${settings.shortcutHide}. Try a different shortcut in Settings.`;
    }
  }

  sendShortcutWarning();
}

function sendShortcutWarning() {
  if (currentShortcutWarning && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:warning', currentShortcutWarning);
  }
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }

  updateTrayMenu();
}

function getErrorMessage(error) {
  if (!error) {
    return 'Something went wrong.';
  }

  if (typeof error === 'string') {
    return error;
  }

  return error.userMessage || error.message || 'Something went wrong.';
}

function withTrailingSpace(text) {
  const cleanText = String(text || '').trim();
  return cleanText ? `${cleanText} ` : '';
}

function stopStreamingSession(webContentsId) {
  const session = streamingSessions.get(webContentsId);

  if (!session) {
    return;
  }

  streamingSessions.delete(webContentsId);
  session.stream.end();
}

function destroyStreamingSession(webContentsId) {
  const session = streamingSessions.get(webContentsId);

  if (!session) {
    return;
  }

  streamingSessions.delete(webContentsId);
  session.stream.destroy();
}

// TODO: Detect the active macOS full-screen app and hide this window automatically.
// TODO: Explore offline speech recognition and direct native macOS Accessibility text insertion.
// TODO: Add advanced interim-text replacement so draft words can appear directly in the target app.

ipcMain.handle('app:get-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  isMac: isMac(),
  hasGoogleCredentials: Boolean(loadSettings().googleCredentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS),
  shortcutWarning: currentShortcutWarning
}));

ipcMain.handle('app:open-settings', () => {
  createSettingsWindow();
  return true;
});

ipcMain.handle('app:hide-main-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
  return true;
});

ipcMain.handle('settings:load', () => loadSettings());

ipcMain.handle('settings:choose-credentials', async () => {
  const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
    title: 'Choose Google service account JSON',
    properties: ['openFile'],
    filters: [
      { name: 'JSON files', extensions: ['json'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return '';
  }

  return result.filePaths[0];
});

ipcMain.handle('settings:save', (_event, nextSettings) => {
  const saved = saveSettings(nextSettings);
  applyMainWindowSettings(saved);
  applyLoginItemSettings(saved);
  registerShortcuts(saved);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:updated', saved);
  }

  return saved;
});

ipcMain.handle('speech:transcribe', async (_event, payload) => {
  try {
    const settings = loadSettings();
    const audioBase64 = payload && payload.audioBase64;

    if (!audioBase64) {
      return {
        ok: false,
        message: 'No audio was recorded. Try again and speak after the mic turns blue.'
      };
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const text = await transcribeAudio({
      audioBuffer,
      mimeType: payload.mimeType,
      languageCode: settings.languageCode || defaultSettings.languageCode,
      credentialsPath: settings.googleCredentialsPath,
      sampleRateHertz: payload.sampleRateHertz,
      durationMs: payload.durationMs
    });

    try {
      const pasteResult = await pasteText(text);

      return {
        ok: true,
        text,
        paste: pasteResult
      };
    } catch (pasteError) {
      return {
        ok: true,
        text,
        warning: getErrorMessage(pasteError),
        paste: {
          pasted: false,
          message: getErrorMessage(pasteError)
        }
      };
    }
  } catch (error) {
    return {
      ok: false,
      message: getErrorMessage(error)
    };
  }
});

ipcMain.handle('speech:stream-start', (event, payload) => {
  const webContentsId = event.sender.id;

  try {
    destroyStreamingSession(webContentsId);

    const settings = loadSettings();
    const sampleRateHertz = Number(payload && payload.sampleRateHertz) || 16000;
    let pasteQueue = Promise.resolve();

    const stream = createStreamingRecognizer({
      languageCode: settings.languageCode || defaultSettings.languageCode,
      credentialsPath: settings.googleCredentialsPath,
      sampleRateHertz,
      onResult: (result) => {
        event.sender.send('speech:stream-result', result);

        if (!result.isFinal || !result.text) {
          return;
        }

        pasteQueue = pasteQueue
          .then(() => pasteText(withTrailingSpace(result.text)))
          .then((pasteResult) => {
            event.sender.send('speech:stream-status', {
              type: 'paste',
              message: pasteResult.message,
              pasted: Boolean(pasteResult.pasted)
            });
          })
          .catch((error) => {
            event.sender.send('speech:stream-warning', getErrorMessage(error));
          });
      },
      onError: (error) => {
        streamingSessions.delete(webContentsId);
        event.sender.send('speech:stream-warning', getErrorMessage(error));
        event.sender.send('speech:stream-status', {
          type: 'ended',
          message: 'Streaming stopped.'
        });
      },
      onEnd: () => {
        streamingSessions.delete(webContentsId);
        event.sender.send('speech:stream-status', {
          type: 'ended',
          message: 'Streaming stopped.'
        });
      }
    });

    streamingSessions.set(webContentsId, {
      stream
    });

    return {
      ok: true,
      sampleRateHertz
    };
  } catch (error) {
    return {
      ok: false,
      message: getErrorMessage(error)
    };
  }
});

ipcMain.on('speech:stream-chunk', (event, payload) => {
  const session = streamingSessions.get(event.sender.id);

  if (!session || !payload || !payload.audioBase64) {
    return;
  }

  session.stream.write(Buffer.from(payload.audioBase64, 'base64'));
});

ipcMain.handle('speech:stream-stop', (event) => {
  stopStreamingSession(event.sender.id);
  return true;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const settings = loadSettings();
  createMainWindow();
  createTray();
  applyLoginItemSettings(settings);
  registerShortcuts(settings);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
});

app.on('will-quit', () => {
  for (const webContentsId of streamingSessions.keys()) {
    destroyStreamingSession(webContentsId);
  }

  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (!isMac()) {
    app.quit();
  }
});
