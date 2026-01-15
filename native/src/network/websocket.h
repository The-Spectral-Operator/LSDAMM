/**
 * LSDAMM - WebSocket Client Header
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * (c) 2025 Lackadaisical Security
 */

#ifndef WEBSOCKET_H
#define WEBSOCKET_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

// WebSocket states
typedef enum {
    WS_STATE_DISCONNECTED = 0,
    WS_STATE_CONNECTING,
    WS_STATE_CONNECTED,
    WS_STATE_CLOSING
} ws_state_t;

// WebSocket frame types
typedef enum {
    WS_FRAME_TEXT = 0x1,
    WS_FRAME_BINARY = 0x2,
    WS_FRAME_CLOSE = 0x8,
    WS_FRAME_PING = 0x9,
    WS_FRAME_PONG = 0xA
} ws_frame_type_t;

// Callback types
typedef void (*ws_on_connect_cb)(void *user_data);
typedef void (*ws_on_disconnect_cb)(int code, const char *reason, void *user_data);
typedef void (*ws_on_message_cb)(const uint8_t *data, size_t len, bool is_binary, void *user_data);
typedef void (*ws_on_error_cb)(const char *error, void *user_data);

// WebSocket client context
typedef struct ws_client {
    char url[512];
    char host[256];
    char path[256];
    uint16_t port;
    bool use_ssl;
    
    ws_state_t state;
    
    // Socket
#ifdef _WIN32
    void *socket;  // SOCKET
#else
    int socket;
#endif
    
    // SSL context (if using SSL)
    void *ssl_ctx;
    void *ssl;
    
    // Callbacks
    ws_on_connect_cb on_connect;
    ws_on_disconnect_cb on_disconnect;
    ws_on_message_cb on_message;
    ws_on_error_cb on_error;
    void *user_data;
    
    // Receive buffer
    uint8_t recv_buffer[65536];
    size_t recv_len;
    
    // Send queue
    uint8_t *send_queue;
    size_t send_queue_len;
    size_t send_queue_cap;
    
    // Ping/pong
    uint32_t last_ping;
    uint32_t last_pong;
    
    // Statistics
    uint64_t bytes_sent;
    uint64_t bytes_received;
    uint64_t messages_sent;
    uint64_t messages_received;
} ws_client_t;

/**
 * Create WebSocket client
 * @param url WebSocket URL (ws:// or wss://)
 * @return Client context or NULL on failure
 */
ws_client_t* ws_create(const char *url);

/**
 * Destroy WebSocket client
 */
void ws_destroy(ws_client_t *ws);

/**
 * Connect to server
 * @return 0 on success
 */
int ws_connect(ws_client_t *ws);

/**
 * Disconnect from server
 */
void ws_disconnect(ws_client_t *ws);

/**
 * Process WebSocket events (call from main loop)
 */
void ws_process(ws_client_t *ws);

/**
 * Send text message
 */
int ws_send_text(ws_client_t *ws, const char *text);

/**
 * Send binary message
 */
int ws_send_binary(ws_client_t *ws, const uint8_t *data, size_t len);

/**
 * Send ping
 */
int ws_send_ping(ws_client_t *ws);

/**
 * Check if connected
 */
bool ws_is_connected(ws_client_t *ws);

/**
 * Get current state
 */
ws_state_t ws_get_state(ws_client_t *ws);

/**
 * Set callbacks
 */
void ws_set_callbacks(ws_client_t *ws,
                      ws_on_connect_cb on_connect,
                      ws_on_disconnect_cb on_disconnect,
                      ws_on_message_cb on_message,
                      ws_on_error_cb on_error,
                      void *user_data);

/**
 * Get statistics
 */
void ws_get_stats(ws_client_t *ws,
                  uint64_t *bytes_sent,
                  uint64_t *bytes_received,
                  uint64_t *messages_sent,
                  uint64_t *messages_received);

#endif // WEBSOCKET_H
