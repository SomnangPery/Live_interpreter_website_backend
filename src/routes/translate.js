import { Router } from 'express';
import * as translationService from '../services/translationService.js';
import * as LanguageDetector from '../services/languageDetector.js';

const router = Router();

/**
 * @openapi
 * /api/translate:
 *   post:
 *     summary: Translate text between languages
 *     description: Translates input text into target language using Gemini REST API or Google Translate fallback.
 *     tags:
 *       - Translation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 example: Hello, welcome to our meeting!
 *               sourceLang:
 *                 type: string
 *                 example: en
 *               targetLang:
 *                 type: string
 *                 example: ja
 *     responses:
 *       200:
 *         description: Successful translation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 originalText:
 *                   type: string
 *                 translatedText:
 *                   type: string
 *                 sourceLanguage:
 *                   type: string
 *                 targetLanguage:
 *                   type: string
 *                 confidence:
 *                   type: string
 */
router.post('/translate', async (req, res) => {
  try {
    const { text, sourceLang, targetLang, from, to } = req.body;
    const sLang = sourceLang || from || 'auto';
    const tLang = targetLang || to || 'ja';

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text parameter is required.' });
    }

    const translatedText = await translationService.translate({
      text: text.trim(),
      sourceLang: sLang,
      targetLang: tLang,
    });

    const confidence = translationService.assessConfidence(text, translatedText);
    const confidenceScore = confidence === 'high' ? 0.95 : confidence === 'medium' ? 0.8 : 0.6;
    const tone = LanguageDetector.detectTone(text);
    const toneEmoji = LanguageDetector.toneEmoji(tone);

    res.json({
      originalText: text,
      translatedText,
      translation: translatedText, // Frontend compatibility alias
      sourceLanguage: sLang,
      targetLanguage: tLang,
      confidence,
      confidenceScore,
      toneEmoji,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/translate/bilingual:
 *   post:
 *     summary: Bilingual EN<->JA auto translation & speaker tone tagging
 *     description: Automatically classifies input speech/text as English or Japanese, translates to opposite language, tags speaker (A/B), detects tone, and calculates confidence.
 *     tags:
 *       - Translation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 example: こんにちは、はじめまして！
 *     responses:
 *       200:
 *         description: Bilingual translation result with speaker and tone analysis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spokenLanguage:
 *                   type: string
 *                   example: ja
 *                 targetLanguage:
 *                   type: string
 *                   example: en
 *                 originalText:
 *                   type: string
 *                 translatedText:
 *                   type: string
 *                 speaker:
 *                   type: string
 *                   example: B
 *                 tone:
 *                   type: string
 *                   example: polite
 *                 toneEmoji:
 *                   type: string
 *                   example: 🙏
 *                 confidence:
 *                   type: string
 *                   example: high
 */
router.post('/translate/bilingual', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text parameter is required.' });
    }

    const result = await translationService.translateBilingualAuto(text.trim());
    const spokenLanguage = result.spoken || 'en';
    const targetLanguage = LanguageDetector.normalizeLang(spokenLanguage) === 'ja' ? 'en' : 'ja';
    const speaker = LanguageDetector.speakerForLang(spokenLanguage);
    const tone = LanguageDetector.detectTone(text);
    const toneEmoji = LanguageDetector.toneEmoji(tone);
    const confidence = translationService.assessConfidence(text, result.translated);

    const meta = LanguageDetector.getLanguageMeta(spokenLanguage);

    res.json({
      language: meta.language,
      languageName: meta.languageName,
      spokenLanguage,
      targetLanguage,
      originalText: text,
      translatedText: result.translated,
      translation: result.translated, // Frontend compatibility alias
      speaker,
      tone,
      toneEmoji,
      confidence,
      confidenceScore: confidence === 'high' ? 0.95 : 0.8,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/detect-language:
 *   post:
 *     summary: Detect language script, Romaji, phonetics, and tone
 *     tags:
 *       - Translation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 example: clean each war
 *     responses:
 *       200:
 *         description: Language detection result
 */
router.post('/detect-language', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text parameter is required.' });
    }

    const scoreResult = await LanguageDetector.scoreEnJa(text);
    const tone = LanguageDetector.detectTone(text);
    const toneEmoji = LanguageDetector.toneEmoji(tone);
    const containsJapanese = LanguageDetector.containsJapanese(text);

    res.json({
      text,
      language: scoreResult.lang,
      confident: scoreResult.confident,
      containsJapanese,
      tone,
      toneEmoji,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * /api/summarize: AI Summary of conversation transcripts
 */
router.post('/summarize', async (req, res) => {
  try {
    const { transcript } = req.body || {};
    if (!transcript || !transcript.trim()) {
      return res.json({ en: 'Session completed with no recorded dialogue.' });
    }

    const summary = await translationService.translateWithGemini({
      text: `Summarize this bilingual conversation into 1-2 concise bullet points highlighting the main key points discussed:\n${transcript}`,
      sourceLang: 'en',
      targetLang: 'en',
    });

    res.json({ en: summary || 'Bilingual conversation successfully interpreted.' });
  } catch (err) {
    res.json({ en: 'Bilingual conversation successfully interpreted.' });
  }
});

/**
 * /api/tts: Text-To-Speech endpoint placeholder
 */
router.post('/tts', (req, res) => {
  // Let client use native browser SpeechSynthesis with full language voice packs
  res.status(404).json({ error: 'Use client Web Speech API' });
});

export default router;
