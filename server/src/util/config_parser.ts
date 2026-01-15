/**
 * LSDAMM - Configuration Parser
 * Loads configuration from TOML files and environment variables
 */

import fs from 'node:fs';
import path from 'node:path';
import toml from 'toml';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerConfig {
  server: {
    host: string;
    port: number;
    cors_origins: string[];
  };
  database: {
    path: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    path: string;
  };
  auth: {
    jwt_secret: string;
    jwt_expires_in: string;
    session_timeout_ms: number;
  };
  rate_limit: {
    window_ms: number;
    max_requests: number;
  };
  websocket: {
    heartbeat_interval_ms: number;
    heartbeat_timeout_ms: number;
  };
  providers: {
    openai: ProviderConfig;
    anthropic: ProviderConfig;
    google: ProviderConfig;
    xai: ProviderConfig;
    ollama_local: OllamaConfig;
    ollama_cloud: OllamaConfig;
  };
  memory: {
    vector_db: string;
    vector_db_url: string;
    search_engine: string;
    search_engine_url: string;
    search_engine_key: string;
    embedding_model: string;
    embedding_provider: string;
  };
  monitoring: {
    prometheus_enabled: boolean;
    metrics_path: string;
  };
}

export interface ProviderConfig {
  enabled: boolean;
  api_key: string;
  organization_id?: string;
  default_model: string;
}

export interface OllamaConfig extends ProviderConfig {
  base_url: string;
}

let cachedConfig: ServerConfig | null = null;

/**
 * Load configuration from TOML file with environment variable overrides
 */
export function loadConfig(configPath?: string): ServerConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Determine config file path
  const defaultConfigPath = path.resolve(__dirname, '../../config/server.toml');
  const envConfigPath = process.env.CONFIG_PATH;
  const finalPath = configPath || envConfigPath || defaultConfigPath;

  // Check if config file exists, otherwise use example
  let configFilePath = finalPath;
  if (!fs.existsSync(finalPath)) {
    const examplePath = path.resolve(__dirname, '../../config/server.example.toml');
    if (fs.existsSync(examplePath)) {
      configFilePath = examplePath;
    } else {
      throw new Error(`Configuration file not found: ${finalPath}`);
    }
  }

  // Read and parse TOML
  const configContent = fs.readFileSync(configFilePath, 'utf-8');
  const config = toml.parse(configContent) as ServerConfig;

  // Apply environment variable overrides
  config.server.port = parseInt(process.env.PORT || String(config.server.port), 10);
  config.server.host = process.env.HOST || config.server.host;

  config.database.path = process.env.DATABASE_PATH || config.database.path;

  config.logging.level = (process.env.LOG_LEVEL as ServerConfig['logging']['level']) || config.logging.level;
  config.logging.path = process.env.LOG_PATH || config.logging.path;

  config.auth.jwt_secret = process.env.JWT_SECRET || config.auth.jwt_secret;

  config.rate_limit.window_ms = parseInt(process.env.RATE_LIMIT_WINDOW || String(config.rate_limit.window_ms), 10);
  config.rate_limit.max_requests = parseInt(process.env.RATE_LIMIT_MAX || String(config.rate_limit.max_requests), 10);

  // Provider API keys from environment
  config.providers.openai.api_key = process.env.OPENAI_API_KEY || config.providers.openai.api_key;
  if (process.env.OPENAI_ORG_ID) {
    config.providers.openai.organization_id = process.env.OPENAI_ORG_ID;
  }

  config.providers.anthropic.api_key = process.env.ANTHROPIC_API_KEY || config.providers.anthropic.api_key;
  config.providers.google.api_key = process.env.GOOGLE_API_KEY || config.providers.google.api_key;
  config.providers.xai.api_key = process.env.XAI_API_KEY || config.providers.xai.api_key;
  config.providers.ollama_cloud.api_key = process.env.OLLAMA_API_KEY || config.providers.ollama_cloud.api_key;

  // Memory configuration
  config.memory.vector_db_url = process.env.QDRANT_URL || config.memory.vector_db_url;
  config.memory.search_engine_url = process.env.MEILISEARCH_URL || config.memory.search_engine_url;
  config.memory.search_engine_key = process.env.MEILISEARCH_API_KEY || config.memory.search_engine_key;

  cachedConfig = config;
  return config;
}

/**
 * Get the current configuration
 */
export function getConfig(): ServerConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

/**
 * Reload configuration (useful for hot reload scenarios)
 */
export function reloadConfig(configPath?: string): ServerConfig {
  cachedConfig = null;
  return loadConfig(configPath);
}
