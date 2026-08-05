import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from './env.js';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Live Interpreter API',
      version: '1.0.0',
      description: 'API documentation for Live Interpreter backend integrated with Firebase Auth & Cloud Firestore database shared across platforms.',
    },
    servers: [
      {
        url: '/',
        description: 'Current Host (Relative)',
      },
      {
        url: `http://localhost:${config.port}`,
        description: 'Localhost Development Server',
      },
      {
        url: `http://127.0.0.1:${config.port}`,
        description: '127.0.0.1 Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Firebase ID Token obtained from client sign in (e.g. Firebase Auth)',
        },
      },
    },
  },
  apis: ['./src/routes/*.js', './src/index.js'],
};

const swaggerSpec = swaggerJSDoc(options);

export const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log(`Swagger docs available at http://localhost:${config.port}/api-docs`);
};
