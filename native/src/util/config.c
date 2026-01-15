/**
 * LSDAMM - Configuration Implementation
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Simple TOML parser for configuration
 * 
 * (c) 2025 Lackadaisical Security
 */

#include "config.h"
#include "logging.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/**
 * Trim whitespace from string
 */
static char* trim(char *str) {
    while (isspace((unsigned char)*str)) str++;
    if (*str == 0) return str;
    
    char *end = str + strlen(str) - 1;
    while (end > str && isspace((unsigned char)*end)) end--;
    end[1] = '\0';
    
    return str;
}

/**
 * Parse boolean value
 */
static bool parse_bool(const char *value) {
    return (strcmp(value, "true") == 0 || 
            strcmp(value, "yes") == 0 || 
            strcmp(value, "1") == 0);
}

/**
 * Set default configuration
 */
void config_set_defaults(config_t *config) {
    memset(config, 0, sizeof(config_t));
    
    // Server defaults
    strncpy(config->server_url, "wss://mesh.lackadaisical-security.com/ws", 
            sizeof(config->server_url) - 1);
    
    // SWIM defaults
    config->swim_port = 7946;
    config->swim_interval_ms = 1000;
    config->probe_timeout_ms = 500;
    config->suspect_timeout_ms = 5000;
    
    // Node defaults
    config->is_main_node = false;
    config->auto_connect = true;
    
    // AI defaults
    strncpy(config->default_provider, "anthropic", sizeof(config->default_provider) - 1);
    strncpy(config->default_model, "claude-sonnet-4-20250514", sizeof(config->default_model) - 1);
    config->max_tokens = 4096;
    config->temperature = 1.0f;
    
    // Extended features
    config->enable_extended_thinking = true;
    config->enable_vision = true;
    config->enable_tts = true;
    config->enable_attachments = true;
    
    // TTS defaults
    strncpy(config->tts_voice, "alloy", sizeof(config->tts_voice) - 1);
    config->tts_speed = 1.0f;
    
    // GUI defaults
    config->dark_mode = true;
    config->window_width = 1280;
    config->window_height = 800;
    
    // Logging defaults
    strncpy(config->log_file, "lsdamm.log", sizeof(config->log_file) - 1);
    config->log_level = 1;  // INFO
}

/**
 * Load configuration from TOML file
 */
int config_load(config_t *config, const char *filename) {
    // Start with defaults
    config_set_defaults(config);
    
    FILE *f = fopen(filename, "r");
    if (!f) {
        log_warn("Config file not found: %s, using defaults", filename);
        return -1;
    }
    
    char line[512];
    char section[64] = "";
    
    while (fgets(line, sizeof(line), f)) {
        char *trimmed = trim(line);
        
        // Skip empty lines and comments
        if (trimmed[0] == '\0' || trimmed[0] == '#') continue;
        
        // Section header
        if (trimmed[0] == '[') {
            char *end = strchr(trimmed, ']');
            if (end) {
                *end = '\0';
                strncpy(section, trimmed + 1, sizeof(section) - 1);
            }
            continue;
        }
        
        // Key = value
        char *eq = strchr(trimmed, '=');
        if (!eq) continue;
        
        *eq = '\0';
        char *key = trim(trimmed);
        char *value = trim(eq + 1);
        
        // Remove quotes from value
        if (value[0] == '"') {
            value++;
            char *end = strchr(value, '"');
            if (end) *end = '\0';
        }
        
        // Parse based on section
        if (strcmp(section, "server") == 0) {
            if (strcmp(key, "url") == 0) {
                strncpy(config->server_url, value, sizeof(config->server_url) - 1);
            } else if (strcmp(key, "auth_token") == 0) {
                strncpy(config->auth_token, value, sizeof(config->auth_token) - 1);
            } else if (strcmp(key, "client_id") == 0) {
                strncpy(config->client_id, value, sizeof(config->client_id) - 1);
            }
        } else if (strcmp(section, "swim") == 0) {
            if (strcmp(key, "port") == 0) {
                config->swim_port = (uint16_t)atoi(value);
            } else if (strcmp(key, "interval_ms") == 0) {
                config->swim_interval_ms = (uint32_t)atoi(value);
            } else if (strcmp(key, "probe_timeout_ms") == 0) {
                config->probe_timeout_ms = (uint32_t)atoi(value);
            } else if (strcmp(key, "suspect_timeout_ms") == 0) {
                config->suspect_timeout_ms = (uint32_t)atoi(value);
            }
        } else if (strcmp(section, "node") == 0) {
            if (strcmp(key, "is_main") == 0) {
                config->is_main_node = parse_bool(value);
            } else if (strcmp(key, "auto_connect") == 0) {
                config->auto_connect = parse_bool(value);
            }
        } else if (strcmp(section, "ai") == 0) {
            if (strcmp(key, "default_provider") == 0) {
                strncpy(config->default_provider, value, sizeof(config->default_provider) - 1);
            } else if (strcmp(key, "default_model") == 0) {
                strncpy(config->default_model, value, sizeof(config->default_model) - 1);
            } else if (strcmp(key, "max_tokens") == 0) {
                config->max_tokens = (uint32_t)atoi(value);
            } else if (strcmp(key, "temperature") == 0) {
                config->temperature = (float)atof(value);
            }
        } else if (strcmp(section, "features") == 0) {
            if (strcmp(key, "extended_thinking") == 0) {
                config->enable_extended_thinking = parse_bool(value);
            } else if (strcmp(key, "vision") == 0) {
                config->enable_vision = parse_bool(value);
            } else if (strcmp(key, "tts") == 0) {
                config->enable_tts = parse_bool(value);
            } else if (strcmp(key, "attachments") == 0) {
                config->enable_attachments = parse_bool(value);
            }
        } else if (strcmp(section, "tts") == 0) {
            if (strcmp(key, "voice") == 0) {
                strncpy(config->tts_voice, value, sizeof(config->tts_voice) - 1);
            } else if (strcmp(key, "speed") == 0) {
                config->tts_speed = (float)atof(value);
            }
        } else if (strcmp(section, "gui") == 0) {
            if (strcmp(key, "dark_mode") == 0) {
                config->dark_mode = parse_bool(value);
            } else if (strcmp(key, "window_width") == 0) {
                config->window_width = (uint16_t)atoi(value);
            } else if (strcmp(key, "window_height") == 0) {
                config->window_height = (uint16_t)atoi(value);
            }
        } else if (strcmp(section, "logging") == 0) {
            if (strcmp(key, "file") == 0) {
                strncpy(config->log_file, value, sizeof(config->log_file) - 1);
            } else if (strcmp(key, "level") == 0) {
                if (strcmp(value, "debug") == 0) config->log_level = 0;
                else if (strcmp(value, "info") == 0) config->log_level = 1;
                else if (strcmp(value, "warn") == 0) config->log_level = 2;
                else if (strcmp(value, "error") == 0) config->log_level = 3;
            }
        }
    }
    
    fclose(f);
    log_info("Configuration loaded from %s", filename);
    return 0;
}

/**
 * Save configuration to TOML file
 */
int config_save(const config_t *config, const char *filename) {
    FILE *f = fopen(filename, "w");
    if (!f) {
        log_error("Failed to save config to %s", filename);
        return -1;
    }
    
    fprintf(f, "# LSDAMM Configuration\n");
    fprintf(f, "# Lackadaisical Spectral Distributed AI MCP Mesh\n\n");
    
    fprintf(f, "[server]\n");
    fprintf(f, "url = \"%s\"\n", config->server_url);
    fprintf(f, "auth_token = \"%s\"\n", config->auth_token);
    fprintf(f, "client_id = \"%s\"\n\n", config->client_id);
    
    fprintf(f, "[swim]\n");
    fprintf(f, "port = %d\n", config->swim_port);
    fprintf(f, "interval_ms = %d\n", config->swim_interval_ms);
    fprintf(f, "probe_timeout_ms = %d\n", config->probe_timeout_ms);
    fprintf(f, "suspect_timeout_ms = %d\n\n", config->suspect_timeout_ms);
    
    fprintf(f, "[node]\n");
    fprintf(f, "is_main = %s\n", config->is_main_node ? "true" : "false");
    fprintf(f, "auto_connect = %s\n\n", config->auto_connect ? "true" : "false");
    
    fprintf(f, "[ai]\n");
    fprintf(f, "default_provider = \"%s\"\n", config->default_provider);
    fprintf(f, "default_model = \"%s\"\n", config->default_model);
    fprintf(f, "max_tokens = %d\n", config->max_tokens);
    fprintf(f, "temperature = %.1f\n\n", config->temperature);
    
    fprintf(f, "[features]\n");
    fprintf(f, "extended_thinking = %s\n", config->enable_extended_thinking ? "true" : "false");
    fprintf(f, "vision = %s\n", config->enable_vision ? "true" : "false");
    fprintf(f, "tts = %s\n", config->enable_tts ? "true" : "false");
    fprintf(f, "attachments = %s\n\n", config->enable_attachments ? "true" : "false");
    
    fprintf(f, "[tts]\n");
    fprintf(f, "voice = \"%s\"\n", config->tts_voice);
    fprintf(f, "speed = %.1f\n\n", config->tts_speed);
    
    fprintf(f, "[gui]\n");
    fprintf(f, "dark_mode = %s\n", config->dark_mode ? "true" : "false");
    fprintf(f, "window_width = %d\n", config->window_width);
    fprintf(f, "window_height = %d\n\n", config->window_height);
    
    fprintf(f, "[logging]\n");
    fprintf(f, "file = \"%s\"\n", config->log_file);
    const char *levels[] = {"debug", "info", "warn", "error"};
    fprintf(f, "level = \"%s\"\n", levels[config->log_level]);
    
    fclose(f);
    log_info("Configuration saved to %s", filename);
    return 0;
}

/**
 * Get string configuration value
 */
const char* config_get_string(const config_t *config, const char *key) {
    if (strcmp(key, "server_url") == 0) return config->server_url;
    if (strcmp(key, "auth_token") == 0) return config->auth_token;
    if (strcmp(key, "client_id") == 0) return config->client_id;
    if (strcmp(key, "default_provider") == 0) return config->default_provider;
    if (strcmp(key, "default_model") == 0) return config->default_model;
    if (strcmp(key, "tts_voice") == 0) return config->tts_voice;
    if (strcmp(key, "log_file") == 0) return config->log_file;
    return NULL;
}

/**
 * Set string configuration value
 */
int config_set_string(config_t *config, const char *key, const char *value) {
    if (strcmp(key, "server_url") == 0) {
        strncpy(config->server_url, value, sizeof(config->server_url) - 1);
    } else if (strcmp(key, "auth_token") == 0) {
        strncpy(config->auth_token, value, sizeof(config->auth_token) - 1);
    } else if (strcmp(key, "client_id") == 0) {
        strncpy(config->client_id, value, sizeof(config->client_id) - 1);
    } else if (strcmp(key, "default_provider") == 0) {
        strncpy(config->default_provider, value, sizeof(config->default_provider) - 1);
    } else if (strcmp(key, "default_model") == 0) {
        strncpy(config->default_model, value, sizeof(config->default_model) - 1);
    } else if (strcmp(key, "tts_voice") == 0) {
        strncpy(config->tts_voice, value, sizeof(config->tts_voice) - 1);
    } else if (strcmp(key, "log_file") == 0) {
        strncpy(config->log_file, value, sizeof(config->log_file) - 1);
    } else {
        return -1;
    }
    return 0;
}
