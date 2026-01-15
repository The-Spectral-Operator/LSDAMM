/**
 * LSDAMM - API Key Endpoints
 */

import { Router, Request, Response } from 'express';
import { createAPIKey, listAPIKeys, revokeAPIKey } from '../auth/api_keys.js';
import { logger } from '../util/logging.js';

const router = Router();

/**
 * GET /api/keys
 * List all API keys for the current user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub || req.apiKey?.user_id;
    
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const keys = await listAPIKeys(userId);

    // Don't return the actual keys, just metadata
    res.json({
      keys: keys.map(k => ({
        keyId: k.key_id,
        name: k.name,
        description: k.description,
        prefix: k.key_prefix,
        scopes: k.scopes,
        isActive: k.is_active,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
        usageCount: k.usage_count,
        expiresAt: k.expires_at,
      }))
    });
  } catch (error) {
    logger.error('Failed to list API keys', { error });
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

/**
 * POST /api/keys
 * Create a new API key
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub || req.apiKey?.user_id;
    
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { name, description, scopes, expiresIn, isTest } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    let expiresAt: number | undefined;
    if (expiresIn) {
      expiresAt = Date.now() + expiresIn * 1000;
    }

    const result = await createAPIKey(userId, name, {
      description,
      scopes,
      expiresAt,
      isTest,
    });

    res.status(201).json({
      key: {
        keyId: result.key.key_id,
        name: result.key.name,
        description: result.key.description,
        prefix: result.key.key_prefix,
        scopes: result.key.scopes,
        createdAt: result.key.created_at,
        expiresAt: result.key.expires_at,
      },
      // The secret key is only shown once!
      secretKey: result.secretKey,
      warning: 'Store this key securely. It will not be shown again.',
    });
  } catch (error) {
    logger.error('Failed to create API key', { error });
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * DELETE /api/keys/:keyId
 * Revoke an API key
 */
router.delete('/:keyId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub || req.apiKey?.user_id;
    
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { keyId } = req.params;

    const revoked = await revokeAPIKey(keyId, userId);

    if (!revoked) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    res.json({ message: 'API key revoked successfully' });
  } catch (error) {
    logger.error('Failed to revoke API key', { error });
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export default router;
