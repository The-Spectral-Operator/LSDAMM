/**
 * LSDAMM - Logging Utility Implementation
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * (c) 2025 Lackadaisical Security
 */

#include "logging.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#else
#include <pthread.h>
#endif

// Log state
static struct {
    FILE *file;
    log_level_t level;
    int initialized;
#ifdef _WIN32
    CRITICAL_SECTION lock;
#else
    pthread_mutex_t lock;
#endif
} g_log = {0};

// Level names
static const char *level_names[] = {
    "DEBUG", "INFO", "WARN", "ERROR", "FATAL"
};

// Level colors (ANSI)
static const char *level_colors[] = {
    "\x1b[36m",  // Cyan for DEBUG
    "\x1b[32m",  // Green for INFO
    "\x1b[33m",  // Yellow for WARN
    "\x1b[31m",  // Red for ERROR
    "\x1b[35m"   // Magenta for FATAL
};

/**
 * Initialize logging
 */
int log_init(const char *filename, log_level_t level) {
    if (g_log.initialized) return 0;
    
#ifdef _WIN32
    InitializeCriticalSection(&g_log.lock);
#else
    pthread_mutex_init(&g_log.lock, NULL);
#endif
    
    g_log.level = level;
    
    if (filename) {
        g_log.file = fopen(filename, "a");
        if (!g_log.file) {
            fprintf(stderr, "Failed to open log file: %s\n", filename);
            return -1;
        }
    }
    
    g_log.initialized = 1;
    return 0;
}

/**
 * Shutdown logging
 */
void log_shutdown(void) {
    if (!g_log.initialized) return;
    
    if (g_log.file) {
        fclose(g_log.file);
        g_log.file = NULL;
    }
    
#ifdef _WIN32
    DeleteCriticalSection(&g_log.lock);
#else
    pthread_mutex_destroy(&g_log.lock);
#endif
    
    g_log.initialized = 0;
}

/**
 * Set log level
 */
void log_set_level(log_level_t level) {
    g_log.level = level;
}

/**
 * Log message
 */
void log_message(log_level_t level, const char *file, int line, const char *fmt, ...) {
    if (level < g_log.level) return;
    
    // Lock
#ifdef _WIN32
    if (g_log.initialized) EnterCriticalSection(&g_log.lock);
#else
    if (g_log.initialized) pthread_mutex_lock(&g_log.lock);
#endif
    
    // Get timestamp
    time_t now = time(NULL);
    struct tm *tm_info = localtime(&now);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", tm_info);
    
    // Extract filename from path
    const char *filename = strrchr(file, '/');
    if (!filename) filename = strrchr(file, '\\');
    if (!filename) filename = file;
    else filename++;
    
    // Format message
    char message[4096];
    va_list args;
    va_start(args, fmt);
    vsnprintf(message, sizeof(message), fmt, args);
    va_end(args);
    
    // Print to stdout with colors
#ifdef _WIN32
    // Windows console colors
    HANDLE hConsole = GetStdHandle(STD_OUTPUT_HANDLE);
    WORD colors[] = {11, 10, 14, 12, 13};  // Cyan, Green, Yellow, Red, Magenta
    SetConsoleTextAttribute(hConsole, colors[level]);
    printf("[%s] %s: ", timestamp, level_names[level]);
    SetConsoleTextAttribute(hConsole, 7);  // Reset to white
    printf("%s", message);
    SetConsoleTextAttribute(hConsole, 8);  // Gray for file info
    printf(" (%s:%d)\n", filename, line);
    SetConsoleTextAttribute(hConsole, 7);  // Reset
#else
    printf("%s[%s] %s\x1b[0m: %s \x1b[90m(%s:%d)\x1b[0m\n",
           level_colors[level], timestamp, level_names[level],
           message, filename, line);
#endif
    
    // Write to file (no colors)
    if (g_log.file) {
        fprintf(g_log.file, "[%s] %s: %s (%s:%d)\n",
                timestamp, level_names[level], message, filename, line);
        fflush(g_log.file);
    }
    
    // Unlock
#ifdef _WIN32
    if (g_log.initialized) LeaveCriticalSection(&g_log.lock);
#else
    if (g_log.initialized) pthread_mutex_unlock(&g_log.lock);
#endif
}
