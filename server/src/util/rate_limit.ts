/**
 * LSDAMM - Rate Limiting
 * Flexible rate limiting with multiple strategies
 */

import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import { getConfig } from './config_parser.js';
import { logger } from './logging.js';

// Rate limiter instances
const limiters = new Map<string, RateLimiterMemory>();

/**
 * Get or create a rate limiter
 */
function getRateLimiter(key: string, points: number, duration: number): RateLimiterMemory {
  const limiterKey = `${key}-${points}-${duration}`;
  
  if (!limiters.has(limiterKey)) {
    limiters.set(limiterKey, new RateLimiterMemory({
      points,
      duration: duration / 1000, // Convert ms to seconds
      keyPrefix: key
    }));
  }
  
  return limiters.get(limiterKey)!;
}

/**
 * Create rate limit middleware
 */
export function createRateLimiter(options?: {
  points?: number;
  duration?: number;
  keyGenerator?: (req: Request) => string;
}) {
  const config = getConfig();
  const points = options?.points ?? config.rate_limit.max_requests;
  const duration = options?.duration ?? config.rate_limit.window_ms;
  const keyGenerator = options?.keyGenerator ?? ((req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  });

  const limiter = getRateLimiter('http', points, duration);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = keyGenerator(req);
    
    try {
      const result = await limiter.consume(key);
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': String(points),
        'X-RateLimit-Remaining': String(result.remainingPoints),
        'X-RateLimit-Reset': String(Math.ceil(result.msBeforeNext / 1000))
      });
      
      next();
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        logger.warn('Rate limit exceeded', {
          ip: key,
          path: req.path,
          retryAfter: Math.ceil(error.msBeforeNext / 1000)
        });
        
        res.set({
          'X-RateLimit-Limit': String(points),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(error.msBeforeNext / 1000)),
          'Retry-After': String(Math.ceil(error.msBeforeNext / 1000))
        });
        
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(error.msBeforeNext / 1000)
        });
      } else {
        logger.error('Rate limiter error', { error });
        next(error);
      }
    }
  };
}

/**
 * API-specific rate limiter (stricter)
 */
export function createApiRateLimiter() {
  const config = getConfig();
  return createRateLimiter({
    points: Math.floor(config.rate_limit.max_requests / 10), // 10 req/min for API
    duration: config.rate_limit.window_ms
  });
}

/**
 * Auth endpoint rate limiter (very strict)
 */
export function createAuthRateLimiter() {
  return createRateLimiter({
    points: 5, // 5 attempts per minute
    duration: 60000, // 1 minute
    keyGenerator: (req: Request) => {
      // Use both IP and username if available
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const username = req.body?.username || req.body?.email || '';
      return `${ip}-${username}`;
    }
  });
}

/**
 * WebSocket rate limiter
 */
export class WebSocketRateLimiter {
  private limiter: RateLimiterMemory;
  
  constructor(points: number = 100, durationMs: number = 60000) {
    this.limiter = getRateLimiter('ws', points, durationMs);
  }
  
  async consume(key: string): Promise<{ allowed: boolean; remainingPoints: number }> {
    try {
      const result = await this.limiter.consume(key);
      return { allowed: true, remainingPoints: result.remainingPoints };
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        return { allowed: false, remainingPoints: 0 };
      }
      throw error;
    }
  }
}
