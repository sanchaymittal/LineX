/**
 * API Documentation Routes
 * 
 * Serves OpenAPI documentation via Swagger UI
 */

import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';

const router: Router = Router();

// Load OpenAPI specification
let swaggerDocument: any;
try {
  const openApiPath = path.join(process.cwd(), 'openapi.yaml');
  const file = fs.readFileSync(openApiPath, 'utf8');
  swaggerDocument = YAML.parse(file);
  
  // Update server URL based on environment
  if (process.env.NODE_ENV === 'production' && process.env.API_URL) {
    swaggerDocument.servers[0].url = process.env.API_URL;
  }
  
  logger.info('📚 OpenAPI documentation loaded successfully');
} catch (error) {
  logger.error('❌ Failed to load OpenAPI documentation:', error);
  swaggerDocument = {
    openapi: '3.0.3',
    info: {
      title: 'LineX API',
      version: '1.0.0',
      description: 'API documentation failed to load'
    },
    paths: {}
  };
}

// Swagger UI options with CDN assets for serverless compatibility
const swaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { 
      display: none 
    }
    .swagger-ui .info .title {
      color: #2e7d32;
    }
    .swagger-ui .btn.authorize {
      background-color: #4caf50;
      border-color: #4caf50;
    }
    .swagger-ui .btn.authorize:hover {
      background-color: #45a049;
      border-color: #45a049;
    }
  `,
  customSiteTitle: 'LineX API Documentation',
  customfavIcon: '/favicon.ico',
  // Use CDN for static assets instead of local files
  swaggerUrl: 'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css',
  customCssUrl: 'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css',
  customJs: [
    'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js',
    'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js'
  ],
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    tryItOutEnabled: true,
    displayOperationId: false,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    validatorUrl: null,
  },
};

// Serve Swagger UI with CDN assets (no local static files)
router.get('/', swaggerUi.setup(swaggerDocument, swaggerUiOptions));

// Serve raw OpenAPI spec
router.get('/openapi.json', (_, res) => {
  res.json(swaggerDocument);
});

router.get('/openapi.yaml', (_, res) => {
  res.type('text/yaml');
  const openApiPath = path.join(process.cwd(), 'openapi.yaml');
  res.sendFile(openApiPath);
});

export default router;