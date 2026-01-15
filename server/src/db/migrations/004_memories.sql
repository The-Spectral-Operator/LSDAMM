-- Migration: 004_memories
-- Purpose: Memory system for storing messages, responses, and chain of thought
-- Supports session-separate memories, session continuity, and 1000 message limit

-- Sessions table - stores chat sessions with model-specific settings
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  max_messages INTEGER DEFAULT 1000, -- Max 1000 messages per session (excluding code)
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_accessed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata TEXT -- JSON object for additional metadata
);

-- Conversations table - stores conversation threads (linked to sessions)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  provider TEXT,
  model TEXT,
  system_prompt TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata TEXT -- JSON object for additional metadata
);

-- Messages table - stores individual messages with code edit tracking
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'thinking')),
  content TEXT NOT NULL,
  thinking_content TEXT, -- For extended thinking/chain of thought
  is_code_edit INTEGER DEFAULT 0, -- Code edits don't count toward 1000 limit
  tokens_used INTEGER DEFAULT 0,
  latency_ms INTEGER,
  provider TEXT,
  model TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata TEXT -- JSON object for attachments, vision data, etc.
);

-- Session memories table - model/session specific memories
CREATE TABLE IF NOT EXISTS session_memories (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('fact', 'preference', 'context', 'instruction', 'summary', 'code_context')),
  content TEXT NOT NULL,
  embedding TEXT, -- JSON array of vector embedding for semantic search
  importance REAL DEFAULT 0.5, -- 0.0 to 1.0 importance score
  recall_count INTEGER DEFAULT 0,
  last_recalled_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER, -- Optional expiry for temporary memories
  metadata TEXT -- JSON object for additional data
);

-- Global memories table - user-wide memories (not session specific)
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK(category IN ('fact', 'preference', 'context', 'instruction', 'summary')),
  content TEXT NOT NULL,
  embedding TEXT, -- JSON array of vector embedding for semantic search
  importance REAL DEFAULT 0.5, -- 0.0 to 1.0 importance score
  recall_count INTEGER DEFAULT 0,
  last_recalled_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER, -- Optional expiry for temporary memories
  metadata TEXT -- JSON object for additional data
);

-- Chain of thought table - stores reasoning steps
CREATE TABLE IF NOT EXISTS chain_of_thought (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  thought_type TEXT NOT NULL CHECK(thought_type IN ('observation', 'reasoning', 'hypothesis', 'conclusion', 'action')),
  content TEXT NOT NULL,
  confidence REAL DEFAULT 0.5, -- 0.0 to 1.0 confidence score
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Attachments table - stores file attachments
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT, -- Local file path or cloud storage URL
  thumbnail_path TEXT,
  extracted_text TEXT, -- OCR or parsed text content
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Session continuity table - tracks session resume points
CREATE TABLE IF NOT EXISTS session_continuity (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  last_message_id TEXT REFERENCES messages(id),
  context_summary TEXT, -- AI-generated summary of conversation context
  resume_prompt TEXT, -- Prompt to restore context on resume
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_provider_model ON sessions(provider, model);
CREATE INDEX IF NOT EXISTS idx_sessions_last_accessed ON sessions(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_code_edit ON messages(is_code_edit);
CREATE INDEX IF NOT EXISTS idx_session_memories_session ON session_memories(session_id);
CREATE INDEX IF NOT EXISTS idx_session_memories_model ON session_memories(provider, model);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_conversation ON memories(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cot_message ON chain_of_thought(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_continuity_session ON session_continuity(session_id);

-- Full-text search for memories
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  content=memories,
  content_rowid=rowid
);

-- Full-text search for session memories
CREATE VIRTUAL TABLE IF NOT EXISTS session_memories_fts USING fts5(
  content,
  content=session_memories,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync for global memories
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- Triggers for session memories FTS
CREATE TRIGGER IF NOT EXISTS session_memories_ai AFTER INSERT ON session_memories BEGIN
  INSERT INTO session_memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS session_memories_ad AFTER DELETE ON session_memories BEGIN
  INSERT INTO session_memories_fts(session_memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS session_memories_au AFTER UPDATE ON session_memories BEGIN
  INSERT INTO session_memories_fts(session_memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO session_memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- View for message count per session (excluding code edits)
CREATE VIEW IF NOT EXISTS session_message_counts AS
SELECT 
  session_id,
  COUNT(*) as total_messages,
  SUM(CASE WHEN is_code_edit = 0 THEN 1 ELSE 0 END) as countable_messages,
  SUM(CASE WHEN is_code_edit = 1 THEN 1 ELSE 0 END) as code_edit_messages
FROM messages
GROUP BY session_id;
