import { Router } from 'express';
import * as conversationService from '../services/conversationService.js';
import { optionalFirebaseToken } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * @openapi
 * /api/conversations:
 *   post:
 *     summary: Save or create a new conversation session
 *     tags:
 *       - Conversations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               userId:
 *                 type: string
 *               title:
 *                 type: string
 *               sourceLanguage:
 *                 type: string
 *               targetLanguage:
 *                 type: string
 *               entries:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     originalText:
 *                       type: string
 *                     translatedText:
 *                       type: string
 *                     speaker:
 *                       type: string
 *                     tone:
 *                       type: string
 *                     confidence:
 *                       type: string
 *     responses:
 *       200:
 *         description: Conversation saved successfully
 *       500:
 *         description: Server error
 */
router.post('/conversations', optionalFirebaseToken, async (req, res) => {
  try {
    const payload = req.body || {};
    const effectiveUserId = req.user?.userId || payload.userId || 'guest_user';
    const conversation = await conversationService.saveConversation({
      ...payload,
      userId: effectiveUserId,
    });
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/conversations:
 *   get:
 *     summary: List conversation sessions
 *     tags:
 *       - Conversations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of conversations
 *       500:
 *         description: Server error
 */
router.get('/conversations', optionalFirebaseToken, async (req, res) => {
  try {
    const effectiveUserId = req.user?.userId || req.query.userId || null;
    const list = await conversationService.listConversations(effectiveUserId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/conversations/{id}:
 *   get:
 *     summary: Get conversation session details by ID
 *     tags:
 *       - Conversations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation details
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.get('/conversations/:id', optionalFirebaseToken, async (req, res) => {
  try {
    const conversation = await conversationService.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation session not found.' });
    }
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /api/conversations/{id}:
 *   delete:
 *     summary: Delete conversation session
 *     tags:
 *       - Conversations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted successfully
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.delete('/conversations/:id', optionalFirebaseToken, async (req, res) => {
  try {
    const deleted = await conversationService.deleteConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation session not found.' });
    }
    res.json({ success: true, message: 'Conversation deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
