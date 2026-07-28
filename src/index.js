import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupSwagger } from './config/swagger.js';
import healthRouter from './routes/health.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Swagger Documentation UI
setupSwagger(app);

// Routes
app.use('/api', healthRouter);

// Root Endpoint
app.get('/', (req, res) => {
  res.send('Live Interpreter Website Backend Server. Visit <a href="/api-docs">/api-docs</a> for Swagger documentation.');
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Swagger documentation: http://localhost:${PORT}/api-docs`);
});
