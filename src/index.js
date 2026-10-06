import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config/env.js';
import { setupSwagger } from './config/swagger.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import translateRouter from './routes/translate.js';
import transcribeRouter from './routes/transcribe.js';
import conversationsRouter from './routes/conversations.js';
import { handleLiveClientSocket } from './websocket/geminiLiveService.js';
import './config/firebase.js';

// Catch process-level async rejections gracefully
process.on('unhandledRejection', (reason) => {
  console.warn('Process caught unhandled rejection:', reason?.message || reason);
});

const app = express();
const server = http.createServer(app);

// WebSocket Server for Gemini Live Realtime Audio/Text Stream
const wss = new WebSocketServer({ server, path: '/ws/live-interpreter' });

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected to /ws/live-interpreter');
  handleLiveClientSocket(ws);
});

// Middlewares
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow any *.onrender.com, *.vercel.app, *.netlify.app origin automatically
    if (/\.(onrender\.com|vercel\.app|netlify\.app)$/.test(origin)) return callback(null, true);
    return callback(null, true); // Fallback: allow all (remove this line to strictly enforce allowlist)
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Swagger Documentation UI
setupSwagger(app);

// Routes (support both /api prefix and direct paths to avoid 404s)
app.use('/api', healthRouter);
app.use('/api', authRouter);
app.use('/api', translateRouter);
app.use('/api', transcribeRouter);
app.use('/api', conversationsRouter);

app.use('/', healthRouter);
app.use('/', authRouter);
app.use('/', translateRouter);
app.use('/', transcribeRouter);
app.use('/', conversationsRouter);

// Root Endpoint
app.get('/', (req, res) => {
  res.send('Live Interpreter Website Backend Server. Visit <a href="/api-docs">/api-docs</a> for Swagger documentation or connect to <code>/ws/live-interpreter</code> for WebSocket stream.');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.stack || err.message || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// Start Server (bind to 0.0.0.0 for Render, Railway, and cloud containers)
const HOST = '0.0.0.0';
server.listen(config.port, HOST, () => {
  console.log(`Server is running on http://${HOST}:${config.port}`);
  console.log(`Swagger documentation: http://localhost:${config.port}/api-docs`);
  console.log(`Live Interpreter WebSocket: ws://localhost:${config.port}/ws/live-interpreter`);
});
