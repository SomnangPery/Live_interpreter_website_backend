import WebSocket from 'ws';
import { config } from '../config/env.js';
import * as LanguageDetector from '../services/languageDetector.js';
import * as translationService from '../services/translationService.js';

export const instantDetectPrompt = `
You are an expert simultaneous interpreter for live English–Japanese conversations. Two speakers participate: Speaker A (English) and Speaker B (Japanese). Your sole role is to translate audio into the opposite language with high accuracy and low latency.

Language Detection & Translation Rules:
1. Audio in English → transcribe accurately in standard English and translate directly into natural Japanese (Kanji/Hiragana/Katakana).
2. Audio in Japanese → transcribe accurately in standard Japanese (Kanji/Hiragana/Katakana) and translate directly into natural English.
3. NEVER output English as the transcription of Japanese audio. Japanese speech MUST be transcribed using proper Japanese characters (Kanji, Hiragana, Katakana).
4. Pay equal attention to Japanese speech and phonemes (including short greetings and particles like こんにちは, はい, そうです, わかりました, ありがとう, すみません, お疲れ様です, じゃあ, またね, etc.). Treat Japanese audio with high sensitivity and priority.
5. Determine the spoken language dynamically from each utterance. Do NOT permanently lock to English or Japanese.
6. Support rapid and seamless switching between English and Japanese within the same session.
7. Preserve proper names, numbers, business titles, and technical terms accurately.
8. Do NOT answer questions, give conversational replies, or add commentary. Output ONLY the translated text.
9. If the input is background noise or silence, produce no output.

Output format:
- Output pure translated text only without speaker prefixes, labels, or formatting marks.
`;

export function buildSetupMessage() {
  return {
    setup: {
      model: config.geminiLiveModel,
      generationConfig: {
        responseModalities: ['AUDIO'],
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
          endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
          prefixPaddingMs: config.vadPrefixPaddingMs || 80,
          silenceDurationMs: config.vadSilenceDurationMs || 2000,
        },
        turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
      },
      inputAudioTranscription: {
        languageCodes: ['en-US', 'ja-JP'],
      },
      outputAudioTranscription: {},
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

  // Session state tracking across speech turns
  const session = {
    currentLanguage: 'en-US',
    languageName: 'English',
    confidence: 0.95,
    currentTurnFinalText: '',
    currentTurnTranslation: '',
    isTurnActive: false,
  };

  geminiSocket.on('open', () => {
    try {
      const setupMsg = buildSetupMessage();
      geminiSocket.send(JSON.stringify(setupMsg));
    } catch (err) {
      console.error('Failed to send Gemini setup message:', err.message);
    }
  });

  geminiSocket.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data.toString());

      if (parsed.setupComplete) {
        isGeminiReady = true;
        clientSocket.send(JSON.stringify({
          type: 'setupComplete',
          message: 'Connected to Gemini Live Interpretation session',
          supportedLanguages: ['en-US', 'ja-JP'],
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

      // Handle server content / output stream
      if (parsed.serverContent) {
        const sc = parsed.serverContent;

        // 1. Interim transcription (partial real-time hypothesis)
        if (sc.interimInputTranscription && sc.interimInputTranscription.text) {
          const interimText = sc.interimInputTranscription.text.trim();
          if (interimText) {
            session.isTurnActive = true;
            try {
              const detected = await LanguageDetector.identifySpeechLanguage(interimText, session.currentLanguage);
              
              // Standard speech_result event (interim)
              clientSocket.send(JSON.stringify({
                type: 'speech_result',
                language: detected.language,
                languageName: detected.languageName,
                text: interimText,
                isFinal: false,
                confidence: detected.confidence || 0.85,
              }));

              // Backward compatibility event
              clientSocket.send(JSON.stringify({
                type: 'inputTranscription',
                text: interimText,
                isFinal: false,
                language: detected.language,
                languageName: detected.languageName,
              }));
            } catch (err) {
              console.warn('Interim language detection warning:', err.message);
            }
          }
        }

        // 2. Finalized transcription of user speech
        if (sc.inputTranscription && sc.inputTranscription.text) {
          const finalText = sc.inputTranscription.text.trim();
          if (finalText) {
            session.isTurnActive = true;
            session.currentTurnFinalText = finalText;

            try {
              const detected = await LanguageDetector.identifySpeechLanguage(finalText, session.currentLanguage);
              session.currentLanguage = detected.language;
              session.languageName = detected.languageName;
              session.confidence = detected.confidence;

              // Standard speech_result event (finalized)
              clientSocket.send(JSON.stringify({
                type: 'speech_result',
                language: detected.language,
                languageName: detected.languageName,
                text: finalText,
                isFinal: true,
                confidence: detected.confidence || 0.95,
              }));

              // Backward compatibility event
              clientSocket.send(JSON.stringify({
                type: 'inputTranscription',
                text: finalText,
                isFinal: true,
                language: detected.language,
                languageName: detected.languageName,
                confidence: detected.confidence || 0.95,
              }));
            } catch (err) {
              console.warn('Final language detection warning:', err.message);
            }
          }
        }

        // 3. Model output translation stream (from outputAudioTranscription or modelTurn)
        if (sc.outputTranscription && sc.outputTranscription.text) {
          const chunkText = sc.outputTranscription.text;
          session.currentTurnTranslation += chunkText;
          clientSocket.send(JSON.stringify({
            type: 'translationChunk',
            text: chunkText,
            turnComplete: false,
          }));
        }

        if (sc.modelTurn && sc.modelTurn.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.text && part.text.trim()) {
              session.currentTurnTranslation += part.text;
              clientSocket.send(JSON.stringify({
                type: 'translationChunk',
                text: part.text,
                turnComplete: false,
              }));
            }
            if (part.inlineData) {
              clientSocket.send(JSON.stringify({
                type: 'audioChunk',
                mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                data: part.inlineData.data,
              }));
            }
          }
        }

        // 4. Turn complete: finalize sentence translation and direction
        if (sc.turnComplete) {
          let finalTranslation = session.currentTurnTranslation.trim();

          // Fallback if Gemini Live didn't emit text translation chunk
          if (!finalTranslation && session.currentTurnFinalText) {
            try {
              const src = session.currentLanguage === 'ja-JP' ? 'ja' : 'en';
              const tgt = session.currentLanguage === 'ja-JP' ? 'en' : 'ja';
              finalTranslation = await translationService.translate({
                text: session.currentTurnFinalText,
                sourceLang: src,
                targetLang: tgt,
              }) || '';
            } catch (err) {
              console.error('Translation fallback error on turnComplete:', err.message);
            }
          }

          const targetLangCode = session.currentLanguage === 'ja-JP' ? 'en-US' : 'ja-JP';
          const targetLangName = session.currentLanguage === 'ja-JP' ? 'English' : 'Japanese';

          // Emit finalized translation event
          clientSocket.send(JSON.stringify({
            type: 'translation',
            text: finalTranslation,
            originalText: session.currentTurnFinalText,
            sourceLanguage: session.currentLanguage,
            sourceLanguageName: session.languageName,
            targetLanguage: targetLangCode,
            targetLanguageName: targetLangName,
            isFinal: true,
          }));

          // Emit turnComplete
          clientSocket.send(JSON.stringify({
            type: 'turnComplete',
            text: session.currentTurnFinalText,
            translation: finalTranslation,
            language: session.currentLanguage,
            languageName: session.languageName,
          }));

          // Reset per-turn state
          session.currentTurnFinalText = '';
          session.currentTurnTranslation = '';
          session.isTurnActive = false;
        }

        // 5. Interrupted signal
        if (sc.interrupted) {
          session.currentTurnFinalText = '';
          session.currentTurnTranslation = '';
          session.isTurnActive = false;
          clientSocket.send(JSON.stringify({
            type: 'interrupted',
          }));
        }
      }
    } catch (err) {
      console.error('Error handling Gemini Live message:', err);
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

      // If client sends PCM audio chunk
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
      // If raw binary audio
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
