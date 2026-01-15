/**
 * LSDAMM - User API Endpoints
 */

import { Router, Request, Response } from 'express';
import { registerUser, loginUser, getUserById, updatePassword, updateUserProfile } from '../auth/user_auth.js';
import { verifyRefreshToken, generateTokenPair } from '../auth/jwt.js';
import { createAuthRateLimiter } from '../util/rate_limit.js';
import { logger } from '../util/logging.js';

const router = Router();

// Apply strict rate limiting to auth endpoints
const authLimiter = createAuthRateLimiter();

/**
 * POST /api/users/register
 * Register a new user
 */
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await registerUser(email, password, displayName);

    res.status(201).json({
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresIn: result.tokens.expiresIn,
      }
    });
  } catch (error) {
    logger.error('Registration failed', { error });
    res.status(400).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/users/login
 * Login user
 */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await loginUser(email, password);

    res.json({
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresIn: result.tokens.expiresIn,
      }
    });
  } catch (error) {
    logger.error('Login failed', { error });
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

/**
 * POST /api/users/refresh
 * Refresh access token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const user = await getUserById(decoded.sub);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const tokens = generateTokenPair(user.user_id, user.email, user.role);

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (error) {
    logger.error('Token refresh failed', { error });
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

/**
 * GET /api/users/me
 * Get current user info
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = await getUserById(req.user.sub);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error('Get user failed', { error });
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * PATCH /api/users/me
 * Update current user profile
 */
router.patch('/me', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { displayName, email } = req.body;

    const updates: { display_name?: string; email?: string } = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (email !== undefined) updates.email = email;

    const user = await updateUserProfile(req.user.sub, updates);

    res.json(user);
  } catch (error) {
    logger.error('Update profile failed', { error });
    res.status(400).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/users/password
 * Change password
 */
router.post('/password', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password required' });
      return;
    }

    await updatePassword(req.user.sub, currentPassword, newPassword);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Password change failed', { error });
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
