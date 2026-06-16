const api = window.nepaliVoiceTyper;

const form = document.getElementById('settingsForm');
const credentialsPath = document.getElementById('credentialsPath');
const browseCredentials = document.getElementById('browseCredentials');
const languageCode = document.getElementById('languageCode');
const shortcutToggle = document.getElementById('shortcutToggle');
const shortcutHide = document.getElementById('shortcutHide');
const alwaysOnTop = document.getElementById('alwaysOnTop');
const startAtLogin = document.getElementById('startAtLogin');
const saveButton = document.getElementById('saveButton');
const saveStatus = document.getElementById('saveStatus');

function setSaveStatus(message, tone = 'normal') {
  saveStatus.textContent = message;
  saveStatus.dataset.tone = tone;
}

function applySettings(settings) {
  credentialsPath.value = settings.googleCredentialsPath || '';
  languageCode.value = settings.languageCode || 'ne-NP';
  shortcutToggle.value = settings.shortcutToggle || 'Control+Option+Space';
  shortcutHide.value = settings.shortcutHide || 'Control+Option+H';
  alwaysOnTop.checked = Boolean(settings.alwaysOnTop);
  startAtLogin.checked = Boolean(settings.startAtLogin);
}

function readForm() {
  return {
    googleCredentialsPath: credentialsPath.value.trim(),
    languageCode: languageCode.value,
    shortcutToggle: shortcutToggle.value.trim(),
    shortcutHide: shortcutHide.value.trim(),
    alwaysOnTop: alwaysOnTop.checked,
    startAtLogin: startAtLogin.checked
  };
}

async function initialize() {
  try {
    const settings = await api.loadSettings();
    applySettings(settings);
  } catch (error) {
    setSaveStatus(error.message || 'Could not load settings.', 'error');
  }

  browseCredentials.addEventListener('click', async () => {
    const filePath = await api.chooseCredentials();
    if (filePath) {
      credentialsPath.value = filePath;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    saveButton.disabled = true;
    setSaveStatus('Saving...');

    try {
      const saved = await api.saveSettings(readForm());
      applySettings(saved);
      setSaveStatus('Saved.', 'success');
    } catch (error) {
      setSaveStatus(error.message || 'Could not save settings.', 'error');
    } finally {
      saveButton.disabled = false;
    }
  });
}

initialize();
