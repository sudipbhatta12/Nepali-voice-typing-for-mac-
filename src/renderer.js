const api = window.nepaliVoiceTyper;

const micButton = document.getElementById('micButton');
const settingsButton = document.getElementById('settingsButton');
const hideButton = document.getElementById('hideButton');
const statusText = document.getElementById('statusText');

let activeStream = null;
let audioContext = null;
let audioSource = null;
let audioProcessor = null;
let isRecording = false;
let isBusy = false;
let isMacRuntime = false;
let stoppedBySilence = false;
let silenceStartedAt = 0;
let lastFinalText = '';

const targetSampleRate = 16000;
const silenceLimitMs = 3 * 60 * 1000;
const silenceThreshold = 0.012;

function setStatus(message, tone = 'normal') {
  statusText.textContent = message;
  statusText.title = message;
  statusText.dataset.tone = tone;
}

function getTextPreview(text) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();

  if (cleanText.length <= 28) {
    return cleanText;
  }

  return `${cleanText.slice(0, 28)}...`;
}

function setRecordingUi(recording) {
  isRecording = recording;
  micButton.classList.toggle('is-recording', recording);
  micButton.setAttribute('aria-label', recording ? 'Stop listening' : 'Start listening');
  micButton.title = recording ? 'Stop listening' : 'Start listening';
}

function setBusy(busy) {
  isBusy = busy;
  micButton.disabled = busy;
  settingsButton.disabled = busy;
}

function stopStream() {
  if (!activeStream) {
    return;
  }

  for (const track of activeStream.getTracks()) {
    track.stop();
  }

  activeStream = null;
}

function cleanupAudioPipeline() {
  if (audioProcessor) {
    audioProcessor.disconnect();
    audioProcessor.onaudioprocess = null;
  }

  if (audioSource) {
    audioSource.disconnect();
  }

  audioProcessor = null;
  audioSource = null;

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
  }

  audioContext = null;
  stopStream();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return window.btoa(binary);
}

function downsampleBuffer(inputBuffer, inputSampleRate, outputSampleRate) {
  if (outputSampleRate === inputSampleRate) {
    return inputBuffer;
  }

  if (outputSampleRate > inputSampleRate) {
    throw new Error('Output sample rate must be lower than input sample rate.');
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(inputBuffer.length / sampleRateRatio);
  const outputBuffer = new Float32Array(outputLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < outputLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accumulator = 0;
    let count = 0;

    for (let index = offsetBuffer; index < nextOffsetBuffer && index < inputBuffer.length; index += 1) {
      accumulator += inputBuffer[index];
      count += 1;
    }

    outputBuffer[offsetResult] = accumulator / count;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return outputBuffer;
}

function convertFloatTo16BitPcm(inputBuffer) {
  const outputBuffer = new ArrayBuffer(inputBuffer.length * 2);
  const view = new DataView(outputBuffer);

  for (let index = 0; index < inputBuffer.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, inputBuffer[index]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(index * 2, intSample, true);
  }

  return outputBuffer;
}

function getAudioRms(inputBuffer) {
  let sum = 0;

  for (const sample of inputBuffer) {
    sum += sample * sample;
  }

  return Math.sqrt(sum / inputBuffer.length);
}

function watchSilence(inputBuffer) {
  const now = performance.now();
  const rms = getAudioRms(inputBuffer);

  if (rms > silenceThreshold) {
    silenceStartedAt = now;
    return;
  }

  if (now - silenceStartedAt >= silenceLimitMs) {
    stopRecording('silence');
  }
}

function handleAudioProcess(event) {
  if (!isRecording || !audioContext) {
    return;
  }

  const inputData = event.inputBuffer.getChannelData(0);
  const outputData = event.outputBuffer.getChannelData(0);
  outputData.fill(0);
  watchSilence(inputData);

  if (!isRecording) {
    return;
  }

  const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, targetSampleRate);
  const pcmBuffer = convertFloatTo16BitPcm(downsampled);

  api.sendSpeechChunk({
    audioBase64: arrayBufferToBase64(pcmBuffer)
  });
}

async function getMicrophoneStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Microphone recording is not available in this Electron environment.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
  });

  activeStream = stream;
  return stream;
}

async function startRecording() {
  if (isBusy || isRecording) {
    return;
  }

  try {
    setBusy(true);
    setStatus('Connecting...');

    const streamResult = await api.startSpeechStream({
      sampleRateHertz: targetSampleRate
    });

    if (!streamResult.ok) {
      setStatus(streamResult.message || 'Could not start Google streaming.', 'error');
      return;
    }

    const stream = await getMicrophoneStream();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    audioSource = audioContext.createMediaStreamSource(stream);
    audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    audioProcessor.onaudioprocess = handleAudioProcess;

    audioSource.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);

    silenceStartedAt = performance.now();
    stoppedBySilence = false;
    lastFinalText = '';

    setRecordingUi(true);
    setStatus('Listening live...', 'recording');
  } catch (error) {
    const isDenied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
    setStatus(
      isDenied
        ? 'Microphone permission denied.'
        : error.message || 'Could not start recording.',
      'error'
    );
    cleanupAudioPipeline();
    await api.stopSpeechStream();
  } finally {
    setBusy(false);
  }
}

async function stopRecording(reason = 'manual') {
  if (!isRecording) {
    return;
  }

  stoppedBySilence = reason === 'silence';
  setRecordingUi(false);
  cleanupAudioPipeline();
  setStatus(stoppedBySilence ? 'Auto-stopped.' : 'Stopped.', stoppedBySilence ? 'warning' : 'normal');
  await api.stopSpeechStream();
}

async function toggleRecording() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

function handleStreamingResult(result) {
  if (!result || !result.text) {
    return;
  }

  const preview = getTextPreview(result.text);

  if (result.isFinal) {
    lastFinalText = result.text;
    setStatus(`Typed: ${preview}`, 'success');
    return;
  }

  setStatus(`Hearing: ${preview}`, 'recording');
}

async function initialize() {
  micButton.addEventListener('click', toggleRecording);
  settingsButton.addEventListener('click', () => api.openSettings());
  hideButton.addEventListener('click', () => api.hideMainWindow());

  api.onShortcutToggleRecording(() => {
    toggleRecording();
  });

  api.onSpeechStreamResult(handleStreamingResult);

  api.onSpeechStreamWarning((message) => {
    setStatus(message, 'warning');
  });

  api.onSpeechStreamStatus((status) => {
    if (!status || !status.message) {
      return;
    }

    if (status.type === 'ended' && isRecording) {
      setRecordingUi(false);
      cleanupAudioPipeline();
    }

    if (status.type === 'paste' && lastFinalText) {
      const action = status.pasted ? 'Typed' : 'Copied';
      setStatus(`${action}: ${getTextPreview(lastFinalText)}`, 'success');
    }
  });

  api.onSettingsUpdated((settings) => {
    if (!isMacRuntime || !settings.googleCredentialsPath || isRecording || isBusy) {
      return;
    }

    setTimeout(() => {
      startRecording();
    }, 600);
  });

  api.onAppWarning((message) => {
    setStatus(message, 'warning');
  });

  const info = await api.getAppInfo();
  isMacRuntime = Boolean(info.isMac);

  if (!info.isMac) {
    setStatus('Windows test mode ready.', 'warning');
    return;
  }

  if (info.shortcutWarning) {
    setStatus(info.shortcutWarning, 'warning');
  }

  if (!info.hasGoogleCredentials) {
    setStatus('Choose Google JSON in Settings.', 'warning');
    api.openSettings();
    return;
  }

  setTimeout(() => {
    startRecording();
  }, 800);
}

initialize();
