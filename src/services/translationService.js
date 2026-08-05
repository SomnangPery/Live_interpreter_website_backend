import { config } from '../config/env.js';
import * as LanguageDetector from './languageDetector.js';

const GOOGLE_TRANSLATE_BASE_URL = 'https://translate.googleapis.com/translate_a/single';

/**
 * Translate text with Gemini REST API (gemini-2.5-flash)
 */
export async function translateWithGemini({ text, sourceLang, targetLang }) {
  if (!text || !text.trim()) return null;
  const apiKey = config.geminiApiKey;
  if (!apiKey) return null;

  const uri = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const tgtName = targetLang === 'ja' ? 'Japanese' : 'English';

  const prompt = `
You are an expert English-Japanese translator.
Translate the following text into natural, fluent ${tgtName}.
If the input is Japanese (Kanji/Hiragana/Katakana or Romaji or phonetic transcription), translate it into natural English.
If the input is English, translate it into natural Japanese.
Output ONLY the raw translated text without quotes, speaker labels, or additional commentary.

Input: "${text.trim()}"
`;

  try {
    const response = await fetch(uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const candidate = data.candidates?.[0];
      const partText = candidate?.content?.parts?.[0]?.text;
      if (partText && partText.trim()) {
        return partText.trim();
      }
    }
  } catch (err) {
    console.error('Gemini REST translate error:', err);
  }
  return null;
}

/**
 * Translate & classify bilingual input with Gemini structured JSON output
 */
export async function translateBilingualWithGemini(text) {
  if (!text || !text.trim()) return null;
  const apiKey = config.geminiApiKey;
  if (!apiKey) return null;

  const uri = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert bilingual classifier and simultaneous interpreter for English and Japanese.
Analyze this speech input (which may be English, Japanese script, Romaji, or phonetically mis-transcribed Japanese).

Task:
1. Identify if the spoken language is Japanese ('ja') or English ('en').
2. Translate it directly into the opposite language (Japanese -> natural English, English -> natural Japanese).

Return ONLY a valid JSON object matching this exact schema:
{"spoken": "en" | "ja", "translated": "string"}

Input: "${text.trim()}"
`;

  try {
    const response = await fetch(uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const candidate = data.candidates?.[0];
      const textResult = candidate?.content?.parts?.[0]?.text;
      if (textResult && textResult.trim()) {
        const parsed = JSON.parse(textResult.trim());
        const spoken = LanguageDetector.normalizeLang(parsed.spoken || 'en');
        const translated = parsed.translated || '';
        if (translated.trim()) {
          return {
            spoken,
            translated: translated.trim(),
            confidence: 0.95,
          };
        }
      }
    }
  } catch (err) {
    console.error('Gemini bilingual translate error:', err);
  }
  return null;
}

/**
 * Fallback to Google Translate free GTx API
 */
export async function translateGoogleFallback({ text, sourceLang = 'auto', targetLang = 'ja' }) {
  if (!text || !text.trim()) return { detectedLang: 'en', translated: '', confidence: 0.0 };

  const url = new URL(GOOGLE_TRANSLATE_BASE_URL);
  url.searchParams.append('client', 'gtx');
  url.searchParams.append('sl', sourceLang === 'auto' ? 'auto' : sourceLang);
  url.searchParams.append('tl', targetLang);
  url.searchParams.append('dt', 't');
  url.searchParams.append('q', text);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Google Translate API returned ${response.status}`);
    }

    const decoded = await response.json();
    let detected = 'en';
    if (Array.isArray(decoded) && decoded.length > 2 && typeof decoded[2] === 'string') {
      detected = LanguageDetector.normalizeLang(decoded[2]);
    }

    let translatedText = '';
    if (Array.isArray(decoded[0])) {
      for (const part of decoded[0]) {
        if (Array.isArray(part) && typeof part[0] === 'string') {
          translatedText += part[0];
        }
      }
    }

    return {
      detectedLang: detected,
      translated: translatedText.trim(),
      confidence: extractGoogleConfidence(decoded),
    };
  } catch (err) {
    console.error('Google translate fallback error:', err);
    return { detectedLang: 'en', translated: '', confidence: 0.0 };
  }
}

function extractGoogleConfidence(decoded) {
  if (!Array.isArray(decoded) || decoded.length <= 8) return 0.5;
  const block = decoded[8];
  if (!Array.isArray(block) || block.length === 0) return 0.5;

  try {
    const confSlot = block.length >= 2 ? block[block.length - 2] : null;
    if (typeof confSlot === 'number') return Math.max(0.0, Math.min(1.0, confSlot));
    if (Array.isArray(confSlot) && typeof confSlot[0] === 'number') {
      return Math.max(0.0, Math.min(1.0, confSlot[0]));
    }
  } catch (_) {}
  return 0.5;
}

/**
 * Perform bilingual auto translation (EN <-> JA)
 */
export async function translateBilingualAuto(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { spoken: 'en', translated: '', confidence: 0.0 };
  }

  // 1. Prefer Gemini REST API for bilingual classification & translation
  const geminiResult = await translateBilingualWithGemini(trimmed);
  if (geminiResult && geminiResult.translated) {
    return geminiResult;
  }

  // 2. Direct Japanese Hiragana / Kanji script -> Speaker B (Japanese)
  if (LanguageDetector.containsHiragana(trimmed) || LanguageDetector.containsKanji(trimmed)) {
    const en = await translateGoogleFallback({ text: trimmed, sourceLang: 'ja', targetLang: 'en' });
    return {
      spoken: 'ja',
      translated: en.translated,
      confidence: en.confidence,
    };
  }

  // Pure Katakana -> translate to English
  if (LanguageDetector.isPureKatakana(trimmed)) {
    const en = await translateGoogleFallback({ text: trimmed, sourceLang: 'ja', targetLang: 'en' });
    if (en.translated) {
      return {
        spoken: 'ja',
        translated: en.translated,
        confidence: en.confidence,
      };
    }
  }

  // Latin / Romaji / English text
  const local = await LanguageDetector.scoreEnJa(trimmed);
  if (local.confident && local.lang === 'ja') {
    const en = await translateGoogleFallback({ text: trimmed, sourceLang: 'ja', targetLang: 'en' });
    return {
      spoken: 'ja',
      translated: en.translated,
      confidence: Math.max(0.75, Math.min(1.0, en.confidence)),
    };
  }

  const toJa = await translateGoogleFallback({ text: trimmed, targetLang: 'ja' });
  if (toJa.detectedLang === 'ja') {
    const toEn = await translateGoogleFallback({ text: trimmed, targetLang: 'en' });
    return {
      spoken: 'ja',
      translated: toEn.translated,
      confidence: toEn.confidence,
    };
  }

  return {
    spoken: 'en',
    translated: toJa.translated,
    confidence: toJa.confidence,
  };
}

/**
 * General single text translation with fallback
 */
export async function translate({ text, sourceLang = 'auto', targetLang = 'ja' }) {
  if (!text || !text.trim()) return '';

  const geminiRes = await translateWithGemini({ text, sourceLang, targetLang });
  if (geminiRes) return geminiRes;

  const fallback = await translateGoogleFallback({ text, sourceLang, targetLang });
  return fallback.translated;
}

/**
 * Assess confidence based on translation ratio
 */
export function assessConfidence(original, translated) {
  if (!translated || !translated.trim()) return 'low';
  const origLen = Math.max(1, (original || '').length);
  const ratio = (translated || '').length / origLen;
  if (ratio > 0.2 && ratio < 5.0) return 'high';
  if (ratio > 0.1 && ratio < 8.0) return 'medium';
  return 'low';
}
