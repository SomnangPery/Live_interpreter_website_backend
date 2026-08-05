import { Router } from 'express';
import multer from 'multer';
import { transcribeAudioBuffer } from '../services/whisperService.js';
import * as LanguageDetector from '../services/languageDetector.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @openapi
 * /api/transcribe:
 *   post:
 *     summary: Transcribe audio file using OpenAI Whisper API
 *     description: Uploads audio binary data (multipart/form-data) and returns high-precision transcription.
 *     tags:
 *       - Speech
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               language:
 *                 type: string
 *                 example: ja
 *     responses:
 *       200:
 *         description: Audio transcription result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transcription:
 *                   type: string
 *                 detectedLanguage:
 *                   type: string
 *                 tone:
 *                   type: string
 */
router.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file upload is required.' });
    }

    const requestedLang = req.body.language || '';
    const transcription = await transcribeAudioBuffer(
      req.file.buffer,
      req.file.originalname || 'audio.wav',
      requestedLang
    );

    const score = await LanguageDetector.scoreEnJa(transcription);
    const tone = LanguageDetector.detectTone(transcription);

    res.json({
      transcription,
      detectedLanguage: score.lang,
      tone,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
