/**
 * API Documentation Routes
 * 
 * Serves OpenAPI documentation via Swagger UI
 */

import { Router } from 'express';
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

// Generate custom Swagger UI HTML with CDN assets
const generateSwaggerHTML = () => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LineX API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #fafafa;
    }
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
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: window.location.origin + '/api-docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        displayOperationId: false,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        validatorUrl: null
      });
    };
  </script>
</body>
</html>`;
};

// Serve custom Swagger UI HTML with CDN assets
router.get('/', (_, res) => {
  res.type('text/html');
  res.send(generateSwaggerHTML());
});

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