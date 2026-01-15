/**
 * LSDAMM - User Authentication
 * User registration, login, and management
 */

import { v4 as uuidv4 } from 'uuid';
import { executeOne, executeRun, execute } from '../db/database.js';
import { hashPassword, verifyPassword, needsRehash } from './password_hash.js';
import { generateTokenPair, TokenPair } from './jwt.js';
import { logger } from '../util/logging.js';

export interface User {
  user_id: string;
  email: string;
  display_name?: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: number;
  updated_at: number;
  last_login_at?: number;
}

interface UserRow {
  user_id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: string;
  is_active: number;
  email_verified: number;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

/**
 * Register a new user
 */
export async function registerUser(
  email: string,
  password: string,
  displayName?: string,
  role: string = 'user'
): Promise<{ user: User; tokens: TokenPair }> {
  // Check if email already exists
  const existing = executeOne<{ user_id: string }>(
    'SELECT user_id FROM users WHERE email = ?',
    [email.toLowerCase()]
  );

  if (existing) {
    throw new Error('Email already registered');
  }

  // Validate password strength
  validatePasswordStrength(password);

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const userId = uuidv4();
  const now = Date.now();

  executeRun(
    `INSERT INTO users (user_id, email, password_hash, display_name, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, email.toLowerCase(), passwordHash, displayName ?? null, role, now, now]
  );

  logger.info('User registered', { userId, email: email.toLowerCase() });

  const user: User = {
    user_id: userId,
    email: email.toLowerCase(),
    display_name: displayName,
    role,
    is_active: true,
    email_verified: false,
    created_at: now,
    updated_at: now
  };

  // Generate tokens
  const tokens = generateTokenPair(userId, user.email, role);

  return { user, tokens };
}

/**
 * Login a user
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: User; tokens: TokenPair }> {
  // Find user
  const userRow = executeOne<UserRow>(
    'SELECT * FROM users WHERE email = ? AND is_active = 1',
    [email.toLowerCase()]
  );

  if (!userRow) {
    // Use constant time to prevent timing attacks
    await hashPassword('dummy-password');
    throw new Error('Invalid email or password');
  }

  // Verify password
  const isValid = await verifyPassword(password, userRow.password_hash);

  if (!isValid) {
    logger.warn('Failed login attempt', { email: email.toLowerCase() });
    throw new Error('Invalid email or password');
  }

  // Check if password needs rehashing
  if (await needsRehash(userRow.password_hash)) {
    const newHash = await hashPassword(password);
    executeRun(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?',
      [newHash, Date.now(), userRow.user_id]
    );
  }

  // Update last login
  executeRun(
    'UPDATE users SET last_login_at = ? WHERE user_id = ?',
    [Date.now(), userRow.user_id]
  );

  logger.info('User logged in', { userId: userRow.user_id, email: email.toLowerCase() });

  const user: User = {
    user_id: userRow.user_id,
    email: userRow.email,
    display_name: userRow.display_name ?? undefined,
    role: userRow.role,
    is_active: Boolean(userRow.is_active),
    email_verified: Boolean(userRow.email_verified),
    created_at: userRow.created_at,
    updated_at: userRow.updated_at,
    last_login_at: Date.now()
  };

  // Generate tokens
  const tokens = generateTokenPair(userRow.user_id, user.email, user.role);

  return { user, tokens };
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const userRow = executeOne<UserRow>(
    'SELECT * FROM users WHERE user_id = ?',
    [userId]
  );

  if (!userRow) {
    return null;
  }

  return {
    user_id: userRow.user_id,
    email: userRow.email,
    display_name: userRow.display_name ?? undefined,
    role: userRow.role,
    is_active: Boolean(userRow.is_active),
    email_verified: Boolean(userRow.email_verified),
    created_at: userRow.created_at,
    updated_at: userRow.updated_at,
    last_login_at: userRow.last_login_at ?? undefined
  };
}

/**
 * Update user password
 */
export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const userRow = executeOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE user_id = ?',
    [userId]
  );

  if (!userRow) {
    throw new Error('User not found');
  }

  // Verify current password
  const isValid = await verifyPassword(currentPassword, userRow.password_hash);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  // Validate new password
  validatePasswordStrength(newPassword);

  // Hash and save new password
  const newHash = await hashPassword(newPassword);
  executeRun(
    'UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?',
    [newHash, Date.now(), userId]
  );

  logger.info('User password updated', { userId });
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: { display_name?: string; email?: string }
): Promise<User> {
  const setClauses: string[] = ['updated_at = ?'];
  const params: unknown[] = [Date.now()];

  if (updates.display_name !== undefined) {
    setClauses.push('display_name = ?');
    params.push(updates.display_name);
  }

  if (updates.email !== undefined) {
    // Check if email is already taken
    const existing = executeOne<{ user_id: string }>(
      'SELECT user_id FROM users WHERE email = ? AND user_id != ?',
      [updates.email.toLowerCase(), userId]
    );

    if (existing) {
      throw new Error('Email already in use');
    }

    setClauses.push('email = ?');
    setClauses.push('email_verified = 0'); // Reset verification
    params.push(updates.email.toLowerCase());
  }

  params.push(userId);

  executeRun(
    `UPDATE users SET ${setClauses.join(', ')} WHERE user_id = ?`,
    params
  );

  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found after update');
  }

  logger.info('User profile updated', { userId });
  return user;
}

/**
 * Deactivate user account
 */
export async function deactivateUser(userId: string): Promise<void> {
  executeRun(
    'UPDATE users SET is_active = 0, updated_at = ? WHERE user_id = ?',
    [Date.now(), userId]
  );
  logger.info('User deactivated', { userId });
}

/**
 * List all users (admin only)
 */
export async function listUsers(options?: {
  limit?: number;
  offset?: number;
  role?: string;
}): Promise<{ users: User[]; total: number }> {
  let whereClause = '';
  const params: unknown[] = [];

  if (options?.role) {
    whereClause = 'WHERE role = ?';
    params.push(options.role);
  }

  // Get total count
  const countResult = executeOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM users ${whereClause}`,
    params
  );
  const total = countResult?.count ?? 0;

  // Get users
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const rows = execute<UserRow>(
    `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const users = rows.map(row => ({
    user_id: row.user_id,
    email: row.email,
    display_name: row.display_name ?? undefined,
    role: row.role,
    is_active: Boolean(row.is_active),
    email_verified: Boolean(row.email_verified),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at ?? undefined
  }));

  return { users, total };
}

/**
 * Validate password strength
 */
function validatePasswordStrength(password: string): void {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    throw new Error('Password must be at most 128 characters long');
  }

  // Check for at least one uppercase, lowercase, and number
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    throw new Error('Password must contain at least one number');
  }
}
