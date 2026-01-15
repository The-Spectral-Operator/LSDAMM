/**
 * LSDAMM - WebSocket Client Implementation
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Basic WebSocket client implementation using raw sockets
 * For production, consider using libwebsockets or similar
 * 
 * (c) 2025 Lackadaisical Security
 */

#include "websocket.h"
#include "../util/logging.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
typedef SOCKET socket_t;
#define INVALID_SOCK INVALID_SOCKET
#else
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <fcntl.h>
#include <errno.h>
typedef int socket_t;
#define INVALID_SOCK -1
#define closesocket close
#endif

// WebSocket handshake key
static const char WS_MAGIC_STRING[] = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// Base64 encoding table
static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Simple Base64 encode
 */
static void base64_encode(const uint8_t *input, size_t len, char *output) {
    size_t i, j;
    for (i = 0, j = 0; i < len; i += 3) {
        uint32_t n = ((uint32_t)input[i]) << 16;
        if (i + 1 < len) n |= ((uint32_t)input[i + 1]) << 8;
        if (i + 2 < len) n |= (uint32_t)input[i + 2];
        
        output[j++] = b64_table[(n >> 18) & 0x3F];
        output[j++] = b64_table[(n >> 12) & 0x3F];
        output[j++] = (i + 1 < len) ? b64_table[(n >> 6) & 0x3F] : '=';
        output[j++] = (i + 2 < len) ? b64_table[n & 0x3F] : '=';
    }
    output[j] = '\0';
}

/**
 * Generate random bytes
 */
static void random_bytes(uint8_t *buffer, size_t len) {
    static int seeded = 0;
    if (!seeded) {
        srand((unsigned int)time(NULL));
        seeded = 1;
    }
    for (size_t i = 0; i < len; i++) {
        buffer[i] = (uint8_t)(rand() % 256);
    }
}

/**
 * Parse WebSocket URL
 */
static int parse_url(ws_client_t *ws, const char *url) {
    // Default values
    ws->port = 80;
    ws->use_ssl = false;
    strncpy(ws->path, "/", sizeof(ws->path) - 1);
    
    const char *p = url;
    
    // Check protocol
    if (strncmp(p, "wss://", 6) == 0) {
        ws->use_ssl = true;
        ws->port = 443;
        p += 6;
    } else if (strncmp(p, "ws://", 5) == 0) {
        p += 5;
    } else {
        return -1;
    }
    
    // Extract host
    const char *host_end = strchr(p, '/');
    const char *port_sep = strchr(p, ':');
    
    if (port_sep && (!host_end || port_sep < host_end)) {
        // Has port
        size_t host_len = port_sep - p;
        if (host_len >= sizeof(ws->host)) host_len = sizeof(ws->host) - 1;
        strncpy(ws->host, p, host_len);
        ws->host[host_len] = '\0';
        
        ws->port = (uint16_t)atoi(port_sep + 1);
    } else if (host_end) {
        size_t host_len = host_end - p;
        if (host_len >= sizeof(ws->host)) host_len = sizeof(ws->host) - 1;
        strncpy(ws->host, p, host_len);
        ws->host[host_len] = '\0';
    } else {
        strncpy(ws->host, p, sizeof(ws->host) - 1);
    }
    
    // Extract path
    if (host_end) {
        strncpy(ws->path, host_end, sizeof(ws->path) - 1);
    }
    
    return 0;
}

/**
 * Create WebSocket client
 */
ws_client_t* ws_create(const char *url) {
    ws_client_t *ws = (ws_client_t*)calloc(1, sizeof(ws_client_t));
    if (!ws) return NULL;
    
    strncpy(ws->url, url, sizeof(ws->url) - 1);
    
    if (parse_url(ws, url) != 0) {
        log_error("WS: Failed to parse URL: %s", url);
        free(ws);
        return NULL;
    }
    
    ws->state = WS_STATE_DISCONNECTED;
    
#ifdef _WIN32
    ws->socket = (void*)INVALID_SOCKET;
#else
    ws->socket = -1;
#endif
    
    log_debug("WS: Created client for %s (host=%s, port=%d, ssl=%d)",
              url, ws->host, ws->port, ws->use_ssl);
    
    return ws;
}

/**
 * Destroy WebSocket client
 */
void ws_destroy(ws_client_t *ws) {
    if (!ws) return;
    
    ws_disconnect(ws);
    
    if (ws->send_queue) {
        free(ws->send_queue);
    }
    
    free(ws);
}

/**
 * Connect to server
 */
int ws_connect(ws_client_t *ws) {
    if (!ws) return -1;
    if (ws->state != WS_STATE_DISCONNECTED) return -1;
    
    ws->state = WS_STATE_CONNECTING;
    
    // Resolve host
    struct addrinfo hints = {0};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    
    char port_str[16];
    snprintf(port_str, sizeof(port_str), "%d", ws->port);
    
    struct addrinfo *result;
    if (getaddrinfo(ws->host, port_str, &hints, &result) != 0) {
        log_error("WS: Failed to resolve host: %s", ws->host);
        ws->state = WS_STATE_DISCONNECTED;
        return -1;
    }
    
    // Create socket
    socket_t sock = socket(result->ai_family, result->ai_socktype, result->ai_protocol);
    if (sock == INVALID_SOCK) {
        log_error("WS: Failed to create socket");
        freeaddrinfo(result);
        ws->state = WS_STATE_DISCONNECTED;
        return -1;
    }
    
    // Connect
    if (connect(sock, result->ai_addr, (int)result->ai_addrlen) != 0) {
        log_error("WS: Failed to connect to %s:%d", ws->host, ws->port);
        closesocket(sock);
        freeaddrinfo(result);
        ws->state = WS_STATE_DISCONNECTED;
        return -1;
    }
    
    freeaddrinfo(result);
    
#ifdef _WIN32
    ws->socket = (void*)sock;
#else
    ws->socket = sock;
#endif
    
    // TODO: SSL handshake if ws->use_ssl
    
    // WebSocket handshake
    uint8_t key_bytes[16];
    random_bytes(key_bytes, 16);
    char key_b64[32];
    base64_encode(key_bytes, 16, key_b64);
    
    char request[1024];
    snprintf(request, sizeof(request),
             "GET %s HTTP/1.1\r\n"
             "Host: %s:%d\r\n"
             "Upgrade: websocket\r\n"
             "Connection: Upgrade\r\n"
             "Sec-WebSocket-Key: %s\r\n"
             "Sec-WebSocket-Version: 13\r\n"
             "\r\n",
             ws->path, ws->host, ws->port, key_b64);
    
    if (send(sock, request, (int)strlen(request), 0) < 0) {
        log_error("WS: Failed to send handshake");
        closesocket(sock);
        ws->state = WS_STATE_DISCONNECTED;
        return -1;
    }
    
    // Receive response
    char response[1024];
    int recv_len = recv(sock, response, sizeof(response) - 1, 0);
    if (recv_len <= 0) {
        log_error("WS: Failed to receive handshake response");
        closesocket(sock);
        ws->state = WS_STATE_DISCONNECTED;
        return -1;
    }
    response[recv_len] = '\0';
    
    // Check response
    if (strstr(response, "101 Switching Protocols") == NULL) {
        log_error("WS: Handshake failed: %s", response);
        closesocket(sock);
        ws->state = WS_STATE_DISCONNECTED;
        return -1;
    }
    
    // Set non-blocking
#ifdef _WIN32
    u_long mode = 1;
    ioctlsocket(sock, FIONBIO, &mode);
#else
    int flags = fcntl(sock, F_GETFL, 0);
    fcntl(sock, F_SETFL, flags | O_NONBLOCK);
#endif
    
    ws->state = WS_STATE_CONNECTED;
    ws->last_pong = (uint32_t)time(NULL);
    
    log_info("WS: Connected to %s", ws->url);
    
    if (ws->on_connect) {
        ws->on_connect(ws->user_data);
    }
    
    return 0;
}

/**
 * Disconnect
 */
void ws_disconnect(ws_client_t *ws) {
    if (!ws) return;
    if (ws->state == WS_STATE_DISCONNECTED) return;
    
    ws->state = WS_STATE_CLOSING;
    
#ifdef _WIN32
    socket_t sock = (socket_t)ws->socket;
    if (sock != INVALID_SOCKET) {
        closesocket(sock);
        ws->socket = (void*)INVALID_SOCKET;
    }
#else
    if (ws->socket >= 0) {
        close(ws->socket);
        ws->socket = -1;
    }
#endif
    
    ws->state = WS_STATE_DISCONNECTED;
    
    if (ws->on_disconnect) {
        ws->on_disconnect(1000, "Normal closure", ws->user_data);
    }
    
    log_info("WS: Disconnected");
}

/**
 * Process WebSocket events
 */
void ws_process(ws_client_t *ws) {
    if (!ws || ws->state != WS_STATE_CONNECTED) return;
    
#ifdef _WIN32
    socket_t sock = (socket_t)ws->socket;
    if (sock == INVALID_SOCKET) return;
#else
    int sock = ws->socket;
    if (sock < 0) return;
#endif
    
    // Try to receive data
    uint8_t buffer[4096];
    int recv_len = recv(sock, (char*)buffer, sizeof(buffer), 0);
    
    if (recv_len > 0) {
        ws->bytes_received += recv_len;
        
        // Parse WebSocket frame
        if (recv_len >= 2) {
            uint8_t opcode = buffer[0] & 0x0F;
            // bool is_masked = (buffer[1] & 0x80) != 0;
            uint8_t payload_len = buffer[1] & 0x7F;
            
            size_t header_len = 2;
            size_t actual_len = payload_len;
            
            if (payload_len == 126 && recv_len >= 4) {
                actual_len = (buffer[2] << 8) | buffer[3];
                header_len = 4;
            } else if (payload_len == 127 && recv_len >= 10) {
                // 64-bit length
                actual_len = 0;
                for (int i = 0; i < 8; i++) {
                    actual_len = (actual_len << 8) | buffer[2 + i];
                }
                header_len = 10;
            }
            
            if (recv_len >= (int)(header_len + actual_len)) {
                uint8_t *payload = buffer + header_len;
                
                switch (opcode) {
                    case WS_FRAME_TEXT:
                    case WS_FRAME_BINARY:
                        ws->messages_received++;
                        if (ws->on_message) {
                            ws->on_message(payload, actual_len, opcode == WS_FRAME_BINARY, ws->user_data);
                        }
                        break;
                        
                    case WS_FRAME_PING:
                        // Send pong
                        ws_send_binary(ws, payload, actual_len);  // Simplified
                        break;
                        
                    case WS_FRAME_PONG:
                        ws->last_pong = (uint32_t)time(NULL);
                        break;
                        
                    case WS_FRAME_CLOSE:
                        ws_disconnect(ws);
                        break;
                }
            }
        }
    } else if (recv_len == 0) {
        // Connection closed
        ws_disconnect(ws);
    }
    // recv_len < 0 is normal for non-blocking when no data
}

/**
 * Send WebSocket frame
 */
static int ws_send_frame(ws_client_t *ws, uint8_t opcode, const uint8_t *data, size_t len) {
    if (!ws || ws->state != WS_STATE_CONNECTED) return -1;
    
#ifdef _WIN32
    socket_t sock = (socket_t)ws->socket;
    if (sock == INVALID_SOCKET) return -1;
#else
    int sock = ws->socket;
    if (sock < 0) return -1;
#endif
    
    // Build frame
    uint8_t frame[65536];
    size_t frame_len = 0;
    
    // First byte: FIN + opcode
    frame[frame_len++] = 0x80 | opcode;
    
    // Second byte: MASK + length
    uint8_t mask_key[4];
    random_bytes(mask_key, 4);
    
    if (len < 126) {
        frame[frame_len++] = 0x80 | (uint8_t)len;
    } else if (len < 65536) {
        frame[frame_len++] = 0x80 | 126;
        frame[frame_len++] = (len >> 8) & 0xFF;
        frame[frame_len++] = len & 0xFF;
    } else {
        frame[frame_len++] = 0x80 | 127;
        for (int i = 7; i >= 0; i--) {
            frame[frame_len++] = (len >> (i * 8)) & 0xFF;
        }
    }
    
    // Mask key
    memcpy(frame + frame_len, mask_key, 4);
    frame_len += 4;
    
    // Masked payload
    for (size_t i = 0; i < len; i++) {
        frame[frame_len++] = data[i] ^ mask_key[i % 4];
    }
    
    // Send
    int sent = send(sock, (const char*)frame, (int)frame_len, 0);
    if (sent > 0) {
        ws->bytes_sent += sent;
        ws->messages_sent++;
        return 0;
    }
    
    return -1;
}

/**
 * Send text message
 */
int ws_send_text(ws_client_t *ws, const char *text) {
    return ws_send_frame(ws, WS_FRAME_TEXT, (const uint8_t*)text, strlen(text));
}

/**
 * Send binary message
 */
int ws_send_binary(ws_client_t *ws, const uint8_t *data, size_t len) {
    return ws_send_frame(ws, WS_FRAME_BINARY, data, len);
}

/**
 * Send ping
 */
int ws_send_ping(ws_client_t *ws) {
    ws->last_ping = (uint32_t)time(NULL);
    return ws_send_frame(ws, WS_FRAME_PING, NULL, 0);
}

/**
 * Check if connected
 */
bool ws_is_connected(ws_client_t *ws) {
    return ws && ws->state == WS_STATE_CONNECTED;
}

/**
 * Get state
 */
ws_state_t ws_get_state(ws_client_t *ws) {
    return ws ? ws->state : WS_STATE_DISCONNECTED;
}

/**
 * Set callbacks
 */
void ws_set_callbacks(ws_client_t *ws,
                      ws_on_connect_cb on_connect,
                      ws_on_disconnect_cb on_disconnect,
                      ws_on_message_cb on_message,
                      ws_on_error_cb on_error,
                      void *user_data) {
    if (!ws) return;
    ws->on_connect = on_connect;
    ws->on_disconnect = on_disconnect;
    ws->on_message = on_message;
    ws->on_error = on_error;
    ws->user_data = user_data;
}

/**
 * Get statistics
 */
void ws_get_stats(ws_client_t *ws,
                  uint64_t *bytes_sent,
                  uint64_t *bytes_received,
                  uint64_t *messages_sent,
                  uint64_t *messages_received) {
    if (!ws) return;
    if (bytes_sent) *bytes_sent = ws->bytes_sent;
    if (bytes_received) *bytes_received = ws->bytes_received;
    if (messages_sent) *messages_sent = ws->messages_sent;
    if (messages_received) *messages_received = ws->messages_received;
}
