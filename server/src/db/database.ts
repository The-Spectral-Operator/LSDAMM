/**
 * LSDAMM - Database Manager
 * SQLite database with migrations support
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../util/config_parser.js';
import { logger } from '../util/logging.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbInstance: Database.Database | null = null;

/**
 * Get or create the database instance
 */
export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const config = getConfig();
  const dbPath = config.database.path;

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(dbPath);
  
  // Enable WAL mode for better concurrency
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('synchronous = NORMAL');
  dbInstance.pragma('cache_size = -64000'); // 64MB cache
  dbInstance.pragma('temp_store = MEMORY');
  dbInstance.pragma('foreign_keys = ON');

  logger.info('Database connection established', { path: dbPath });

  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    logger.info('Database connection closed');
  }
}

/**
 * Initialize database with schema
 */
export function initializeDatabase(): void {
  const db = getDatabase();

  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Run migrations
  runMigrations();

  logger.info('Database initialized successfully');
}

/**
 * Run pending migrations
 */
function runMigrations(): void {
  const db = getDatabase();
  const migrationsDir = path.resolve(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  // Get executed migrations
  const executedMigrations = db.prepare('SELECT name FROM migrations').all() as { name: string }[];
  const executedNames = new Set(executedMigrations.map(m => m.name));

  // Get migration files
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Run pending migrations
  for (const file of migrationFiles) {
    if (executedNames.has(file)) {
      continue;
    }

    logger.info(`Running migration: ${file}`);

    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    const transaction = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    });

    try {
      transaction();
      logger.info(`Migration completed: ${file}`);
    } catch (error) {
      logger.error(`Migration failed: ${file}`, { error });
      throw error;
    }
  }
}

/**
 * Execute a prepared statement
 */
export function execute<T>(sql: string, params: unknown[] = []): T[] {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

/**
 * Execute a single row query
 */
export function executeOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  return stmt.get(...params) as T | undefined;
}

/**
 * Execute an insert/update/delete
 */
export function executeRun(sql: string, params: unknown[] = []): Database.RunResult {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

/**
 * Execute in a transaction
 */
export function transaction<T>(fn: () => T): T {
  const db = getDatabase();
  return db.transaction(fn)();
}
