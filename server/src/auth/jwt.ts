/**
 * LSDAMM - JWT Authentication
 * JSON Web Token generation and validation
 */

import jwt from 'jsonwebtoken';
import { getConfig } from '../util/config_parser.js';
import { logger } from '../util/logging.js';
import { v4 as uuidv4 } from 'uuid';

export interface JWTPayload {
  sub: string;        // User ID
  email: string;      // User email
  role: string;       // User role
  type: 'access' | 'refresh';
  jti: string;        // Unique token ID
  iat: number;        // Issued at
  exp: number;        // Expiration
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Generate an access token
 */
export function generateAccessToken(
  userId: string,
  email: string,
  role: string
): { token: string; expiresIn: number } {
  const config = getConfig();
  
  // Parse expiration time
  const expiresIn = parseExpiration(config.auth.jwt_expires_in);
  
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    email,
    role,
    type: 'access',
    jti: uuidv4(),
  };

  const token = jwt.sign(payload as object, config.auth.jwt_secret, {
    expiresIn: expiresIn,
    issuer: 'lsdamm',
    audience: 'lsdamm-api',
  });

  return { token, expiresIn };
}

/**
 * Generate a refresh token (longer-lived)
 */
export function generateRefreshToken(userId: string): { token: string; expiresIn: number } {
  const config = getConfig();
  
  const payload = {
    sub: userId,
    type: 'refresh',
    jti: uuidv4(),
  };

  // Refresh tokens last 30 days
  const expiresIn = 30 * 24 * 60 * 60; // 30 days in seconds

  const token = jwt.sign(payload, config.auth.jwt_secret, {
    expiresIn,
    issuer: 'lsdamm',
    audience: 'lsdamm-refresh',
  });

  return { token, expiresIn };
}

/**
 * Generate a token pair (access + refresh)
 */
export function generateTokenPair(
  userId: string,
  email: string,
  role: string
): TokenPair {
  const { token: accessToken, expiresIn } = generateAccessToken(userId, email, role);
  const { token: refreshToken } = generateRefreshToken(userId);

  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
  const config = getConfig();

  try {
    const payload = jwt.verify(token, config.auth.jwt_secret, {
      issuer: 'lsdamm',
      audience: 'lsdamm-api',
    }) as JWTPayload;

    if (payload.type !== 'access') {
      logger.warn('Invalid token type used as access token');
      return null;
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Access token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid access token', { error: (error as Error).message });
    }
    return null;
  }
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): { sub: string; jti: string } | null {
  const config = getConfig();

  try {
    const payload = jwt.verify(token, config.auth.jwt_secret, {
      issuer: 'lsdamm',
      audience: 'lsdamm-refresh',
    }) as { sub: string; type: string; jti: string };

    if (payload.type !== 'refresh') {
      logger.warn('Invalid token type used as refresh token');
      return null;
    }

    return { sub: payload.sub, jti: payload.jti };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Refresh token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid refresh token', { error: (error as Error).message });
    }
    return null;
  }
}

/**
 * Decode a token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Parse expiration string to seconds
 */
function parseExpiration(expiration: string): number {
  const match = expiration.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 3600; // Default 1 hour
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 3600;
  }
}
