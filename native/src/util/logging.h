/**
 * LSDAMM - Logging Utility Header
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * (c) 2025 Lackadaisical Security
 */

#ifndef LOGGING_H
#define LOGGING_H

#include <stdarg.h>

// Log levels
typedef enum {
    LOG_LEVEL_DEBUG = 0,
    LOG_LEVEL_INFO,
    LOG_LEVEL_WARN,
    LOG_LEVEL_ERROR,
    LOG_LEVEL_FATAL
} log_level_t;

/**
 * Initialize logging system
 * @param filename Log file path (NULL for stdout only)
 * @param level Minimum log level
 * @return 0 on success
 */
int log_init(const char *filename, log_level_t level);

/**
 * Shutdown logging system
 */
void log_shutdown(void);

/**
 * Set log level
 */
void log_set_level(log_level_t level);

/**
 * Log message at specified level
 */
void log_message(log_level_t level, const char *file, int line, const char *fmt, ...);

// Convenience macros
#define log_debug(...) log_message(LOG_LEVEL_DEBUG, __FILE__, __LINE__, __VA_ARGS__)
#define log_info(...)  log_message(LOG_LEVEL_INFO, __FILE__, __LINE__, __VA_ARGS__)
#define log_warn(...)  log_message(LOG_LEVEL_WARN, __FILE__, __LINE__, __VA_ARGS__)
#define log_error(...) log_message(LOG_LEVEL_ERROR, __FILE__, __LINE__, __VA_ARGS__)
#define log_fatal(...) log_message(LOG_LEVEL_FATAL, __FILE__, __LINE__, __VA_ARGS__)

#endif // LOGGING_H
