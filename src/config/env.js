import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiLiveModel: process.env.GEMINI_LIVE_MODEL || 'models/gemini-live-2.5-flash',
  utteranceSilenceSeconds: parseInt(process.env.UTTERANCE_SILENCE_SECONDS || '2', 10),
  vadSilenceDurationMs: parseInt(process.env.VAD_SILENCE_MS || '2000', 10),
  vadPrefixPaddingMs: parseInt(process.env.VAD_PREFIX_MS || '80', 10),
  geminiWebsocketBase: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'live-interpreter-1b68b',
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY || '',
};


