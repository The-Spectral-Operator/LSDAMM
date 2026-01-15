-- API Keys Schema for LSDAMM
-- Version: 1.0.0
-- Migration: 002_api_keys

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user', -- 'admin', 'user', 'readonly'
    is_active INTEGER DEFAULT 1,
    email_verified INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- API Keys table (Stripe-style keys)
CREATE TABLE IF NOT EXISTS api_keys (
    key_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_prefix TEXT NOT NULL, -- First 8 chars for identification (lsk_live_ or lsk_test_)
    key_hash TEXT NOT NULL, -- SHA-256 hash of the full key
    name TEXT NOT NULL,
    description TEXT,
    scopes TEXT NOT NULL DEFAULT '[]', -- JSON array of permissions
    rate_limit_override INTEGER, -- Custom rate limit if set
    is_active INTEGER DEFAULT 1,
    expires_at INTEGER,
    last_used_at INTEGER,
    usage_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    revoked_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- API Key usage tracking
CREATE TABLE IF NOT EXISTS api_key_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    requests_made INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    FOREIGN KEY (key_id) REFERENCES api_keys(key_id) ON DELETE CASCADE,
    UNIQUE (key_id, date)
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_date ON api_key_usage(date);

-- Refresh tokens for JWT
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    revoked_at INTEGER,
    device_info TEXT, -- JSON with device/browser info
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
