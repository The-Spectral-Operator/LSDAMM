/**
 * LSDAMM - SWIM Gossip Protocol Header
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Implementation of SWIM (Scalable Weakly-consistent Infection-style Process Group Membership)
 * gossip protocol for node discovery and failure detection.
 * 
 * (c) 2025 Lackadaisical Security
 */

#ifndef SWIM_GOSSIP_H
#define SWIM_GOSSIP_H

#include <stdint.h>
#include <stdbool.h>
#include <time.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#else
#include <pthread.h>
#include <sys/socket.h>
#endif

// SWIM Protocol Constants
#define SWIM_MAX_NODES          256
#define SWIM_NODE_ID_SIZE       64
#define SWIM_MAX_PAYLOAD        1024
#define SWIM_DEFAULT_PORT       7946
#define SWIM_DEFAULT_INTERVAL   1000  // ms
#define SWIM_PROBE_TIMEOUT      500   // ms
#define SWIM_SUSPECT_TIMEOUT    5000  // ms
#define SWIM_INDIRECT_NODES     3     // Number of nodes for indirect probe

// Node states
typedef enum {
    NODE_STATE_ALIVE = 0,
    NODE_STATE_SUSPECT,
    NODE_STATE_DEAD,
    NODE_STATE_LEFT
} swim_node_state_t;

// Message types
typedef enum {
    SWIM_MSG_PING = 0,
    SWIM_MSG_PING_REQ,
    SWIM_MSG_ACK,
    SWIM_MSG_SYNC,
    SWIM_MSG_COMPOUND
} swim_message_type_t;

// Node information
typedef struct swim_node {
    char id[SWIM_NODE_ID_SIZE];
    char address[64];
    uint16_t port;
    swim_node_state_t state;
    uint32_t incarnation;
    time_t last_seen;
    time_t state_change_time;
    uint32_t ping_seq;
    bool is_local;
    bool is_main_node;
    struct swim_node *next;
} swim_node_t;

// SWIM message header
typedef struct {
    uint8_t version;
    uint8_t type;
    uint16_t payload_len;
    uint32_t seq_num;
    char sender_id[SWIM_NODE_ID_SIZE];
    uint32_t incarnation;
} swim_message_header_t;

// SWIM ping message
typedef struct {
    swim_message_header_t header;
    char target_id[SWIM_NODE_ID_SIZE];
} swim_ping_t;

// SWIM ping-req message (indirect probe)
typedef struct {
    swim_message_header_t header;
    char target_id[SWIM_NODE_ID_SIZE];
    char source_id[SWIM_NODE_ID_SIZE];
} swim_ping_req_t;

// SWIM ack message
typedef struct {
    swim_message_header_t header;
    char target_id[SWIM_NODE_ID_SIZE];
    uint8_t payload[SWIM_MAX_PAYLOAD];
    uint16_t payload_len;
} swim_ack_t;

// SWIM state sync message (gossip)
typedef struct {
    swim_message_header_t header;
    uint32_t node_count;
    // Followed by array of node state updates
} swim_sync_t;

// Node state update (part of sync message)
typedef struct {
    char id[SWIM_NODE_ID_SIZE];
    char address[64];
    uint16_t port;
    uint8_t state;
    uint32_t incarnation;
    uint8_t is_main_node;
} swim_node_update_t;

// Callback types
typedef void (*swim_node_event_cb)(swim_node_t *node, swim_node_state_t old_state, swim_node_state_t new_state, void *user_data);
typedef void (*swim_message_cb)(swim_node_t *from, const uint8_t *payload, size_t len, void *user_data);

// SWIM context
typedef struct swim_context {
    char local_id[SWIM_NODE_ID_SIZE];
    char local_address[64];
    uint16_t port;
    uint32_t incarnation;
    uint32_t seq_num;
    
    swim_node_t *nodes;
    uint32_t node_count;
    
    bool is_running;
    bool is_main_node;
    
    uint32_t gossip_interval_ms;
    uint32_t probe_timeout_ms;
    uint32_t suspect_timeout_ms;
    
    // Socket
#ifdef _WIN32
    SOCKET sock;
    HANDLE thread;
    CRITICAL_SECTION lock;
#else
    int sock;
    pthread_t thread;
    pthread_mutex_t lock;
#endif
    
    // Callbacks
    swim_node_event_cb on_node_event;
    swim_message_cb on_message;
    void *user_data;
    
    // Statistics
    uint64_t messages_sent;
    uint64_t messages_received;
    uint64_t probe_success;
    uint64_t probe_failure;
} swim_context_t;

// API Functions

/**
 * Initialize SWIM context
 * @param local_id Unique node identifier
 * @param port UDP port for SWIM protocol
 * @param gossip_interval_ms Interval between gossip rounds (ms)
 * @return Initialized context or NULL on failure
 */
swim_context_t* swim_init(const char *local_id, uint16_t port, uint32_t gossip_interval_ms);

/**
 * Destroy SWIM context and free resources
 */
void swim_destroy(swim_context_t *ctx);

/**
 * Start SWIM protocol (begins gossip thread)
 */
int swim_start(swim_context_t *ctx);

/**
 * Stop SWIM protocol
 */
void swim_stop(swim_context_t *ctx);

/**
 * Process incoming messages (called from main loop if not using background thread)
 */
void swim_process(swim_context_t *ctx);

/**
 * Join an existing mesh by connecting to a seed node
 * @param ctx SWIM context
 * @param address Seed node address
 * @param port Seed node port
 * @return 0 on success, -1 on failure
 */
int swim_join(swim_context_t *ctx, const char *address, uint16_t port);

/**
 * Leave the mesh gracefully
 */
void swim_leave(swim_context_t *ctx);

/**
 * Get all known nodes
 * @param ctx SWIM context
 * @param nodes Output array (caller allocates)
 * @param max_nodes Maximum nodes to return
 * @return Number of nodes returned
 */
uint32_t swim_get_nodes(swim_context_t *ctx, swim_node_t **nodes, uint32_t max_nodes);

/**
 * Get count of nodes by state
 */
uint32_t swim_get_node_count(swim_context_t *ctx, swim_node_state_t state);

/**
 * Get local node info
 */
swim_node_t* swim_get_local_node(swim_context_t *ctx);

/**
 * Find node by ID
 */
swim_node_t* swim_find_node(swim_context_t *ctx, const char *id);

/**
 * Set node event callback
 */
void swim_set_node_callback(swim_context_t *ctx, swim_node_event_cb callback, void *user_data);

/**
 * Set message callback for custom payloads
 */
void swim_set_message_callback(swim_context_t *ctx, swim_message_cb callback, void *user_data);

/**
 * Broadcast a custom message to all nodes
 */
int swim_broadcast(swim_context_t *ctx, const uint8_t *payload, size_t len);

/**
 * Send message to specific node
 */
int swim_send_to(swim_context_t *ctx, const char *node_id, const uint8_t *payload, size_t len);

/**
 * Set this node as main coordinator
 */
void swim_set_main_node(swim_context_t *ctx, bool is_main);

/**
 * Get statistics
 */
void swim_get_stats(swim_context_t *ctx, uint64_t *sent, uint64_t *received, 
                    uint64_t *probe_success, uint64_t *probe_failure);

#endif // SWIM_GOSSIP_H
