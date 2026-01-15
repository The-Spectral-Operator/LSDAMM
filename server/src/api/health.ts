/**
 * LSDAMM - Health Check Endpoints
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { getConfig } from '../util/config_parser.js';
import { isEnabled as isOpenAIEnabled } from '../models/openai_service.js';
import { isEnabled as isAnthropicEnabled } from '../models/anthropic_service.js';
import { isLocalEnabled as isOllamaLocalEnabled, isCloudEnabled as isOllamaCloudEnabled } from '../models/ollama_service.js';
import { isEnabled as isGoogleEnabled } from '../models/google_service.js';
import { isEnabled as isXAIEnabled } from '../models/xai_service.js';

const router = Router();

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: boolean;
    memory: boolean;
    providers: {
      openai: boolean;
      anthropic: boolean;
      google: boolean;
      xai: boolean;
      ollama_local: boolean;
      ollama_cloud: boolean;
    };
  };
}

/**
 * GET /api/health
 * Basic health check
 */
router.get('/', async (_req: Request, res: Response) => {
  const health: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    checks: {
      database: false,
      memory: false,
      providers: {
        openai: false,
        anthropic: false,
        google: false,
        xai: false,
        ollama_local: false,
        ollama_cloud: false,
      },
    },
  };

  // Check database
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    health.checks.database = true;
  } catch {
    health.status = 'unhealthy';
  }

  // Check memory
  const memUsage = process.memoryUsage();
  health.checks.memory = memUsage.heapUsed < memUsage.heapTotal * 0.9;
  if (!health.checks.memory && health.status === 'healthy') {
    health.status = 'degraded';
  }

  // Check providers
  health.checks.providers.openai = isOpenAIEnabled();
  health.checks.providers.anthropic = isAnthropicEnabled();
  health.checks.providers.google = isGoogleEnabled();
  health.checks.providers.xai = isXAIEnabled();
  health.checks.providers.ollama_local = isOllamaLocalEnabled();
  health.checks.providers.ollama_cloud = isOllamaCloudEnabled();

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /api/health/live
 * Kubernetes liveness probe
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * GET /api/health/ready
 * Kubernetes readiness probe
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready', error: 'Database unavailable' });
  }
});

export default router;
