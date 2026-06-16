const fs = require('fs');
const speech = require('@google-cloud/speech');

const opusSampleRates = new Set([8000, 12000, 16000, 24000, 48000]);

function userError(message, cause) {
  const error = new Error(message);
  error.userMessage = message;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function getSpeechClient(credentialsPath) {
  const selectedPath = String(credentialsPath || '').trim();

  if (selectedPath) {
    if (!fs.existsSync(selectedPath)) {
      throw userError('Google credentials file was not found. Check the JSON path in Settings.');
    }

    return new speech.SpeechClient({
      keyFilename: selectedPath
    });
  }

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      throw userError('GOOGLE_APPLICATION_CREDENTIALS is set, but the file was not found.');
    }

    return new speech.SpeechClient();
  }

  throw userError('Google credentials are missing. Choose a service account JSON in Settings or set GOOGLE_APPLICATION_CREDENTIALS.');
}

function getEncoding(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();

  if (normalized.includes('ogg')) {
    return 'OGG_OPUS';
  }

  if (normalized.includes('webm')) {
    return 'WEBM_OPUS';
  }

  if (normalized.includes('wav') || normalized.includes('wave')) {
    return 'LINEAR16';
  }

  return 'WEBM_OPUS';
}

function getSampleRate(encoding, sampleRateHertz) {
  const requestedRate = Number(sampleRateHertz);

  if (encoding === 'WEBM_OPUS' || encoding === 'OGG_OPUS') {
    return opusSampleRates.has(requestedRate) ? requestedRate : 48000;
  }

  if (Number.isFinite(requestedRate) && requestedRate >= 8000 && requestedRate <= 48000) {
    return requestedRate;
  }

  return undefined;
}

function getTranscript(response) {
  const transcript = (response.results || [])
    .map((result) => {
      const alternative = result.alternatives && result.alternatives[0];
      return alternative && alternative.transcript ? alternative.transcript.trim() : '';
    })
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!transcript) {
    throw userError('No speech detected. Try speaking a little closer to the microphone.');
  }

  return transcript;
}

async function recognizeAudio(client, request, durationMs) {
  if (Number(durationMs) > 55 * 1000) {
    const [operation] = await client.longRunningRecognize(request);
    const [response] = await operation.promise();
    return response;
  }

  const [response] = await client.recognize(request);
  return response;
}

async function transcribeAudio({
  audioBuffer,
  mimeType,
  languageCode = 'ne-NP',
  credentialsPath = '',
  sampleRateHertz = 48000,
  durationMs = 0
}) {
  if (!audioBuffer || audioBuffer.length < 100) {
    throw userError('No audio was recorded. Try again and speak after the mic turns blue.');
  }

  const client = getSpeechClient(credentialsPath);
  const encoding = getEncoding(mimeType);
  const resolvedSampleRate = getSampleRate(encoding, sampleRateHertz);

  const config = {
    encoding,
    languageCode,
    enableAutomaticPunctuation: true,
    model: 'default',
    audioChannelCount: 1
  };

  if (resolvedSampleRate) {
    config.sampleRateHertz = resolvedSampleRate;
  }

  try {
    const response = await recognizeAudio(client, {
      config,
      audio: {
        content: audioBuffer.toString('base64')
      }
    }, durationMs);

    return getTranscript(response);
  } catch (error) {
    if (error.userMessage) {
      throw error;
    }

    const details = error.details || error.message || 'Unknown Google API error.';
    throw userError(`Google Speech-to-Text error: ${details}`, error);
  }
}

function createStreamingRecognizer({
  languageCode = 'ne-NP',
  credentialsPath = '',
  sampleRateHertz = 16000,
  onResult,
  onError,
  onEnd
}) {
  const client = getSpeechClient(credentialsPath);
  let ended = false;

  const recognizeStream = client
    .streamingRecognize({
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz,
        languageCode,
        enableAutomaticPunctuation: true,
        model: 'default',
        audioChannelCount: 1
      },
      interimResults: true,
      singleUtterance: false
    })
    .on('data', (response) => {
      for (const result of response.results || []) {
        const alternative = result.alternatives && result.alternatives[0];
        const transcript = alternative && alternative.transcript ? alternative.transcript.trim() : '';

        if (!transcript) {
          continue;
        }

        onResult({
          text: transcript,
          isFinal: Boolean(result.isFinal),
          stability: Number(result.stability || 0)
        });
      }
    })
    .on('error', (error) => {
      if (ended) {
        return;
      }

      ended = true;
      const details = error.details || error.message || 'Unknown Google streaming error.';
      onError(userError(`Google streaming error: ${details}`, error));
    })
    .on('end', () => {
      if (ended) {
        return;
      }

      ended = true;
      onEnd();
    });

  return {
    write(audioBuffer) {
      if (ended || !audioBuffer || audioBuffer.length === 0 || recognizeStream.destroyed) {
        return;
      }

      recognizeStream.write(audioBuffer);
    },
    end() {
      if (ended || recognizeStream.destroyed) {
        return;
      }

      recognizeStream.end();
    },
    destroy() {
      if (ended || recognizeStream.destroyed) {
        return;
      }

      ended = true;
      recognizeStream.destroy();
    }
  };
}

module.exports = {
  transcribeAudio,
  getEncoding,
  getSampleRate,
  getTranscript,
  recognizeAudio,
  createStreamingRecognizer
};
