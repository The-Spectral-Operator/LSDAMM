/**
 * LSDAMM - Winston Logging System
 * Structured logging with correlation IDs
 */

import winston from 'winston';
import path from 'node:path';
import fs from 'node:fs';
import { getConfig } from './config_parser.js';

const { combine, timestamp, json, errors, printf } = winston.format;

// Custom format for development console output
const devFormat = printf(({ level, message, timestamp, correlationId, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}]`;
  if (correlationId) {
    msg += ` [${correlationId}]`;
  }
  msg += ` ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

let loggerInstance: winston.Logger | null = null;

/**
 * Initialize and get the logger instance
 */
export function getLogger(): winston.Logger {
  if (loggerInstance) {
    return loggerInstance;
  }

  const config = getConfig();
  const logPath = config.logging.path;

  // Ensure log directory exists
  if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath, { recursive: true });
  }

  loggerInstance = winston.createLogger({
    level: config.logging.level,
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      errors({ stack: true }),
      json()
    ),
    defaultMeta: { 
      service: 'lsdamm-coordination',
      version: '1.0.0'
    },
    transports: [
      // Error log
      new winston.transports.File({
        filename: path.join(logPath, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
        tailable: true
      }),
      // Combined log
      new winston.transports.File({
        filename: path.join(logPath, 'combined.log'),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
        tailable: true
      })
    ]
  });

  // Add console transport in development
  if (process.env.NODE_ENV !== 'production') {
    loggerInstance.add(new winston.transports.Console({
      format: combine(
        timestamp({ format: 'HH:mm:ss.SSS' }),
        devFormat
      )
    }));
  }

  return loggerInstance;
}

/**
 * Create a child logger with a correlation ID
 */
export function createCorrelatedLogger(correlationId: string): winston.Logger {
  const logger = getLogger();
  return logger.child({ correlationId });
}

/**
 * Log with correlation ID helper
 */
export function logWithCorrelation(
  correlationId: string, 
  level: string, 
  message: string, 
  meta?: Record<string, unknown>
): void {
  const logger = getLogger();
  logger.log(level, message, {
    correlationId,
    ...meta
  });
}

// Convenience exports
export const logger = {
  get instance() {
    return getLogger();
  },
  debug(message: string, meta?: Record<string, unknown>) {
    getLogger().debug(message, meta);
  },
  info(message: string, meta?: Record<string, unknown>) {
    getLogger().info(message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    getLogger().warn(message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    getLogger().error(message, meta);
  }
};
