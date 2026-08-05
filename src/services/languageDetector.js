import { config } from '../config/env.js';

/**
 * Language & Tone Detection Utilities for EN <-> JA simultaneous interpretation.
 * Script-based detection for Japanese scripts (free, instant, 100% accurate).
 * Gemini API fallback for ambiguous Latin-script / Romaji / slang inputs.
 */

const hiraganaRe = /[\u3040-\u309F]/;
const katakanaRe = /[\u30A0-\u30FF]/;
const kanjiRe = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const japaneseRe = /[\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

const GEMINI_MODEL = 'gemini-2.5-flash';

async function detectLangViaGemini(text) {
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return 'en';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Identify the language of this text as either English or Japanese, even if it's romanized Japanese, slang, or a mix. Respond with ONLY one lowercase word: "en" or "ja". No punctuation, no explanation.\n\nText: ${text}`
            }]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 5 }
        })
      }
    );

    if (!response.ok) return 'en';
    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() || '';
    return raw.includes('ja') ? 'ja' : 'en';
  } catch (err) {
    console.error('Gemini language detection API error:', err);
    return 'en';
  }
}

export function containsJapanese(text) {
  return japaneseRe.test(text);
}

export function containsHiragana(text) {
  return hiraganaRe.test(text);
}

export function containsKanji(text) {
  return kanjiRe.test(text);
}

export function containsKatakana(text) {
  return katakanaRe.test(text);
}

export function isPureKatakana(text) {
  return containsKatakana(text) && !containsHiragana(text) && !containsKanji(text);
}

export function normalizeLang(raw) {
  if (!raw) return 'en';
  const code = raw.toLowerCase().split('-')[0];
  return code.startsWith('ja') ? 'ja' : 'en';
}

export function detect(text) {
  return containsJapanese(text) ? 'ja' : 'en';
}

export async function scoreEnJa(text, lastConfidentLang = null) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { lang: lastConfidentLang || 'en', confident: Boolean(lastConfidentLang) };
  }

  // Free, instant, 100% reliable script checks — no reason to call an API for this
  if (containsHiragana(trimmed) || containsKanji(trimmed)) {
    return { lang: 'ja', confident: true };
  }
  if (isPureKatakana(trimmed)) {
    return { lang: 'ja', confident: true };
  }

  // Ambiguous latin-script text (English, or romanized Japanese) — ask Gemini
  try {
    const lang = await detectLangViaGemini(trimmed);
    return { lang, confident: true };
  } catch (err) {
    console.error('Gemini language detection failed:', err);
    return { lang: lastConfidentLang || 'en', confident: false };
  }
}

// Tone Detection
const questionJa = ['か', 'ですか', 'ますか', 'か？', 'の？'];
const politenessEn = ['please', 'sorry', 'thank', 'appreciate', 'excuse'];
const politenessJa = ['すみません', 'ありがとう', 'ごめん', 'お願い', 'どうぞ'];
const excitedWords = [
  'amazing', 'great', 'awesome', 'fantastic', 'wow', 'excellent',
  'すごい', 'やった', 'わあ', '素晴らしい',
];

export function detectTone(text) {
  const t = (text || '').trim();
  const lower = t.toLowerCase();

  if (t.endsWith('?') || t.endsWith('？')) return 'question';
  for (const q of questionJa) {
    if (lower.includes(q)) return 'question';
  }

  if (t.includes('!') || t.includes('！')) return 'excited';
  for (const w of excitedWords) {
    if (lower.includes(w)) return 'excited';
  }

  for (const w of politenessEn) {
    if (lower.includes(w)) return 'polite';
  }
  for (const w of politenessJa) {
    if (lower.includes(w)) return 'polite';
  }

  return 'neutral';
}

export function toneEmoji(tone) {
  switch (tone) {
    case 'question': return '❓';
    case 'excited': return '🔥';
    case 'polite': return '🙏';
    default: return '';
  }
}

export function speakerForLang(lang, firstSpokenLang = null) {
  if (!firstSpokenLang) return lang === 'ja' ? 'B' : 'A';
  return lang === firstSpokenLang ? 'A' : 'B';
}

export function speakerTurnLabel(speaker, spokenLang) {
  const flag = spokenLang === 'ja' ? '🇯🇵' : '🇺🇸';
  const langName = spokenLang === 'ja' ? '日本語' : 'English';
  return `Speaker ${speaker} · ${flag} ${langName}`;
}
