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
    const { text, sourceLang = 'auto', targetLang = 'ja' } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text parameter is required.' });
    }

    const translatedText = await translationService.translate({
      text: text.trim(),
      sourceLang,
      targetLang,
    });

    const confidence = translationService.assessConfidence(text, translatedText);

    res.json({
      originalText: text,
      translatedText,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      confidence,
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

    res.json({
      spokenLanguage,
      targetLanguage,
      originalText: text,
      translatedText: result.translated,
      speaker,
      tone,
      toneEmoji,
      confidence,
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

export default router;
