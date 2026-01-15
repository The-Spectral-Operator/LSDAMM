-- Initial Database Schema for LSDAMM
-- Version: 1.0.0
-- Created: 2025

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    client_id TEXT PRIMARY KEY,
    client_name TEXT NOT NULL,
    client_type TEXT NOT NULL, -- 'web', 'desktop', 'extension', 'api'
    token_hash TEXT NOT NULL,
    capabilities TEXT DEFAULT '{}', -- JSON
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    last_seen_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);
CREATE INDEX IF NOT EXISTS idx_clients_type ON clients(client_type);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'CONNECTING', -- CONNECTING, AUTHENTICATED, ACTIVE, DISCONNECTED
    connected_at INTEGER NOT NULL,
    disconnected_at INTEGER,
    last_activity_at INTEGER,
    metadata TEXT DEFAULT '{}', -- JSON
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);

-- Messages table (audit log)
CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source_client_id TEXT NOT NULL,
    source_session_id TEXT NOT NULL,
    target_client_id TEXT,
    target_group TEXT,
    correlation_id TEXT,
    in_reply_to TEXT,
    priority INTEGER DEFAULT 5,
    payload TEXT NOT NULL, -- JSON
    metadata TEXT DEFAULT '{}', -- JSON
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    delivered_at INTEGER,
    expires_at INTEGER,
    FOREIGN KEY (source_client_id) REFERENCES clients(client_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_source ON messages(source_client_id);
CREATE INDEX IF NOT EXISTS idx_messages_target ON messages(target_client_id);
CREATE INDEX IF NOT EXISTS idx_messages_correlation ON messages(correlation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages(expires_at);

-- Pending messages (for offline delivery)
CREATE TABLE IF NOT EXISTS pending_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    target_client_id TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    next_retry_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY (target_client_id) REFERENCES clients(client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pending_target ON pending_messages(target_client_id);
CREATE INDEX IF NOT EXISTS idx_pending_retry ON pending_messages(next_retry_at);

-- Conversation threads
CREATE TABLE IF NOT EXISTS conversation_threads (
    thread_id TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    participant_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    message_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_threads_updated ON conversation_threads(updated_at);

-- Thread messages relationship
CREATE TABLE IF NOT EXISTS thread_messages (
    thread_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    PRIMARY KEY (thread_id, message_id),
    FOREIGN KEY (thread_id) REFERENCES conversation_threads(thread_id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
);

-- Knowledge nodes for graph storage
CREATE TABLE IF NOT EXISTS knowledge_nodes (
    node_id TEXT PRIMARY KEY,
    node_type TEXT NOT NULL, -- 'entity', 'concept', 'fact'
    content TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    source_message_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_nodes(node_type);

-- Knowledge edges (relationships)
CREATE TABLE IF NOT EXISTS knowledge_edges (
    edge_id TEXT PRIMARY KEY,
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    source_message_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (from_node_id) REFERENCES knowledge_nodes(node_id) ON DELETE CASCADE,
    FOREIGN KEY (to_node_id) REFERENCES knowledge_nodes(node_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON knowledge_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON knowledge_edges(to_node_id);
