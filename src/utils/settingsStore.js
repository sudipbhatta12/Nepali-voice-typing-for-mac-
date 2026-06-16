const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const defaultSettings = {
  googleCredentialsPath: '',
  languageCode: 'ne-NP',
  shortcutToggle: 'Control+Option+Space',
  shortcutHide: 'Control+Option+H',
  alwaysOnTop: true,
  startAtLogin: true
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function normalizeSettings(settings) {
  const next = {
    ...defaultSettings,
    ...(settings || {})
  };

  next.googleCredentialsPath = String(next.googleCredentialsPath || '').trim();
  next.languageCode = String(next.languageCode || defaultSettings.languageCode).trim() || defaultSettings.languageCode;
  next.shortcutToggle = String(next.shortcutToggle || defaultSettings.shortcutToggle).trim();
  next.shortcutHide = String(next.shortcutHide || defaultSettings.shortcutHide).trim();
  next.alwaysOnTop = Boolean(next.alwaysOnTop);
  next.startAtLogin = Boolean(next.startAtLogin);

  return next;
}

function loadSettings() {
  const settingsPath = getSettingsPath();

  try {
    if (!fs.existsSync(settingsPath)) {
      return { ...defaultSettings };
    }

    const raw = fs.readFileSync(settingsPath, 'utf8');
    return normalizeSettings(JSON.parse(raw));
  } catch (_error) {
    return { ...defaultSettings };
  }
}

function saveSettings(settings) {
  const settingsPath = getSettingsPath();
  const normalized = normalizeSettings(settings);

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(normalized, null, 2));

  return normalized;
}

module.exports = {
  defaultSettings,
  getSettingsPath,
  loadSettings,
  saveSettings
};
