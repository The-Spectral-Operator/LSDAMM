/**
 * LSDAMM - Session Manager
 * WebSocket session lifecycle management
 */

import { v4 as uuidv4 } from 'uuid';
import { execute, executeOne, executeRun } from '../db/database.js';
import { hashToken, verifyToken } from '../auth/password_hash.js';
import { logger } from '../util/logging.js';

export type SessionState = 'CONNECTING' | 'AUTHENTICATED' | 'ACTIVE' | 'DISCONNECTED';

export interface Session {
  sessionId: string;
  clientId: string;
  state: SessionState;
  connectedAt: number;
  lastActivityAt: number;
  metadata: Record<string, unknown>;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  /**
   * Create a new session
   */
  async createSession(
    sessionId: string,
    clientId: string,
    authToken: string,
    metadata?: Record<string, unknown>
  ): Promise<Session | null> {
    // Validate client credentials
    const client = executeOne<{
      client_id: string;
      token_hash: string;
      is_active: number;
    }>(
      'SELECT client_id, token_hash, is_active FROM clients WHERE client_id = ?',
      [clientId]
    );

    if (!client || !client.is_active) {
      logger.warn('Client not found or inactive', { clientId });
      return null;
    }

    // Verify auth token
    if (!verifyToken(authToken, client.token_hash)) {
      logger.warn('Invalid auth token', { clientId });
      return null;
    }

    const now = Date.now();
    const session: Session = {
      sessionId,
      clientId,
      state: 'AUTHENTICATED',
      connectedAt: now,
      lastActivityAt: now,
      metadata: metadata ?? {},
    };

    // Store in memory
    this.sessions.set(sessionId, session);

    // Store in database
    executeRun(
      `INSERT INTO sessions (session_id, client_id, state, connected_at, last_activity_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, clientId, 'AUTHENTICATED', now, now, JSON.stringify(metadata ?? {})]
    );

    // Update client last seen
    executeRun(
      'UPDATE clients SET last_seen_at = ?, updated_at = ? WHERE client_id = ?',
      [now, now, clientId]
    );

    logger.info('Session created', { sessionId, clientId });

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Update session state
   */
  updateSessionState(sessionId: string, state: SessionState): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = state;
    session.lastActivityAt = Date.now();

    executeRun(
      'UPDATE sessions SET state = ?, last_activity_at = ? WHERE session_id = ?',
      [state, session.lastActivityAt, sessionId]
    );
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastActivityAt = Date.now();

    executeRun(
      'UPDATE sessions SET last_activity_at = ? WHERE session_id = ?',
      [session.lastActivityAt, sessionId]
    );
  }

  /**
   * End session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = 'DISCONNECTED';

    executeRun(
      'UPDATE sessions SET state = ?, disconnected_at = ? WHERE session_id = ?',
      ['DISCONNECTED', Date.now(), sessionId]
    );

    this.sessions.delete(sessionId);

    logger.info('Session ended', { sessionId, clientId: session.clientId });
  }

  /**
   * Get sessions by client ID
   */
  getSessionsByClientId(clientId: string): Session[] {
    const sessions: Session[] = [];
    for (const session of this.sessions.values()) {
      if (session.clientId === clientId) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  /**
   * Check if client has active session
   */
  hasActiveSession(clientId: string): boolean {
    for (const session of this.sessions.values()) {
      if (session.clientId === clientId && session.state === 'ACTIVE') {
        return true;
      }
    }
    return false;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.state === 'ACTIVE' || session.state === 'AUTHENTICATED') {
        count++;
      }
    }
    return count;
  }

  /**
   * Clean up stale sessions
   */
  cleanupStaleSessions(maxAgeMs: number): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivityAt > maxAgeMs) {
        this.endSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up stale sessions', { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Get all active sessions
   */
  getAllActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(
      s => s.state === 'ACTIVE' || s.state === 'AUTHENTICATED'
    );
  }
}

/**
 * Register a new client (for admin use)
 */
export async function registerClient(
  clientId: string,
  clientName: string,
  clientType: string,
  capabilities?: Record<string, boolean>
): Promise<{ clientId: string; authToken: string }> {
  // Generate auth token
  const crypto = await import('node:crypto');
  const authToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(authToken);

  const now = Date.now();

  executeRun(
    `INSERT INTO clients (client_id, client_name, client_type, token_hash, capabilities, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [clientId, clientName, clientType, tokenHash, JSON.stringify(capabilities ?? {}), now, now]
  );

  logger.info('Client registered', { clientId, clientName, clientType });

  return { clientId, authToken };
}

/**
 * Regenerate client auth token
 */
export async function regenerateClientToken(clientId: string): Promise<string | null> {
  const client = executeOne<{ client_id: string }>(
    'SELECT client_id FROM clients WHERE client_id = ?',
    [clientId]
  );

  if (!client) {
    return null;
  }

  const crypto = await import('node:crypto');
  const authToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(authToken);

  executeRun(
    'UPDATE clients SET token_hash = ?, updated_at = ? WHERE client_id = ?',
    [tokenHash, Date.now(), clientId]
  );

  logger.info('Client token regenerated', { clientId });

  return authToken;
}

/**
 * Deactivate client
 */
export function deactivateClient(clientId: string): void {
  executeRun(
    'UPDATE clients SET is_active = 0, updated_at = ? WHERE client_id = ?',
    [Date.now(), clientId]
  );

  logger.info('Client deactivated', { clientId });
}

/**
 * List all clients
 */
export function listClients(): Array<{
  clientId: string;
  clientName: string;
  clientType: string;
  isActive: boolean;
  lastSeenAt?: number;
}> {
  const rows = execute<{
    client_id: string;
    client_name: string;
    client_type: string;
    is_active: number;
    last_seen_at: number | null;
  }>(
    'SELECT client_id, client_name, client_type, is_active, last_seen_at FROM clients ORDER BY created_at DESC',
    []
  );

  return rows.map(row => ({
    clientId: row.client_id,
    clientName: row.client_name,
    clientType: row.client_type,
    isActive: Boolean(row.is_active),
    lastSeenAt: row.last_seen_at ?? undefined,
  }));
}
