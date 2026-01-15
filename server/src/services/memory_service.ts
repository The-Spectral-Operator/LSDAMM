/**
 * LSDAMM - Memory Service
 * SQLite-based active storage and recall for memories, messages, and chain of thought
 * Supports session-separate memories, session continuity, and tiered memory storage
 * 
 * Memory Tiers:
 * - Hot (in-memory): Up to 1000 most recent/important memories per session
 * - Cold (SQLite): All memories persisted for retrieval
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database.js';
import { logger } from '../util/logging.js';

// Constants
const MAX_HOT_MEMORIES_PER_SESSION = 1000;
const MAX_MESSAGES_PER_SESSION = 1000; // Excluding code edits

export interface Session {
  id: string;
  userId: string;
  title?: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  maxMessages: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  sessionId?: string;
  userId: string;
  title?: string;
  provider?: string;
  model?: string;
  systemPrompt?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface Message {
  id: string;
  conversationId: string;
  sessionId?: string;
  role: 'system' | 'user' | 'assistant' | 'thinking';
  content: string;
  thinkingContent?: string;
  isCodeEdit: boolean;
  tokensUsed?: number;
  latencyMs?: number;
  provider?: string;
  model?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface SessionMemory {
  id: string;
  sessionId: string;
  userId: string;
  provider: string;
  model: string;
  category: 'fact' | 'preference' | 'context' | 'instruction' | 'summary' | 'code_context';
  content: string;
  embedding?: number[];
  importance: number;
  recallCount: number;
  lastRecalledAt?: number;
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface Memory {
  id: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  category: 'fact' | 'preference' | 'context' | 'instruction' | 'summary';
  content: string;
  embedding?: number[];
  importance: number;
  recallCount: number;
  lastRecalledAt?: number;
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ChainOfThoughtStep {
  id: string;
  messageId: string;
  stepNumber: number;
  thoughtType: 'observation' | 'reasoning' | 'hypothesis' | 'conclusion' | 'action';
  content: string;
  confidence: number;
  createdAt: number;
}

export interface SessionContinuity {
  id: string;
  sessionId: string;
  userId: string;
  lastMessageId?: string;
  contextSummary?: string;
  resumePrompt?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  messageId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath?: string;
  thumbnailPath?: string;
  extractedText?: string;
  createdAt: number;
}

/**
 * In-memory cache for hot memories (LRU-style)
 */
class HotMemoryCache {
  private cache: Map<string, Map<string, SessionMemory>> = new Map();
  private accessOrder: Map<string, string[]> = new Map();

  getSessionMemories(sessionId: string): SessionMemory[] {
    const sessionCache = this.cache.get(sessionId);
    if (!sessionCache) return [];
    return Array.from(sessionCache.values());
  }

  addMemory(memory: SessionMemory): SessionMemory | null {
    let sessionCache = this.cache.get(memory.sessionId);
    let order = this.accessOrder.get(memory.sessionId);

    if (!sessionCache) {
      sessionCache = new Map();
      this.cache.set(memory.sessionId, sessionCache);
      order = [];
      this.accessOrder.set(memory.sessionId, order);
    }

    let evicted: SessionMemory | null = null;
    if (sessionCache.size >= MAX_HOT_MEMORIES_PER_SESSION && !sessionCache.has(memory.id)) {
      const evictId = order!.shift();
      if (evictId) {
        evicted = sessionCache.get(evictId) || null;
        sessionCache.delete(evictId);
      }
    }

    sessionCache.set(memory.id, memory);
    
    const existingIndex = order!.indexOf(memory.id);
    if (existingIndex !== -1) {
      order!.splice(existingIndex, 1);
    }
    order!.push(memory.id);

    return evicted;
  }

  touchMemory(sessionId: string, memoryId: string): void {
    const order = this.accessOrder.get(sessionId);
    if (!order) return;

    const index = order.indexOf(memoryId);
    if (index !== -1) {
      order.splice(index, 1);
      order.push(memoryId);
    }
  }

  removeMemory(sessionId: string, memoryId: string): void {
    const sessionCache = this.cache.get(sessionId);
    const order = this.accessOrder.get(sessionId);

    if (sessionCache) {
      sessionCache.delete(memoryId);
    }
    if (order) {
      const index = order.indexOf(memoryId);
      if (index !== -1) {
        order.splice(index, 1);
      }
    }
  }

  clearSession(sessionId: string): void {
    this.cache.delete(sessionId);
    this.accessOrder.delete(sessionId);
  }

  getStats(): { sessions: number; totalMemories: number } {
    let totalMemories = 0;
    for (const sessionCache of this.cache.values()) {
      totalMemories += sessionCache.size;
    }
    return { sessions: this.cache.size, totalMemories };
  }
}

/**
 * Memory Service class for managing sessions, conversations, messages, and memories
 */
export class MemoryService {
  private hotCache: HotMemoryCache = new HotMemoryCache();

  async createSession(userId: string, options: {
    provider: string;
    model: string;
    title?: string;
    systemPrompt?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Session> {
    const db = getDb();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO sessions (id, user_id, title, provider, model, system_prompt, max_messages, is_active, created_at, updated_at, last_accessed_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(id, userId, options.title || null, options.provider, options.model, options.systemPrompt || null, MAX_MESSAGES_PER_SESSION, now, now, now, options.metadata ? JSON.stringify(options.metadata) : null);

    logger.info('Created session', { id, userId, provider: options.provider, model: options.model });

    return {
      id, userId, title: options.title, provider: options.provider, model: options.model,
      systemPrompt: options.systemPrompt, maxMessages: MAX_MESSAGES_PER_SESSION, isActive: true,
      createdAt: now, updatedAt: now, lastAccessedAt: now, metadata: options.metadata,
    };
  }

  async getSession(id: string): Promise<Session | null> {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE sessions SET last_accessed_at = ? WHERE id = ?`).run(now, id);

    return {
      id: row.id as string, userId: row.user_id as string, title: row.title as string | undefined,
      provider: row.provider as string, model: row.model as string, systemPrompt: row.system_prompt as string | undefined,
      maxMessages: row.max_messages as number, isActive: row.is_active === 1, createdAt: row.created_at as number,
      updatedAt: row.updated_at as number, lastAccessedAt: now, metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }

  async getUserSessions(userId: string, options?: { limit?: number; offset?: number; provider?: string; model?: string; activeOnly?: boolean }): Promise<Session[]> {
    const db = getDb();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let sql = `SELECT * FROM sessions WHERE user_id = ?`;
    const params: (string | number)[] = [userId];

    if (options?.provider) { sql += ` AND provider = ?`; params.push(options.provider); }
    if (options?.model) { sql += ` AND model = ?`; params.push(options.model); }
    if (options?.activeOnly) { sql += ` AND is_active = 1`; }

    sql += ` ORDER BY last_accessed_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      id: row.id as string, userId: row.user_id as string, title: row.title as string | undefined,
      provider: row.provider as string, model: row.model as string, systemPrompt: row.system_prompt as string | undefined,
      maxMessages: row.max_messages as number, isActive: row.is_active === 1, createdAt: row.created_at as number,
      updatedAt: row.updated_at as number, lastAccessedAt: row.last_accessed_at as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  async resumeSession(sessionId: string): Promise<{ session: Session; messages: Message[]; memories: SessionMemory[]; continuity: SessionContinuity | null } | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const messages = await this.getSessionMessages(sessionId, { limit: 100 });
    const memories = await this.loadSessionMemoriesToHotCache(sessionId);
    const continuity = await this.getSessionContinuity(sessionId);

    logger.info('Resumed session', { sessionId, messagesLoaded: messages.length, memoriesLoaded: memories.length });
    return { session, messages, memories, continuity };
  }

  async createConversation(userId: string, options?: { sessionId?: string; title?: string; provider?: string; model?: string; systemPrompt?: string; metadata?: Record<string, unknown> }): Promise<Conversation> {
    const db = getDb();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`INSERT INTO conversations (id, session_id, user_id, title, provider, model, system_prompt, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, options?.sessionId || null, userId, options?.title || null, options?.provider || null, options?.model || null, options?.systemPrompt || null, now, now, options?.metadata ? JSON.stringify(options.metadata) : null);

    logger.info('Created conversation', { id, userId, sessionId: options?.sessionId });
    return { id, sessionId: options?.sessionId, userId, title: options?.title, provider: options?.provider, model: options?.model, systemPrompt: options?.systemPrompt, createdAt: now, updatedAt: now, metadata: options?.metadata };
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as string, sessionId: row.session_id as string | undefined, userId: row.user_id as string,
      title: row.title as string | undefined, provider: row.provider as string | undefined,
      model: row.model as string | undefined, systemPrompt: row.system_prompt as string | undefined,
      createdAt: row.created_at as number, updatedAt: row.updated_at as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }

  async getUserConversations(userId: string, options?: { sessionId?: string; limit?: number; offset?: number }): Promise<Conversation[]> {
    const db = getDb();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let sql = `SELECT * FROM conversations WHERE user_id = ?`;
    const params: (string | number)[] = [userId];
    if (options?.sessionId) { sql += ` AND session_id = ?`; params.push(options.sessionId); }
    sql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      id: row.id as string, sessionId: row.session_id as string | undefined, userId: row.user_id as string,
      title: row.title as string | undefined, provider: row.provider as string | undefined,
      model: row.model as string | undefined, systemPrompt: row.system_prompt as string | undefined,
      createdAt: row.created_at as number, updatedAt: row.updated_at as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  async addMessage(conversationId: string, options: { sessionId?: string; role: 'system' | 'user' | 'assistant' | 'thinking'; content: string; thinkingContent?: string; isCodeEdit?: boolean; tokensUsed?: number; latencyMs?: number; provider?: string; model?: string; metadata?: Record<string, unknown> }): Promise<Message> {
    const db = getDb();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const isCodeEdit = options.isCodeEdit ?? false;

    if (options.sessionId && !isCodeEdit) {
      const countResult = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND is_code_edit = 0`).get(options.sessionId) as { count: number };
      if (countResult.count >= MAX_MESSAGES_PER_SESSION) {
        logger.warn('Session message limit reached', { sessionId: options.sessionId, limit: MAX_MESSAGES_PER_SESSION });
      }
    }

    db.prepare(`INSERT INTO messages (id, conversation_id, session_id, role, content, thinking_content, is_code_edit, tokens_used, latency_ms, provider, model, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, conversationId, options.sessionId || null, options.role, options.content, options.thinkingContent || null, isCodeEdit ? 1 : 0, options.tokensUsed || null, options.latencyMs || null, options.provider || null, options.model || null, now, options.metadata ? JSON.stringify(options.metadata) : null);

    db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, conversationId);
    if (options.sessionId) {
      db.prepare(`UPDATE sessions SET updated_at = ?, last_accessed_at = ? WHERE id = ?`).run(now, now, options.sessionId);
    }

    logger.debug('Added message', { id, conversationId, sessionId: options.sessionId, role: options.role, isCodeEdit });
    return { id, conversationId, sessionId: options.sessionId, role: options.role, content: options.content, thinkingContent: options.thinkingContent, isCodeEdit, tokensUsed: options.tokensUsed, latencyMs: options.latencyMs, provider: options.provider, model: options.model, createdAt: now, metadata: options.metadata };
  }

  async getSessionMessages(sessionId: string, options?: { limit?: number; beforeId?: string; includeCodeEdits?: boolean }): Promise<Message[]> {
    const db = getDb();
    const limit = options?.limit ?? 100;

    let query = `SELECT * FROM messages WHERE session_id = ?`;
    const params: (string | number)[] = [sessionId];
    if (options?.beforeId) { query += ` AND created_at < (SELECT created_at FROM messages WHERE id = ?)`; params.push(options.beforeId); }
    if (options?.includeCodeEdits === false) { query += ` AND is_code_edit = 0`; }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.reverse().map(row => ({
      id: row.id as string, conversationId: row.conversation_id as string, sessionId: row.session_id as string | undefined,
      role: row.role as 'system' | 'user' | 'assistant' | 'thinking', content: row.content as string,
      thinkingContent: row.thinking_content as string | undefined, isCodeEdit: row.is_code_edit === 1,
      tokensUsed: row.tokens_used as number | undefined, latencyMs: row.latency_ms as number | undefined,
      provider: row.provider as string | undefined, model: row.model as string | undefined,
      createdAt: row.created_at as number, metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  async getConversationMessages(conversationId: string, options?: { limit?: number; beforeId?: string }): Promise<Message[]> {
    const db = getDb();
    const limit = options?.limit ?? 100;

    let query = `SELECT * FROM messages WHERE conversation_id = ?`;
    const params: (string | number)[] = [conversationId];
    if (options?.beforeId) { query += ` AND created_at < (SELECT created_at FROM messages WHERE id = ?)`; params.push(options.beforeId); }
    query += ` ORDER BY created_at ASC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      id: row.id as string, conversationId: row.conversation_id as string, sessionId: row.session_id as string | undefined,
      role: row.role as 'system' | 'user' | 'assistant' | 'thinking', content: row.content as string,
      thinkingContent: row.thinking_content as string | undefined, isCodeEdit: row.is_code_edit === 1,
      tokensUsed: row.tokens_used as number | undefined, latencyMs: row.latency_ms as number | undefined,
      provider: row.provider as string | undefined, model: row.model as string | undefined,
      createdAt: row.created_at as number, metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  async storeSessionMemory(options: { sessionId: string; userId: string; provider: string; model: string; category: 'fact' | 'preference' | 'context' | 'instruction' | 'summary' | 'code_context'; content: string; embedding?: number[]; importance?: number; expiresAt?: number; metadata?: Record<string, unknown> }): Promise<SessionMemory> {
    const db = getDb();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const importance = options.importance ?? 0.5;

    db.prepare(`INSERT INTO session_memories (id, session_id, user_id, provider, model, category, content, embedding, importance, recall_count, created_at, expires_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
      .run(id, options.sessionId, options.userId, options.provider, options.model, options.category, options.content, options.embedding ? JSON.stringify(options.embedding) : null, importance, now, options.expiresAt || null, options.metadata ? JSON.stringify(options.metadata) : null);

    const memory: SessionMemory = { id, sessionId: options.sessionId, userId: options.userId, provider: options.provider, model: options.model, category: options.category, content: options.content, embedding: options.embedding, importance, recallCount: 0, createdAt: now, expiresAt: options.expiresAt, metadata: options.metadata };

    const evicted = this.hotCache.addMemory(memory);
    if (evicted) { logger.debug('Evicted memory from hot cache', { evictedId: evicted.id, sessionId: options.sessionId }); }

    logger.info('Stored session memory', { id, sessionId: options.sessionId, category: options.category });
    return memory;
  }

  async getSessionMemories(sessionId: string, options?: { category?: string; limit?: number; minImportance?: number; useHotCacheOnly?: boolean }): Promise<SessionMemory[]> {
    const limit = options?.limit ?? 50;
    const minImportance = options?.minImportance ?? 0;

    let memories = this.hotCache.getSessionMemories(sessionId);
    if (options?.category) { memories = memories.filter(m => m.category === options.category); }
    memories = memories.filter(m => m.importance >= minImportance);

    if (memories.length >= limit || options?.useHotCacheOnly) { return memories.slice(0, limit); }

    const db = getDb();
    const hotIds = new Set(memories.map(m => m.id));

    let sql = `SELECT * FROM session_memories WHERE session_id = ? AND importance >= ?`;
    const params: (string | number)[] = [sessionId, minImportance];
    if (options?.category) { sql += ` AND category = ?`; params.push(options.category); }
    sql += ` AND (expires_at IS NULL OR expires_at > ?)`;
    params.push(Math.floor(Date.now() / 1000));
    sql += ` ORDER BY importance DESC, last_recalled_at DESC NULLS LAST LIMIT ?`;
    params.push(limit * 2);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    for (const row of rows) {
      if (!hotIds.has(row.id as string) && memories.length < limit) {
        memories.push({
          id: row.id as string, sessionId: row.session_id as string, userId: row.user_id as string,
          provider: row.provider as string, model: row.model as string,
          category: row.category as 'fact' | 'preference' | 'context' | 'instruction' | 'summary' | 'code_context',
          content: row.content as string, embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
          importance: row.importance as number, recallCount: row.recall_count as number,
          lastRecalledAt: row.last_recalled_at as number | undefined, createdAt: row.created_at as number,
          expiresAt: row.expires_at as number | undefined, metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
        });
      }
    }

    return memories.slice(0, limit);
  }

  private async loadSessionMemoriesToHotCache(sessionId: string): Promise<SessionMemory[]> {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM session_memories WHERE session_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY importance DESC, last_recalled_at DESC NULLS LAST LIMIT ?`)
      .all(sessionId, Math.floor(Date.now() / 1000), MAX_HOT_MEMORIES_PER_SESSION) as Array<Record<string, unknown>>;

    const memories: SessionMemory[] = [];
    for (const row of rows) {
      const memory: SessionMemory = {
        id: row.id as string, sessionId: row.session_id as string, userId: row.user_id as string,
        provider: row.provider as string, model: row.model as string,
        category: row.category as 'fact' | 'preference' | 'context' | 'instruction' | 'summary' | 'code_context',
        content: row.content as string, embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
        importance: row.importance as number, recallCount: row.recall_count as number,
        lastRecalledAt: row.last_recalled_at as number | undefined, createdAt: row.created_at as number,
        expiresAt: row.expires_at as number | undefined, metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      };
      this.hotCache.addMemory(memory);
      memories.push(memory);
    }
    return memories;
  }

  async searchSessionMemories(sessionId: string, query: string, options?: { category?: string; limit?: number }): Promise<SessionMemory[]> {
    const db = getDb();
    const limit = options?.limit ?? 10;

    let sql = `SELECT m.* FROM session_memories m JOIN session_memories_fts fts ON m.rowid = fts.rowid WHERE fts.content MATCH ? AND m.session_id = ?`;
    const params: (string | number)[] = [query, sessionId];
    if (options?.category) { sql += ` AND m.category = ?`; params.push(options.category); }
    sql += ` ORDER BY rank, m.importance DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    const now = Math.floor(Date.now() / 1000);
    const memories: SessionMemory[] = [];

    for (const row of rows) {
      db.prepare(`UPDATE session_memories SET recall_count = recall_count + 1, last_recalled_at = ? WHERE id = ?`).run(now, row.id);
      const memory: SessionMemory = {
        id: row.id as string, sessionId: row.session_id as string, userId: row.user_id as string,
        provider: row.provider as string, model: row.model as string,
        category: row.category as 'fact' | 'preference' | 'context' | 'instruction' | 'summary' | 'code_context',
        content: row.content as string, embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
        importance: row.importance as number, recallCount: (row.recall_count as number) + 1,
        lastRecalledAt: now, createdAt: row.created_at as number,
        expiresAt: row.expires_at as number | undefined, metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      };
      this.hotCache.addMemory(memory);
      memories.push(memory);
    }
    return memories;
  }

  async storeMemory(userId: string, options: { conversationId?: string; messageId?: string; category: 'fact' | 'preference' | 'context' | 'instruction' | 'summary'; content: string; embedding?: number[]; importance?: number; expiresAt?: number; metadata?: Record<string, unknown> }): Promise<Memory> {
    const db = getDb();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`INSERT INTO memories (id, user_id, conversation_id, message_id, category, content, embedding, importance, recall_count, created_at, expires_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
      .run(id, userId, options.conversationId || null, options.messageId || null, options.category, options.content, options.embedding ? JSON.stringify(options.embedding) : null, options.importance ?? 0.5, now, options.expiresAt || null, options.metadata ? JSON.stringify(options.metadata) : null);

    logger.info('Stored global memory', { id, userId, category: options.category });
    return { id, userId, conversationId: options.conversationId, messageId: options.messageId, category: options.category, content: options.content, embedding: options.embedding, importance: options.importance ?? 0.5, recallCount: 0, createdAt: now, expiresAt: options.expiresAt, metadata: options.metadata };
  }

  async searchMemories(userId: string, query: string, options?: { category?: string; limit?: number }): Promise<Memory[]> {
    const db = getDb();
    const limit = options?.limit ?? 10;

    let sql = `SELECT m.* FROM memories m JOIN memories_fts fts ON m.rowid = fts.rowid WHERE fts.content MATCH ? AND m.user_id = ?`;
    const params: (string | number)[] = [query, userId];
    if (options?.category) { sql += ` AND m.category = ?`; params.push(options.category); }
    sql += ` ORDER BY rank, m.importance DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    const now = Math.floor(Date.now() / 1000);

    for (const row of rows) {
      db.prepare(`UPDATE memories SET recall_count = recall_count + 1, last_recalled_at = ? WHERE id = ?`).run(now, row.id);
    }

    return rows.map(row => ({
      id: row.id as string, userId: row.user_id as string, conversationId: row.conversation_id as string | undefined,
      messageId: row.message_id as string | undefined, category: row.category as 'fact' | 'preference' | 'context' | 'instruction' | 'summary',
      content: row.content as string, embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
      importance: row.importance as number, recallCount: (row.recall_count as number) + 1, lastRecalledAt: now,
      createdAt: row.created_at as number, expiresAt: row.expires_at as number | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  async getRelevantMemories(userId: string, options?: { conversationId?: string; categories?: string[]; limit?: number; minImportance?: number }): Promise<Memory[]> {
    const db = getDb();
    const limit = options?.limit ?? 20;
    const minImportance = options?.minImportance ?? 0;

    let sql = `SELECT * FROM memories WHERE user_id = ? AND importance >= ?`;
    const params: (string | number)[] = [userId, minImportance];
    if (options?.conversationId) { sql += ` AND (conversation_id = ? OR conversation_id IS NULL)`; params.push(options.conversationId); }
    if (options?.categories && options.categories.length > 0) { sql += ` AND category IN (${options.categories.map(() => '?').join(',')})`; params.push(...options.categories); }
    sql += ` AND (expires_at IS NULL OR expires_at > ?)`; params.push(Math.floor(Date.now() / 1000));
    sql += ` ORDER BY importance DESC, last_recalled_at DESC NULLS LAST LIMIT ?`; params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      id: row.id as string, userId: row.user_id as string, conversationId: row.conversation_id as string | undefined,
      messageId: row.message_id as string | undefined, category: row.category as 'fact' | 'preference' | 'context' | 'instruction' | 'summary',
      content: row.content as string, embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
      importance: row.importance as number, recallCount: row.recall_count as number,
      lastRecalledAt: row.last_recalled_at as number | undefined, createdAt: row.created_at as number,
      expiresAt: row.expires_at as number | undefined, metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  async saveSessionContinuity(sessionId: string, userId: string, options: { lastMessageId?: string; contextSummary?: string; resumePrompt?: string }): Promise<SessionContinuity> {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const existing = db.prepare(`SELECT id FROM session_continuity WHERE session_id = ?`).get(sessionId) as { id: string } | undefined;

    if (existing) {
      db.prepare(`UPDATE session_continuity SET last_message_id = ?, context_summary = ?, resume_prompt = ?, updated_at = ? WHERE session_id = ?`)
        .run(options.lastMessageId || null, options.contextSummary || null, options.resumePrompt || null, now, sessionId);
      return { id: existing.id, sessionId, userId, lastMessageId: options.lastMessageId, contextSummary: options.contextSummary, resumePrompt: options.resumePrompt, createdAt: now, updatedAt: now };
    }

    const id = randomUUID();
    db.prepare(`INSERT INTO session_continuity (id, session_id, user_id, last_message_id, context_summary, resume_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, sessionId, userId, options.lastMessageId || null, options.contextSummary || null, options.resumePrompt || null, now, now);

    logger.debug('Saved session continuity', { sessionId });
    return { id, sessionId, userId, lastMessageId: options.lastMessageId, contextSummary: options.contextSummary, resumePrompt: options.resumePrompt, createdAt: now, updatedAt: now };
  }

  async getSessionContinuity(sessionId: string): Promise<SessionContinuity | null> {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM session_continuity WHERE session_id = ?`).get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as string, sessionId: row.session_id as string, userId: row.user_id as string,
      lastMessageId: row.last_message_id as string | undefined, contextSummary: row.context_summary as string | undefined,
      resumePrompt: row.resume_prompt as string | undefined, createdAt: row.created_at as number, updatedAt: row.updated_at as number,
    };
  }

  async storeChainOfThought(messageId: string, steps: Array<{ thoughtType: 'observation' | 'reasoning' | 'hypothesis' | 'conclusion' | 'action'; content: string; confidence?: number }>): Promise<ChainOfThoughtStep[]> {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const results: ChainOfThoughtStep[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const id = randomUUID();
      db.prepare(`INSERT INTO chain_of_thought (id, message_id, step_number, thought_type, content, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, messageId, i + 1, step.thoughtType, step.content, step.confidence ?? 0.5, now);
      results.push({ id, messageId, stepNumber: i + 1, thoughtType: step.thoughtType, content: step.content, confidence: step.confidence ?? 0.5, createdAt: now });
    }

    logger.debug('Stored chain of thought', { messageId, steps: steps.length });
    return results;
  }

  async getChainOfThought(messageId: string): Promise<ChainOfThoughtStep[]> {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM chain_of_thought WHERE message_id = ? ORDER BY step_number ASC`).all(messageId) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      id: row.id as string, messageId: row.message_id as string, stepNumber: row.step_number as number,
      thoughtType: row.thought_type as 'observation' | 'reasoning' | 'hypothesis' | 'conclusion' | 'action',
      content: row.content as string, confidence: row.confidence as number, createdAt: row.created_at as number,
    }));
  }

  parseThinkingToChainOfThought(thinkingContent: string): Array<{ thoughtType: 'observation' | 'reasoning' | 'hypothesis' | 'conclusion' | 'action'; content: string; confidence: number }> {
    const steps: Array<{ thoughtType: 'observation' | 'reasoning' | 'hypothesis' | 'conclusion' | 'action'; content: string; confidence: number }> = [];
    const lines = thinkingContent.split(/\n+/);
    let currentType: 'observation' | 'reasoning' | 'hypothesis' | 'conclusion' | 'action' = 'observation';
    let currentContent = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const lowerLine = trimmed.toLowerCase();
      if (lowerLine.includes('observe') || lowerLine.includes('notice') || lowerLine.includes('see that')) {
        if (currentContent) { steps.push({ thoughtType: currentType, content: currentContent.trim(), confidence: 0.7 }); }
        currentType = 'observation'; currentContent = trimmed;
      } else if (lowerLine.includes('therefore') || lowerLine.includes('because') || lowerLine.includes('reason')) {
        if (currentContent) { steps.push({ thoughtType: currentType, content: currentContent.trim(), confidence: 0.7 }); }
        currentType = 'reasoning'; currentContent = trimmed;
      } else if (lowerLine.includes('hypothesis') || lowerLine.includes('assume') || lowerLine.includes('if')) {
        if (currentContent) { steps.push({ thoughtType: currentType, content: currentContent.trim(), confidence: 0.7 }); }
        currentType = 'hypothesis'; currentContent = trimmed;
      } else if (lowerLine.includes('conclude') || lowerLine.includes('finally') || lowerLine.includes('in summary')) {
        if (currentContent) { steps.push({ thoughtType: currentType, content: currentContent.trim(), confidence: 0.7 }); }
        currentType = 'conclusion'; currentContent = trimmed;
      } else if (lowerLine.includes('should') || lowerLine.includes('will') || lowerLine.includes('action')) {
        if (currentContent) { steps.push({ thoughtType: currentType, content: currentContent.trim(), confidence: 0.7 }); }
        currentType = 'action'; currentContent = trimmed;
      } else {
        currentContent += ' ' + trimmed;
      }
    }

    if (currentContent) { steps.push({ thoughtType: currentType, content: currentContent.trim(), confidence: 0.7 }); }
    return steps;
  }

  async deleteSession(id: string): Promise<void> {
    const db = getDb();
    this.hotCache.clearSession(id);
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
    logger.info('Deleted session', { id });
  }

  async deleteConversation(id: string): Promise<void> {
    const db = getDb();
    db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
    logger.info('Deleted conversation', { id });
  }

  async cleanupExpiredMemories(): Promise<number> {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const globalResult = db.prepare(`DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?`).run(now);
    const sessionResult = db.prepare(`DELETE FROM session_memories WHERE expires_at IS NOT NULL AND expires_at < ?`).run(now);
    const deleted = globalResult.changes + sessionResult.changes;
    if (deleted > 0) { logger.info('Cleaned up expired memories', { global: globalResult.changes, session: sessionResult.changes }); }
    return deleted;
  }

  getHotCacheStats(): { sessions: number; totalMemories: number } {
    return this.hotCache.getStats();
  }
}

export const memoryService = new MemoryService();
