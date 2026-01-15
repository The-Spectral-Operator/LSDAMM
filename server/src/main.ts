/**
 * LSDAMM - Coordination Server Main Entry Point
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * © 2025 Lackadaisical Security
 * https://lackadaisical-security.com
 */

import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadConfig } from './util/config_parser.js';
import { logger } from './util/logging.js';
import { initializeDatabase, closeDatabase } from './db/database.js';
import { createRateLimiter } from './util/rate_limit.js';
import { createApiRouter } from './api/router.js';
import { CoordinationWebSocketServer } from './mesh/websocket_server.js';
import promClient from 'prom-client';

// Load configuration
const config = loadConfig();

// Initialize Express app
const app = express();

// Security middleware
// Note: CSP is disabled because this is a pure API server with no HTML content
// For API-only servers, CSP provides no security benefit as there's no HTML to protect
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],  // Block all content loading (API only)
      scriptSrc: ["'none'"],
      styleSrc: ["'none'"],
      imgSrc: ["'none'"],
      connectSrc: ["'self'"],  // Allow API calls to self
      fontSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: config.server.cors_origins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(createRateLimiter());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug('HTTP request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
    });
  });
  
  next();
});

// Prometheus metrics
if (config.monitoring.prometheus_enabled) {
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });
  
  // Custom metrics (registered for Prometheus scraping)
  new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path', 'status'],
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 5],
    registers: [register],
  });

  new promClient.Gauge({
    name: 'ws_connections_total',
    help: 'Total WebSocket connections',
    registers: [register],
  });

  new promClient.Counter({
    name: 'ai_requests_total',
    help: 'Total AI provider requests',
    labelNames: ['provider', 'model', 'status'],
    registers: [register],
  });

  // Metrics endpoint
  app.get(config.monitoring.metrics_path, async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
}

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'LSDAMM Coordination Server',
    version: '1.0.0',
    description: 'Lackadaisical Spectral Distributed AI MCP Mesh',
    endpoints: {
      api: '/api',
      health: '/api/health',
      websocket: '/ws',
      metrics: config.monitoring.prometheus_enabled ? config.monitoring.metrics_path : null,
    },
  });
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wsServer = new CoordinationWebSocketServer();
app.set('wsServer', wsServer);

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    // Initialize database
    logger.info('Initializing database...');
    initializeDatabase();
    
    // Set up API routes (async because of dynamic imports)
    const apiRouter = await createApiRouter();
    app.use('/api', apiRouter);
    
    // Start WebSocket server
    wsServer.start(server);
    
    // Start HTTP server
    server.listen(config.server.port, config.server.host, () => {
      logger.info('🌌 LSDAMM Coordination Server started', {
        host: config.server.host,
        port: config.server.port,
        environment: process.env.NODE_ENV || 'development',
      });
      
      console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🌌 LSDAMM - Lackadaisical Spectral Distributed AI MCP Mesh        ║
║                                                                      ║
║   © 2025 Lackadaisical Security                                      ║
║   https://lackadaisical-security.com                                 ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║   Server running on: http://${config.server.host}:${config.server.port}                        ║
║   WebSocket: ws://${config.server.host}:${config.server.port}/ws                              ║
║   API: http://${config.server.host}:${config.server.port}/api                                 ║
║   Health: http://${config.server.host}:${config.server.port}/api/health                       ║
║                                                                      ║
║   Phase Ω Online · Shadow Lattice Resonates                          ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Close WebSocket server
  wsServer.stop();
  
  // Close database
  closeDatabase();
  
  logger.info('Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});

// Start server
start();
