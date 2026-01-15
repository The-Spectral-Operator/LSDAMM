/**
 * LSDAMM - Configuration Header
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * (c) 2025 Lackadaisical Security
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <stdint.h>
#include <stdbool.h>

// Configuration structure
typedef struct {
    // Server settings
    char server_url[256];
    char auth_token[256];
    char client_id[64];
    
    // SWIM gossip settings
    uint16_t swim_port;
    uint32_t swim_interval_ms;
    uint32_t probe_timeout_ms;
    uint32_t suspect_timeout_ms;
    
    // Node settings
    bool is_main_node;
    bool auto_connect;
    
    // AI Provider settings
    char default_provider[32];
    char default_model[64];
    uint32_t max_tokens;
    float temperature;
    
    // Extended features
    bool enable_extended_thinking;
    bool enable_vision;
    bool enable_tts;
    bool enable_attachments;
    
    // TTS settings
    char tts_voice[64];
    float tts_speed;
    
    // GUI settings
    bool dark_mode;
    uint16_t window_width;
    uint16_t window_height;
    
    // Logging
    char log_file[256];
    int log_level;
} config_t;

/**
 * Load configuration from TOML file
 * @param config Output configuration
 * @param filename Config file path
 * @return 0 on success
 */
int config_load(config_t *config, const char *filename);

/**
 * Save configuration to TOML file
 */
int config_save(const config_t *config, const char *filename);

/**
 * Set default configuration values
 */
void config_set_defaults(config_t *config);

/**
 * Get configuration value as string
 */
const char* config_get_string(const config_t *config, const char *key);

/**
 * Set configuration value
 */
int config_set_string(config_t *config, const char *key, const char *value);

#endif // CONFIG_H
