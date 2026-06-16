const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nepaliVoiceTyper', {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  openSettings: () => ipcRenderer.invoke('app:open-settings'),
  hideMainWindow: () => ipcRenderer.invoke('app:hide-main-window'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseCredentials: () => ipcRenderer.invoke('settings:choose-credentials'),
  transcribeAudio: (payload) => ipcRenderer.invoke('speech:transcribe', payload),
  startSpeechStream: (payload) => ipcRenderer.invoke('speech:stream-start', payload),
  sendSpeechChunk: (payload) => ipcRenderer.send('speech:stream-chunk', payload),
  stopSpeechStream: () => ipcRenderer.invoke('speech:stream-stop'),
  onShortcutToggleRecording: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('shortcut:toggle-recording', listener);
    return () => ipcRenderer.removeListener('shortcut:toggle-recording', listener);
  },
  onSpeechStreamResult: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('speech:stream-result', listener);
    return () => ipcRenderer.removeListener('speech:stream-result', listener);
  },
  onSpeechStreamWarning: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('speech:stream-warning', listener);
    return () => ipcRenderer.removeListener('speech:stream-warning', listener);
  },
  onSpeechStreamStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('speech:stream-status', listener);
    return () => ipcRenderer.removeListener('speech:stream-status', listener);
  },
  onAppWarning: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('app:warning', listener);
    return () => ipcRenderer.removeListener('app:warning', listener);
  },
  onSettingsUpdated: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('settings:updated', listener);
    return () => ipcRenderer.removeListener('settings:updated', listener);
  }
});
