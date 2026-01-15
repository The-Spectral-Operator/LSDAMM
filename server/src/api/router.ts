/**
 * LSDAMM - HTTP API Router
 * Express router for REST API endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JWTPayload } from '../auth/jwt.js';
import { validateAPIKey } from '../auth/api_keys.js';
import { logger } from '../util/logging.js';

// Extend Express Request to include auth info
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      apiKey?: {
        key_id: string;
        user_id: string;
        scopes: string[];
      };
    }
  }
}

/**
 * JWT Authentication middleware
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  if (authHeader.startsWith('Bearer ')) {
    // JWT token
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = payload;
    next();
  } else if (authHeader.startsWith('lsk_')) {
    // API key
    validateAPIKey(authHeader)
      .then(key => {
        if (!key) {
          res.status(401).json({ error: 'Invalid API key' });
          return;
        }

        req.apiKey = {
          key_id: key.key_id,
          user_id: key.user_id,
          scopes: key.scopes,
        };
        next();
      })
      .catch(error => {
        logger.error('API key validation error', { error });
        res.status(500).json({ error: 'Authentication error' });
      });
  } else {
    res.status(401).json({ error: 'Invalid authorization format' });
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Scope-based authorization for API keys
 */
export function requireScope(...scopes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({ error: 'API key authentication required' });
      return;
    }

    const hasScope = scopes.some(scope => req.apiKey!.scopes.includes(scope));
    if (!hasScope) {
      res.status(403).json({ error: 'API key lacks required scope' });
      return;
    }

    next();
  };
}

/**
 * Create the main API router
 */
export function createApiRouter(): Router {
  const router = Router();

  // Import endpoint modules
  const userEndpoints = require('./user_endpoints.js');
  const keyEndpoints = require('./key_endpoints.js');
  const meshEndpoints = require('./mesh_endpoints.js');
  const healthEndpoints = require('./health.js');

  // Health check (no auth required)
  router.use('/health', healthEndpoints.default);

  // User endpoints
  router.use('/users', userEndpoints.default);

  // API key endpoints (requires auth)
  router.use('/keys', requireAuth, keyEndpoints.default);

  // Mesh endpoints (requires auth)
  router.use('/mesh', requireAuth, meshEndpoints.default);

  // AI completion endpoint (requires auth)
  router.post('/completions', requireAuth, async (req: Request, res: Response) => {
    try {
      const { route } = await import('../models/router.js');
      
      const { messages, provider, model, temperature, max_tokens, stream } = req.body;

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: 'messages array required' });
        return;
      }

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const { streamRoute } = await import('../models/router.js');
        
        for await (const chunk of streamRoute({
          messages,
          preferredProvider: provider,
          preferredModel: model,
          temperature,
          maxTokens: max_tokens,
        })) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        const response = await route({
          messages,
          preferredProvider: provider,
          preferredModel: model,
          temperature,
          maxTokens: max_tokens,
        });

        res.json(response);
      }
    } catch (error) {
      logger.error('Completion request failed', { error });
      res.status(500).json({ error: 'Request failed', message: (error as Error).message });
    }
  });

  // List available providers and models
  router.get('/models', requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getAllModels, getAvailableProviders } = await import('../models/router.js');
      
      const providers = getAvailableProviders();
      const models = await getAllModels();

      res.json({ providers, models });
    } catch (error) {
      logger.error('Failed to get models', { error });
      res.status(500).json({ error: 'Failed to get models' });
    }
  });

  return router;
}
