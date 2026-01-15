/**
 * LSDAMM - Password Hashing with Argon2
 * Secure password hashing and verification
 */

import argon2 from 'argon2';
import crypto from 'node:crypto';
import { logger } from '../util/logging.js';

// Argon2 configuration (OWASP recommended settings)
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,        // 3 iterations
  parallelism: 4,     // 4 parallel threads
  hashLength: 32,     // 32 bytes output
};

/**
 * Hash a password using Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const hash = await argon2.hash(password, ARGON2_OPTIONS);
    return hash;
  } catch (error) {
    logger.error('Failed to hash password', { error });
    throw new Error('Password hashing failed');
  }
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    logger.error('Failed to verify password', { error });
    return false;
  }
}

/**
 * Check if a password hash needs to be rehashed (due to config changes)
 */
export async function needsRehash(hash: string): Promise<boolean> {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Hash a token using SHA-256 (for storage)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Compare a token with its hash in constant time
 */
export function verifyToken(token: string, hash: string): boolean {
  const tokenHash = hashToken(token);
  return crypto.timingSafeEqual(
    Buffer.from(tokenHash, 'hex'),
    Buffer.from(hash, 'hex')
  );
}
