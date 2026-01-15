/**
 * LSDAMM - Message Router
 * Message validation and routing logic
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { v4 as uuidv4 } from 'uuid';
import { executeRun } from '../db/database.js';
import { logger } from '../util/logging.js';

// Message types
export type MessageType =
  | 'REGISTER'
  | 'REGISTER_ACK'
  | 'WELCOME'
  | 'HEARTBEAT'
  | 'HEARTBEAT_ACK'
  | 'MESSAGE'
  | 'RESPONSE'
  | 'STREAM_CHUNK'
  | 'STREAM_END'
  | 'QUERY'
  | 'COMMAND'
  | 'COMMAND_RESULT'
  | 'EVENT'
  | 'BROADCAST'
  | 'SUBSCRIBE'
  | 'SUBSCRIBE_ACK'
  | 'UNSUBSCRIBE'
  | 'UNSUBSCRIBE_ACK'
  | 'ERROR';

export interface MessageEnvelope {
  messageId: string;
  version: string;
  type: MessageType;
  source: {
    clientId: string;
    sessionId: string;
  };
  target?: {
    clientId?: string;
    group?: string;
    all?: boolean;
  };
  correlationId?: string;
  inReplyTo?: string;
  timestamp: number;
  priority: number;
  expiresAt?: number;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Set up AJV validator
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Message envelope schema
const messageEnvelopeSchema = {
  type: 'object',
  required: ['messageId', 'version', 'type', 'source', 'timestamp', 'payload'],
  properties: {
    messageId: { type: 'string', format: 'uuid' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+$' },
    type: {
      type: 'string',
      enum: [
        'REGISTER', 'REGISTER_ACK', 'WELCOME',
        'HEARTBEAT', 'HEARTBEAT_ACK',
        'MESSAGE', 'RESPONSE', 'STREAM_CHUNK', 'STREAM_END',
        'QUERY', 'COMMAND', 'COMMAND_RESULT',
        'EVENT', 'BROADCAST',
        'SUBSCRIBE', 'SUBSCRIBE_ACK', 'UNSUBSCRIBE', 'UNSUBSCRIBE_ACK',
        'ERROR'
      ]
    },
    source: {
      type: 'object',
      required: ['clientId', 'sessionId'],
      properties: {
        clientId: { type: 'string' },
        sessionId: { type: 'string' }
      }
    },
    target: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        group: { type: 'string' },
        all: { type: 'boolean' }
      }
    },
    correlationId: { type: 'string', format: 'uuid' },
    inReplyTo: { type: 'string', format: 'uuid' },
    timestamp: { type: 'integer', minimum: 0 },
    priority: { type: 'integer', minimum: 0, maximum: 10 },
    expiresAt: { type: 'integer', minimum: 0 },
    payload: { type: 'object' },
    metadata: { type: 'object' }
  }
};

const validateSchema = ajv.compile(messageEnvelopeSchema);

/**
 * Validate a message against the schema
 */
export function validateMessage(message: unknown): boolean {
  const valid = validateSchema(message);
  
  if (!valid && validateSchema.errors) {
    logger.debug('Message validation failed', { 
      errors: validateSchema.errors.map(e => `${e.instancePath} ${e.message}`)
    });
  }
  
  return valid;
}

/**
 * Create a new message envelope
 */
export function createMessage(
  type: MessageType,
  payload: Record<string, unknown>,
  options?: {
    source?: { clientId: string; sessionId: string };
    target?: { clientId?: string; group?: string; all?: boolean };
    correlationId?: string;
    inReplyTo?: string;
    priority?: number;
    expiresAt?: number;
    metadata?: Record<string, unknown>;
  }
): MessageEnvelope {
  return {
    messageId: uuidv4(),
    version: '1.0',
    type,
    source: options?.source ?? { clientId: 'server', sessionId: 'server' },
    target: options?.target,
    correlationId: options?.correlationId,
    inReplyTo: options?.inReplyTo,
    timestamp: Date.now(),
    priority: options?.priority ?? 5,
    expiresAt: options?.expiresAt,
    payload,
    metadata: options?.metadata,
  };
}

/**
 * Persist message to database (for audit log)
 */
export function persistMessage(message: MessageEnvelope): void {
  try {
    executeRun(
      `INSERT INTO messages (
        message_id, type, source_client_id, source_session_id,
        target_client_id, target_group, correlation_id, in_reply_to,
        priority, payload, metadata, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.messageId,
        message.type,
        message.source.clientId,
        message.source.sessionId,
        message.target?.clientId ?? null,
        message.target?.group ?? null,
        message.correlationId ?? null,
        message.inReplyTo ?? null,
        message.priority,
        JSON.stringify(message.payload),
        JSON.stringify(message.metadata ?? {}),
        message.timestamp,
        message.expiresAt ?? null,
      ]
    );
  } catch (error) {
    logger.error('Failed to persist message', { messageId: message.messageId, error });
  }
}

/**
 * Mark message as delivered
 */
export function markDelivered(messageId: string): void {
  try {
    executeRun(
      'UPDATE messages SET delivered_at = ? WHERE message_id = ?',
      [Date.now(), messageId]
    );
  } catch (error) {
    logger.error('Failed to mark message as delivered', { messageId, error });
  }
}

/**
 * Queue message for later delivery
 */
export function queueMessage(messageId: string, targetClientId: string): void {
  try {
    executeRun(
      `INSERT INTO pending_messages (message_id, target_client_id, next_retry_at)
       VALUES (?, ?, ?)`,
      [messageId, targetClientId, Date.now() + 5000] // Retry in 5 seconds
    );
  } catch (error) {
    logger.error('Failed to queue message', { messageId, error });
  }
}

/**
 * Get pending messages for a client
 */
export function getPendingMessages(clientId: string): MessageEnvelope[] {
  const { execute } = require('../db/database.js');
  
  const pending = execute<{ message_id: string }>(
    `SELECT message_id FROM pending_messages 
     WHERE target_client_id = ? AND retry_count < 5
     ORDER BY created_at ASC`,
    [clientId]
  );

  const messages: MessageEnvelope[] = [];

  for (const row of pending) {
    const messageRow = execute<{
      message_id: string;
      type: string;
      source_client_id: string;
      source_session_id: string;
      target_client_id: string | null;
      target_group: string | null;
      correlation_id: string | null;
      in_reply_to: string | null;
      priority: number;
      payload: string;
      metadata: string;
      created_at: number;
      expires_at: number | null;
    }>(
      'SELECT * FROM messages WHERE message_id = ?',
      [row.message_id]
    );

    if (messageRow.length > 0) {
      const m = messageRow[0];
      
      // Check if expired
      if (m.expires_at && m.expires_at < Date.now()) {
        // Remove from pending
        executeRun('DELETE FROM pending_messages WHERE message_id = ?', [row.message_id]);
        continue;
      }

      messages.push({
        messageId: m.message_id,
        version: '1.0',
        type: m.type as MessageType,
        source: {
          clientId: m.source_client_id,
          sessionId: m.source_session_id,
        },
        target: {
          clientId: m.target_client_id ?? undefined,
          group: m.target_group ?? undefined,
        },
        correlationId: m.correlation_id ?? undefined,
        inReplyTo: m.in_reply_to ?? undefined,
        timestamp: m.created_at,
        priority: m.priority,
        expiresAt: m.expires_at ?? undefined,
        payload: JSON.parse(m.payload),
        metadata: JSON.parse(m.metadata),
      });
    }
  }

  return messages;
}

/**
 * Remove pending message after delivery
 */
export function removePendingMessage(messageId: string): void {
  try {
    executeRun('DELETE FROM pending_messages WHERE message_id = ?', [messageId]);
  } catch (error) {
    logger.error('Failed to remove pending message', { messageId, error });
  }
}

/**
 * Increment retry count for pending message
 */
export function incrementRetryCount(messageId: string): void {
  try {
    executeRun(
      `UPDATE pending_messages 
       SET retry_count = retry_count + 1, next_retry_at = ?
       WHERE message_id = ?`,
      [Date.now() + 30000, messageId] // Next retry in 30 seconds
    );
  } catch (error) {
    logger.error('Failed to increment retry count', { messageId, error });
  }
}
