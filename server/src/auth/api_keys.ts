/**
 * LSDAMM - API Key Management
 * Stripe-style API key generation and validation
 */

import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { executeRun, execute } from '../db/database.js';
import { hashToken, verifyToken } from './password_hash.js';
import { logger } from '../util/logging.js';

// API Key prefixes
const KEY_PREFIX_LIVE = 'lsk_live_';
const KEY_PREFIX_TEST = 'lsk_test_';

export interface APIKey {
  key_id: string;
  user_id: string;
  key_prefix: string;
  name: string;
  description?: string;
  scopes: string[];
  rate_limit_override?: number;
  is_active: boolean;
  expires_at?: number;
  last_used_at?: number;
  usage_count: number;
  created_at: number;
}

export interface CreateAPIKeyResult {
  key: APIKey;
  secretKey: string; // Only returned once!
}

/**
 * Generate a new API key
 */
export function generateAPIKey(isTest: boolean = false): { prefix: string; secret: string; fullKey: string } {
  const prefix = isTest ? KEY_PREFIX_TEST : KEY_PREFIX_LIVE;
  const secret = crypto.randomBytes(24).toString('base64url');
  const fullKey = `${prefix}${secret}`;

  return { prefix, secret, fullKey };
}

/**
 * Create a new API key for a user
 */
export async function createAPIKey(
  userId: string,
  name: string,
  options?: {
    description?: string;
    scopes?: string[];
    rateLimitOverride?: number;
    expiresAt?: number;
    isTest?: boolean;
  }
): Promise<CreateAPIKeyResult> {
  const { prefix, fullKey } = generateAPIKey(options?.isTest);
  const keyId = uuidv4();
  const keyHash = hashToken(fullKey);
  const scopes = options?.scopes ?? ['read', 'write'];

  executeRun(
    `INSERT INTO api_keys (
      key_id, user_id, key_prefix, key_hash, name, description, 
      scopes, rate_limit_override, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      keyId,
      userId,
      prefix,
      keyHash,
      name,
      options?.description ?? null,
      JSON.stringify(scopes),
      options?.rateLimitOverride ?? null,
      options?.expiresAt ?? null,
      Date.now()
    ]
  );

  logger.info('API key created', { keyId, userId, name });

  const key: APIKey = {
    key_id: keyId,
    user_id: userId,
    key_prefix: prefix,
    name,
    description: options?.description,
    scopes,
    rate_limit_override: options?.rateLimitOverride,
    is_active: true,
    expires_at: options?.expiresAt,
    usage_count: 0,
    created_at: Date.now()
  };

  return { key, secretKey: fullKey };
}

/**
 * Validate an API key and return the associated data
 */
export async function validateAPIKey(apiKey: string): Promise<APIKey | null> {
  // Extract prefix (first 9 characters)
  const prefix = apiKey.substring(0, 9);
  
  if (prefix !== KEY_PREFIX_LIVE && prefix !== KEY_PREFIX_TEST) {
    logger.warn('Invalid API key prefix', { prefix });
    return null;
  }

  // Find keys with matching prefix
  const candidates = execute<{
    key_id: string;
    user_id: string;
    key_prefix: string;
    key_hash: string;
    name: string;
    description: string | null;
    scopes: string;
    rate_limit_override: number | null;
    is_active: number;
    expires_at: number | null;
    last_used_at: number | null;
    usage_count: number;
    created_at: number;
  }>(
    'SELECT * FROM api_keys WHERE key_prefix = ? AND is_active = 1',
    [prefix]
  );

  // Verify against each candidate (timing-safe comparison)
  for (const candidate of candidates) {
    if (verifyToken(apiKey, candidate.key_hash)) {
      // Check expiration
      if (candidate.expires_at && candidate.expires_at < Date.now()) {
        logger.info('API key expired', { keyId: candidate.key_id });
        return null;
      }

      // Update usage stats
      executeRun(
        'UPDATE api_keys SET last_used_at = ?, usage_count = usage_count + 1 WHERE key_id = ?',
        [Date.now(), candidate.key_id]
      );

      // Track daily usage
      const today = new Date().toISOString().split('T')[0];
      executeRun(
        `INSERT INTO api_key_usage (key_id, date, requests_made)
         VALUES (?, ?, 1)
         ON CONFLICT(key_id, date) DO UPDATE SET requests_made = requests_made + 1`,
        [candidate.key_id, today]
      );

      return {
        key_id: candidate.key_id,
        user_id: candidate.user_id,
        key_prefix: candidate.key_prefix,
        name: candidate.name,
        description: candidate.description ?? undefined,
        scopes: JSON.parse(candidate.scopes) as string[],
        rate_limit_override: candidate.rate_limit_override ?? undefined,
        is_active: Boolean(candidate.is_active),
        expires_at: candidate.expires_at ?? undefined,
        last_used_at: candidate.last_used_at ?? undefined,
        usage_count: candidate.usage_count,
        created_at: candidate.created_at
      };
    }
  }

  logger.warn('API key not found or invalid');
  return null;
}

/**
 * Revoke an API key
 */
export async function revokeAPIKey(keyId: string, userId: string): Promise<boolean> {
  const result = executeRun(
    'UPDATE api_keys SET is_active = 0, revoked_at = ? WHERE key_id = ? AND user_id = ?',
    [Date.now(), keyId, userId]
  );

  if (result.changes > 0) {
    logger.info('API key revoked', { keyId, userId });
    return true;
  }

  return false;
}

/**
 * List all API keys for a user
 */
export async function listAPIKeys(userId: string): Promise<APIKey[]> {
  const rows = execute<{
    key_id: string;
    user_id: string;
    key_prefix: string;
    name: string;
    description: string | null;
    scopes: string;
    rate_limit_override: number | null;
    is_active: number;
    expires_at: number | null;
    last_used_at: number | null;
    usage_count: number;
    created_at: number;
  }>(
    'SELECT key_id, user_id, key_prefix, name, description, scopes, rate_limit_override, is_active, expires_at, last_used_at, usage_count, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );

  return rows.map(row => ({
    key_id: row.key_id,
    user_id: row.user_id,
    key_prefix: row.key_prefix,
    name: row.name,
    description: row.description ?? undefined,
    scopes: JSON.parse(row.scopes) as string[],
    rate_limit_override: row.rate_limit_override ?? undefined,
    is_active: Boolean(row.is_active),
    expires_at: row.expires_at ?? undefined,
    last_used_at: row.last_used_at ?? undefined,
    usage_count: row.usage_count,
    created_at: row.created_at
  }));
}
