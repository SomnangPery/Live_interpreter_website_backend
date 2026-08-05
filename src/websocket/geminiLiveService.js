import WebSocket from 'ws';
import { config } from '../config/env.js';

export const instantDetectPrompt = `
You are an expert simultaneous interpreter for live English–Japanese conversations. Two speakers participate: Speaker A (English) and Speaker B (Japanese). Your sole role is to translate audio into the opposite language with high accuracy and low latency.

Language Detection & Translation Rules:
1. Audio in English → translate directly into natural Japanese (Kanji/Hiragana/Katakana).
2. Audio in Japanese → translate directly into natural English.
3. Pay equal attention to Japanese speech and phonemes (including short greetings like こんにちは, はい, そうです, わかりました, ありがとう, すみません, お疲れ様です, etc.). Treat Japanese audio with high priority and sensitivity.
4. Determine the spoken language from the initial phonemes of each utterance. Do NOT mix up English and Japanese.
5. Treat each turn independently. If the speaker changes or the language switches, immediately switch your output language.
6. Preserve proper names, numbers, business titles, and technical terms accurately.
7. Do NOT answer questions, give conversational replies, or add commentary. Output ONLY the translated text.
8. If the input is background noise or silence, produce no output.

Output format:
- Output pure translated text only without speaker prefixes, labels, or formatting marks.
`;

export function buildSetupMessage() {
  return {
    setup: {
      model: config.geminiLiveModel,
      generationConfig: {
        responseModalities: ['TEXT'],
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
          endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
          prefixPaddingMs: config.vadPrefixPaddingMs,
          silenceDurationMs: config.vadSilenceDurationMs,
        },
        turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
      },
      inputAudioTranscription: {},
      systemInstruction: {
        parts: [{ text: instantDetectPrompt }],
      },
    },
  };
}

/**
 * Handle a client WebSocket session for Live Interpretation
 */
export function handleLiveClientSocket(clientSocket) {
  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    clientSocket.send(JSON.stringify({
      type: 'error',
      message: 'Gemini API key missing on backend server.',
    }));
    clientSocket.close();
    return;
  }

  const geminiWsUrl = `${config.geminiWebsocketBase}?key=${apiKey}`;
  const geminiSocket = new WebSocket(geminiWsUrl);

  let isGeminiReady = false;

  geminiSocket.on('open', () => {
    // Send setup configuration
    const setupMsg = buildSetupMessage();
    geminiSocket.send(JSON.stringify(setupMsg));
  });

  geminiSocket.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());

      if (parsed.setupComplete) {
        isGeminiReady = true;
        clientSocket.send(JSON.stringify({
          type: 'setupComplete',
          message: 'Connected to Gemini Live Interpretation session',
        }));
        return;
      }

      if (parsed.error) {
        clientSocket.send(JSON.stringify({
          type: 'error',
          error: parsed.error,
        }));
        return;
      }

      // Handle server content / output text stream
      if (parsed.serverContent) {
        const sc = parsed.serverContent;
        if (sc.modelTurn && sc.modelTurn.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.text && part.text.trim()) {
              clientSocket.send(JSON.stringify({
                type: 'translationChunk',
                text: part.text,
                turnComplete: false,
              }));
            }
          }
        }

        if (sc.inputTranscription && sc.inputTranscription.text) {
          clientSocket.send(JSON.stringify({
            type: 'inputTranscription',
            text: sc.inputTranscription.text,
          }));
        }

        if (sc.turnComplete) {
          clientSocket.send(JSON.stringify({
            type: 'turnComplete',
          }));
        }

        if (sc.interrupted) {
          clientSocket.send(JSON.stringify({
            type: 'interrupted',
          }));
        }
      }
    } catch (err) {
      console.error('Error parsing message from Gemini Live:', err);
    }
  });

  geminiSocket.on('error', (err) => {
    console.error('Gemini Live WebSocket error:', err.message);
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(JSON.stringify({
        type: 'error',
        message: `Gemini Live connection error: ${err.message}`,
      }));
    }
  });

  geminiSocket.on('close', (code, reason) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(JSON.stringify({
        type: 'closed',
        message: 'Gemini Live WebSocket session closed',
      }));
      clientSocket.close();
    }
  });

  // Listen to messages from client
  clientSocket.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());

      // If client sends PCM audio base64 chunk
      if (parsed.type === 'audio' && parsed.data) {
        if (geminiSocket.readyState === WebSocket.OPEN && isGeminiReady) {
          geminiSocket.send(JSON.stringify({
            realtimeInput: {
              audio: {
                mimeType: parsed.mimeType || 'audio/pcm;rate=16000',
                data: parsed.data,
              },
            },
          }));
        }
      } else if (parsed.type === 'stop') {
        geminiSocket.close();
      }
    } catch (e) {
      // If raw binary audio or invalid json
      if (Buffer.isBuffer(message) && geminiSocket.readyState === WebSocket.OPEN && isGeminiReady) {
        geminiSocket.send(JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: 'audio/pcm;rate=16000',
              data: message.toString('base64'),
            },
          },
        }));
      }
    }
  });

  clientSocket.on('close', () => {
    if (geminiSocket.readyState === WebSocket.OPEN) {
      geminiSocket.close();
    }
  });
}
