import { config } from '../config/env.js';

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Transcribe an audio Buffer using OpenAI Whisper API (whisper-1)
 * @param {Buffer} buffer - The raw audio buffer
 * @param {string} filename - Filename with proper audio extension (e.g. audio.mp3, audio.wav, audio.m4a)
 * @param {string} [language] - Optional ISO language code ('ja' or 'en')
 */
export async function transcribeAudioBuffer(buffer, filename = 'speech.wav', language = '') {
  const apiKey = config.openaiApiKey;
  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY in .env file.');
  }

  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'audio/wav' });
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-1');

  if (language && language.trim()) {
    formData.append('language', language.trim().toLowerCase());
  }

  const response = await fetch(WHISPER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = errorText;
    try {
      const errJson = JSON.parse(errorText);
      msg = errJson?.error?.message || errorText;
    } catch (_) {}
    throw new Error(`Whisper API Error (${response.status}): ${msg}`);
  }

  const data = await response.json();
  return data.text ? data.text.trim() : '';
}
