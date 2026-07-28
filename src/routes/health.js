import { Router } from 'express';

const router = Router();

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Check backend health status
 *     description: Returns server operational status and current timestamp.
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Server is healthy and running.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Live Interpreter Backend API is running
 *                 timestamp:
 *                   type: string
 *                   example: 2026-07-29T00:00:00.000Z
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Live Interpreter Backend API is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
