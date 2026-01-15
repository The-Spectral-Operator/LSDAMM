-- Provider Accounts Schema for LSDAMM
-- Version: 1.0.0
-- Migration: 003_providers

-- Provider accounts table
CREATE TABLE IF NOT EXISTS provider_accounts (
    account_id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL, -- 'openai', 'anthropic', 'google', 'xai', 'ollama_local', 'ollama_cloud'
    account_name TEXT NOT NULL,
    credentials TEXT NOT NULL, -- Encrypted JSON with API keys
    rate_limits TEXT NOT NULL DEFAULT '{}', -- JSON with rate limit config
    quota_limits TEXT NOT NULL DEFAULT '{}', -- JSON with quota config
    is_active INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 0, -- Higher = preferred
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider ON provider_accounts(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_active ON provider_accounts(is_active);

-- Account usage tracking
CREATE TABLE IF NOT EXISTS provider_account_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    requests_made INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    FOREIGN KEY (account_id) REFERENCES provider_accounts(account_id) ON DELETE CASCADE,
    UNIQUE (account_id, date)
);

CREATE INDEX IF NOT EXISTS idx_provider_usage_date ON provider_account_usage(date);

-- Rate limit state tracking
CREATE TABLE IF NOT EXISTS rate_limit_state (
    account_id TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    requests_in_window INTEGER DEFAULT 0,
    tokens_in_window INTEGER DEFAULT 0,
    next_reset_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES provider_accounts(account_id) ON DELETE CASCADE
);

-- AI model requests log
CREATE TABLE IF NOT EXISTS ai_requests (
    request_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    latency_ms INTEGER,
    status TEXT NOT NULL, -- 'success', 'error', 'timeout'
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (account_id) REFERENCES provider_accounts(account_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_account ON ai_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_created ON ai_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_requests_status ON ai_requests(status);
