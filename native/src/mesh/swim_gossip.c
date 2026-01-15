/**
 * LSDAMM - SWIM Gossip Protocol Implementation
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Implementation of SWIM (Scalable Weakly-consistent Infection-style Process Group Membership)
 * gossip protocol for node discovery and failure detection.
 * 
 * Reference: https://www.cs.cornell.edu/projects/Quicksilver/public_pdfs/SWIM.pdf
 * 
 * (c) 2025 Lackadaisical Security
 */

#include "swim_gossip.h"
#include "../util/logging.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <errno.h>
#endif

// Internal functions
static void swim_lock(swim_context_t *ctx);
static void swim_unlock(swim_context_t *ctx);
static swim_node_t* swim_create_node(const char *id, const char *address, uint16_t port);
static void swim_add_node(swim_context_t *ctx, swim_node_t *node);
static void swim_remove_node(swim_context_t *ctx, const char *id);
static void swim_update_node_state(swim_context_t *ctx, swim_node_t *node, swim_node_state_t new_state);
static int swim_send_ping(swim_context_t *ctx, swim_node_t *target);
static int swim_send_ping_req(swim_context_t *ctx, swim_node_t *via, swim_node_t *target);
static int swim_send_ack(swim_context_t *ctx, swim_node_t *target, uint32_t seq);
static int swim_send_sync(swim_context_t *ctx, swim_node_t *target);
static void swim_handle_message(swim_context_t *ctx, const struct sockaddr_in *from, const uint8_t *data, size_t len);
static void swim_gossip_round(swim_context_t *ctx);
static swim_node_t* swim_select_random_node(swim_context_t *ctx);
static void swim_check_timeouts(swim_context_t *ctx);

#ifdef _WIN32
static DWORD WINAPI swim_thread_func(LPVOID arg);
#else
static void* swim_thread_func(void *arg);
#endif

/**
 * Lock context mutex
 */
static void swim_lock(swim_context_t *ctx) {
#ifdef _WIN32
    EnterCriticalSection(&ctx->lock);
#else
    pthread_mutex_lock(&ctx->lock);
#endif
}

/**
 * Unlock context mutex
 */
static void swim_unlock(swim_context_t *ctx) {
#ifdef _WIN32
    LeaveCriticalSection(&ctx->lock);
#else
    pthread_mutex_unlock(&ctx->lock);
#endif
}

/**
 * Create a new node
 */
static swim_node_t* swim_create_node(const char *id, const char *address, uint16_t port) {
    swim_node_t *node = (swim_node_t*)calloc(1, sizeof(swim_node_t));
    if (!node) return NULL;
    
    strncpy(node->id, id, SWIM_NODE_ID_SIZE - 1);
    strncpy(node->address, address, sizeof(node->address) - 1);
    node->port = port;
    node->state = NODE_STATE_ALIVE;
    node->incarnation = 1;
    node->last_seen = time(NULL);
    node->state_change_time = time(NULL);
    
    return node;
}

/**
 * Add node to the list
 */
static void swim_add_node(swim_context_t *ctx, swim_node_t *node) {
    swim_lock(ctx);
    
    // Check if node already exists
    swim_node_t *existing = ctx->nodes;
    while (existing) {
        if (strcmp(existing->id, node->id) == 0) {
            // Update existing node
            existing->incarnation = node->incarnation;
            existing->last_seen = node->last_seen;
            if (existing->state != node->state) {
                swim_update_node_state(ctx, existing, node->state);
            }
            swim_unlock(ctx);
            free(node);
            return;
        }
        existing = existing->next;
    }
    
    // Add new node to front of list
    node->next = ctx->nodes;
    ctx->nodes = node;
    ctx->node_count++;
    
    log_info("SWIM: Added node %s at %s:%d", node->id, node->address, node->port);
    
    swim_unlock(ctx);
    
    // Notify callback
    if (ctx->on_node_event) {
        ctx->on_node_event(node, NODE_STATE_DEAD, NODE_STATE_ALIVE, ctx->user_data);
    }
}

/**
 * Remove node from the list
 */
static void swim_remove_node(swim_context_t *ctx, const char *id) {
    swim_lock(ctx);
    
    swim_node_t **pp = &ctx->nodes;
    while (*pp) {
        if (strcmp((*pp)->id, id) == 0) {
            swim_node_t *node = *pp;
            *pp = node->next;
            ctx->node_count--;
            
            log_info("SWIM: Removed node %s", id);
            
            swim_unlock(ctx);
            free(node);
            return;
        }
        pp = &(*pp)->next;
    }
    
    swim_unlock(ctx);
}

/**
 * Update node state
 */
static void swim_update_node_state(swim_context_t *ctx, swim_node_t *node, swim_node_state_t new_state) {
    swim_node_state_t old_state = node->state;
    
    if (old_state == new_state) return;
    
    node->state = new_state;
    node->state_change_time = time(NULL);
    
    const char *state_names[] = {"ALIVE", "SUSPECT", "DEAD", "LEFT"};
    log_info("SWIM: Node %s state changed: %s -> %s", 
             node->id, state_names[old_state], state_names[new_state]);
    
    if (ctx->on_node_event) {
        ctx->on_node_event(node, old_state, new_state, ctx->user_data);
    }
}

/**
 * Send ping message
 */
static int swim_send_ping(swim_context_t *ctx, swim_node_t *target) {
    swim_ping_t ping = {0};
    ping.header.version = 1;
    ping.header.type = SWIM_MSG_PING;
    ping.header.payload_len = 0;
    ping.header.seq_num = ++ctx->seq_num;
    ping.header.incarnation = ctx->incarnation;
    strncpy(ping.header.sender_id, ctx->local_id, SWIM_NODE_ID_SIZE - 1);
    strncpy(ping.target_id, target->id, SWIM_NODE_ID_SIZE - 1);
    
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(target->port);
    inet_pton(AF_INET, target->address, &addr.sin_addr);
    
    int sent = sendto(ctx->sock, (const char*)&ping, sizeof(ping), 0,
                      (struct sockaddr*)&addr, sizeof(addr));
    
    if (sent > 0) {
        ctx->messages_sent++;
        target->ping_seq = ping.header.seq_num;
        return 0;
    }
    
    return -1;
}

/**
 * Send indirect ping request
 */
static int swim_send_ping_req(swim_context_t *ctx, swim_node_t *via, swim_node_t *target) {
    swim_ping_req_t req = {0};
    req.header.version = 1;
    req.header.type = SWIM_MSG_PING_REQ;
    req.header.payload_len = 0;
    req.header.seq_num = ++ctx->seq_num;
    req.header.incarnation = ctx->incarnation;
    strncpy(req.header.sender_id, ctx->local_id, SWIM_NODE_ID_SIZE - 1);
    strncpy(req.target_id, target->id, SWIM_NODE_ID_SIZE - 1);
    strncpy(req.source_id, ctx->local_id, SWIM_NODE_ID_SIZE - 1);
    
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(via->port);
    inet_pton(AF_INET, via->address, &addr.sin_addr);
    
    int sent = sendto(ctx->sock, (const char*)&req, sizeof(req), 0,
                      (struct sockaddr*)&addr, sizeof(addr));
    
    if (sent > 0) {
        ctx->messages_sent++;
        return 0;
    }
    
    return -1;
}

/**
 * Send ack message
 */
static int swim_send_ack(swim_context_t *ctx, swim_node_t *target, uint32_t seq) {
    swim_ack_t ack = {0};
    ack.header.version = 1;
    ack.header.type = SWIM_MSG_ACK;
    ack.header.payload_len = 0;
    ack.header.seq_num = seq;
    ack.header.incarnation = ctx->incarnation;
    strncpy(ack.header.sender_id, ctx->local_id, SWIM_NODE_ID_SIZE - 1);
    strncpy(ack.target_id, target->id, SWIM_NODE_ID_SIZE - 1);
    
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(target->port);
    inet_pton(AF_INET, target->address, &addr.sin_addr);
    
    int sent = sendto(ctx->sock, (const char*)&ack, sizeof(ack), 0,
                      (struct sockaddr*)&addr, sizeof(addr));
    
    if (sent > 0) {
        ctx->messages_sent++;
        return 0;
    }
    
    return -1;
}

/**
 * Send state sync message
 */
static int swim_send_sync(swim_context_t *ctx, swim_node_t *target) {
    uint8_t buffer[4096];
    swim_sync_t *sync = (swim_sync_t*)buffer;
    
    sync->header.version = 1;
    sync->header.type = SWIM_MSG_SYNC;
    sync->header.seq_num = ++ctx->seq_num;
    sync->header.incarnation = ctx->incarnation;
    strncpy(sync->header.sender_id, ctx->local_id, SWIM_NODE_ID_SIZE - 1);
    
    // Add node updates
    swim_node_update_t *updates = (swim_node_update_t*)(buffer + sizeof(swim_sync_t));
    uint32_t count = 0;
    
    swim_lock(ctx);
    swim_node_t *node = ctx->nodes;
    while (node && count < 50) {  // Limit to 50 nodes per sync
        strncpy(updates[count].id, node->id, SWIM_NODE_ID_SIZE - 1);
        strncpy(updates[count].address, node->address, sizeof(updates[count].address) - 1);
        updates[count].port = node->port;
        updates[count].state = (uint8_t)node->state;
        updates[count].incarnation = node->incarnation;
        updates[count].is_main_node = node->is_main_node ? 1 : 0;
        count++;
        node = node->next;
    }
    swim_unlock(ctx);
    
    sync->node_count = count;
    sync->header.payload_len = (uint16_t)(count * sizeof(swim_node_update_t));
    
    size_t total_len = sizeof(swim_sync_t) + (count * sizeof(swim_node_update_t));
    
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(target->port);
    inet_pton(AF_INET, target->address, &addr.sin_addr);
    
    int sent = sendto(ctx->sock, (const char*)buffer, (int)total_len, 0,
                      (struct sockaddr*)&addr, sizeof(addr));
    
    if (sent > 0) {
        ctx->messages_sent++;
        return 0;
    }
    
    return -1;
}

/**
 * Handle incoming message
 */
static void swim_handle_message(swim_context_t *ctx, const struct sockaddr_in *from, 
                                 const uint8_t *data, size_t len) {
    if (len < sizeof(swim_message_header_t)) return;
    
    const swim_message_header_t *header = (const swim_message_header_t*)data;
    ctx->messages_received++;
    
    // Find or create sender node
    char sender_addr[64];
    inet_ntop(AF_INET, &from->sin_addr, sender_addr, sizeof(sender_addr));
    
    swim_node_t *sender = swim_find_node(ctx, header->sender_id);
    if (!sender && header->type != SWIM_MSG_SYNC) {
        // Create new node
        sender = swim_create_node(header->sender_id, sender_addr, ntohs(from->sin_port));
        if (sender) {
            swim_add_node(ctx, sender);
            sender = swim_find_node(ctx, header->sender_id);
        }
    }
    
    if (sender) {
        sender->last_seen = time(NULL);
        if (sender->state != NODE_STATE_ALIVE) {
            swim_update_node_state(ctx, sender, NODE_STATE_ALIVE);
        }
        if (header->incarnation > sender->incarnation) {
            sender->incarnation = header->incarnation;
        }
    }
    
    switch (header->type) {
        case SWIM_MSG_PING:
            log_debug("SWIM: Received PING from %s", header->sender_id);
            if (sender) {
                swim_send_ack(ctx, sender, header->seq_num);
            }
            break;
            
        case SWIM_MSG_PING_REQ: {
            log_debug("SWIM: Received PING_REQ from %s", header->sender_id);
            const swim_ping_req_t *req = (const swim_ping_req_t*)data;
            swim_node_t *target = swim_find_node(ctx, req->target_id);
            if (target) {
                swim_send_ping(ctx, target);
            }
            break;
        }
        
        case SWIM_MSG_ACK:
            log_debug("SWIM: Received ACK from %s", header->sender_id);
            if (sender) {
                ctx->probe_success++;
                if (sender->state == NODE_STATE_SUSPECT) {
                    swim_update_node_state(ctx, sender, NODE_STATE_ALIVE);
                }
            }
            break;
            
        case SWIM_MSG_SYNC: {
            log_debug("SWIM: Received SYNC from %s", header->sender_id);
            const swim_sync_t *sync = (const swim_sync_t*)data;
            const swim_node_update_t *updates = (const swim_node_update_t*)(data + sizeof(swim_sync_t));
            
            for (uint32_t i = 0; i < sync->node_count; i++) {
                if (strcmp(updates[i].id, ctx->local_id) == 0) continue;
                
                swim_node_t *node = swim_find_node(ctx, updates[i].id);
                if (!node) {
                    node = swim_create_node(updates[i].id, updates[i].address, updates[i].port);
                    if (node) {
                        node->state = (swim_node_state_t)updates[i].state;
                        node->incarnation = updates[i].incarnation;
                        node->is_main_node = updates[i].is_main_node;
                        swim_add_node(ctx, node);
                    }
                } else {
                    if (updates[i].incarnation > node->incarnation) {
                        node->incarnation = updates[i].incarnation;
                        node->is_main_node = updates[i].is_main_node;
                        if (node->state != (swim_node_state_t)updates[i].state) {
                            swim_update_node_state(ctx, node, (swim_node_state_t)updates[i].state);
                        }
                    }
                }
            }
            break;
        }
        
        default:
            log_warn("SWIM: Unknown message type: %d", header->type);
            break;
    }
}

/**
 * Select random node for probing
 */
static swim_node_t* swim_select_random_node(swim_context_t *ctx) {
    if (ctx->node_count == 0) return NULL;
    
    // Count alive/suspect nodes
    uint32_t eligible = 0;
    swim_node_t *node = ctx->nodes;
    while (node) {
        if (!node->is_local && (node->state == NODE_STATE_ALIVE || node->state == NODE_STATE_SUSPECT)) {
            eligible++;
        }
        node = node->next;
    }
    
    if (eligible == 0) return NULL;
    
    // Select random
    uint32_t idx = rand() % eligible;
    node = ctx->nodes;
    while (node) {
        if (!node->is_local && (node->state == NODE_STATE_ALIVE || node->state == NODE_STATE_SUSPECT)) {
            if (idx == 0) return node;
            idx--;
        }
        node = node->next;
    }
    
    return NULL;
}

/**
 * Check for timeout and update node states
 */
static void swim_check_timeouts(swim_context_t *ctx) {
    time_t now = time(NULL);
    
    swim_lock(ctx);
    swim_node_t *node = ctx->nodes;
    while (node) {
        if (!node->is_local) {
            double since_seen = difftime(now, node->last_seen) * 1000;
            
            if (node->state == NODE_STATE_ALIVE && 
                since_seen > ctx->probe_timeout_ms) {
                swim_update_node_state(ctx, node, NODE_STATE_SUSPECT);
                ctx->probe_failure++;
            } else if (node->state == NODE_STATE_SUSPECT &&
                       since_seen > ctx->suspect_timeout_ms) {
                swim_update_node_state(ctx, node, NODE_STATE_DEAD);
            }
        }
        node = node->next;
    }
    swim_unlock(ctx);
}

/**
 * Perform one gossip round
 */
static void swim_gossip_round(swim_context_t *ctx) {
    // Check timeouts
    swim_check_timeouts(ctx);
    
    // Select random node to probe
    swim_lock(ctx);
    swim_node_t *target = swim_select_random_node(ctx);
    swim_unlock(ctx);
    
    if (target) {
        // Send ping
        swim_send_ping(ctx, target);
        
        // Also send state sync periodically
        static int sync_counter = 0;
        if (++sync_counter >= 5) {
            swim_send_sync(ctx, target);
            sync_counter = 0;
        }
    }
}

/**
 * Background thread function
 */
#ifdef _WIN32
static DWORD WINAPI swim_thread_func(LPVOID arg) {
#else
static void* swim_thread_func(void *arg) {
#endif
    swim_context_t *ctx = (swim_context_t*)arg;
    
    while (ctx->is_running) {
        // Receive messages
        swim_process(ctx);
        
        // Perform gossip round
        swim_gossip_round(ctx);
        
        // Sleep for gossip interval
#ifdef _WIN32
        Sleep(ctx->gossip_interval_ms);
#else
        usleep(ctx->gossip_interval_ms * 1000);
#endif
    }
    
    return 0;
}

/**
 * Initialize SWIM context
 */
swim_context_t* swim_init(const char *local_id, uint16_t port, uint32_t gossip_interval_ms) {
    swim_context_t *ctx = (swim_context_t*)calloc(1, sizeof(swim_context_t));
    if (!ctx) return NULL;
    
    strncpy(ctx->local_id, local_id, SWIM_NODE_ID_SIZE - 1);
    ctx->port = port ? port : SWIM_DEFAULT_PORT;
    ctx->gossip_interval_ms = gossip_interval_ms ? gossip_interval_ms : SWIM_DEFAULT_INTERVAL;
    ctx->probe_timeout_ms = SWIM_PROBE_TIMEOUT;
    ctx->suspect_timeout_ms = SWIM_SUSPECT_TIMEOUT;
    ctx->incarnation = 1;
    
    // Initialize lock
#ifdef _WIN32
    InitializeCriticalSection(&ctx->lock);
#else
    pthread_mutex_init(&ctx->lock, NULL);
#endif
    
    // Create UDP socket
#ifdef _WIN32
    ctx->sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (ctx->sock == INVALID_SOCKET) {
#else
    ctx->sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (ctx->sock < 0) {
#endif
        log_error("SWIM: Failed to create socket");
        free(ctx);
        return NULL;
    }
    
    // Set non-blocking
#ifdef _WIN32
    u_long mode = 1;
    ioctlsocket(ctx->sock, FIONBIO, &mode);
#else
    int flags = fcntl(ctx->sock, F_GETFL, 0);
    fcntl(ctx->sock, F_SETFL, flags | O_NONBLOCK);
#endif
    
    // Bind socket
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(ctx->port);
    addr.sin_addr.s_addr = INADDR_ANY;
    
    if (bind(ctx->sock, (struct sockaddr*)&addr, sizeof(addr)) != 0) {
        log_error("SWIM: Failed to bind socket to port %d", ctx->port);
#ifdef _WIN32
        closesocket(ctx->sock);
#else
        close(ctx->sock);
#endif
        free(ctx);
        return NULL;
    }
    
    // Get local address
    gethostname(ctx->local_address, sizeof(ctx->local_address));
    
    // Create local node entry
    swim_node_t *local = swim_create_node(local_id, "127.0.0.1", ctx->port);
    if (local) {
        local->is_local = true;
        swim_add_node(ctx, local);
    }
    
    log_info("SWIM: Initialized on port %d", ctx->port);
    
    return ctx;
}

/**
 * Destroy SWIM context
 */
void swim_destroy(swim_context_t *ctx) {
    if (!ctx) return;
    
    swim_stop(ctx);
    
    // Free nodes
    swim_lock(ctx);
    swim_node_t *node = ctx->nodes;
    while (node) {
        swim_node_t *next = node->next;
        free(node);
        node = next;
    }
    ctx->nodes = NULL;
    ctx->node_count = 0;
    swim_unlock(ctx);
    
    // Close socket
#ifdef _WIN32
    closesocket(ctx->sock);
    DeleteCriticalSection(&ctx->lock);
#else
    close(ctx->sock);
    pthread_mutex_destroy(&ctx->lock);
#endif
    
    free(ctx);
}

/**
 * Start SWIM protocol
 */
int swim_start(swim_context_t *ctx) {
    if (ctx->is_running) return 0;
    
    ctx->is_running = true;
    
#ifdef _WIN32
    ctx->thread = CreateThread(NULL, 0, swim_thread_func, ctx, 0, NULL);
    if (!ctx->thread) {
        ctx->is_running = false;
        return -1;
    }
#else
    if (pthread_create(&ctx->thread, NULL, swim_thread_func, ctx) != 0) {
        ctx->is_running = false;
        return -1;
    }
#endif
    
    log_info("SWIM: Protocol started");
    return 0;
}

/**
 * Stop SWIM protocol
 */
void swim_stop(swim_context_t *ctx) {
    if (!ctx->is_running) return;
    
    ctx->is_running = false;
    
#ifdef _WIN32
    if (ctx->thread) {
        WaitForSingleObject(ctx->thread, 5000);
        CloseHandle(ctx->thread);
        ctx->thread = NULL;
    }
#else
    pthread_join(ctx->thread, NULL);
#endif
    
    log_info("SWIM: Protocol stopped");
}

/**
 * Process incoming messages
 */
void swim_process(swim_context_t *ctx) {
    uint8_t buffer[4096];
    struct sockaddr_in from;
    socklen_t from_len = sizeof(from);
    
    while (1) {
        int received = recvfrom(ctx->sock, (char*)buffer, sizeof(buffer), 0,
                                (struct sockaddr*)&from, &from_len);
        
        if (received <= 0) break;
        
        swim_handle_message(ctx, &from, buffer, received);
    }
}

/**
 * Join mesh by connecting to seed node
 */
int swim_join(swim_context_t *ctx, const char *address, uint16_t port) {
    // Create seed node
    char seed_id[SWIM_NODE_ID_SIZE];
    snprintf(seed_id, sizeof(seed_id), "seed-%s:%d", address, port);
    
    swim_node_t *seed = swim_create_node(seed_id, address, port);
    if (!seed) return -1;
    
    swim_add_node(ctx, seed);
    
    // Send initial ping to seed
    seed = swim_find_node(ctx, seed_id);
    if (seed) {
        swim_send_ping(ctx, seed);
        swim_send_sync(ctx, seed);
    }
    
    return 0;
}

/**
 * Leave mesh gracefully
 */
void swim_leave(swim_context_t *ctx) {
    // Update local node state to LEFT
    swim_node_t *local = swim_get_local_node(ctx);
    if (local) {
        swim_update_node_state(ctx, local, NODE_STATE_LEFT);
    }
    
    // Broadcast leave to all nodes
    swim_lock(ctx);
    swim_node_t *node = ctx->nodes;
    while (node) {
        if (!node->is_local && node->state == NODE_STATE_ALIVE) {
            swim_send_sync(ctx, node);
        }
        node = node->next;
    }
    swim_unlock(ctx);
}

/**
 * Get all known nodes
 */
uint32_t swim_get_nodes(swim_context_t *ctx, swim_node_t **nodes, uint32_t max_nodes) {
    swim_lock(ctx);
    
    uint32_t count = 0;
    swim_node_t *node = ctx->nodes;
    while (node && count < max_nodes) {
        nodes[count++] = node;
        node = node->next;
    }
    
    swim_unlock(ctx);
    return count;
}

/**
 * Get count of nodes by state
 */
uint32_t swim_get_node_count(swim_context_t *ctx, swim_node_state_t state) {
    swim_lock(ctx);
    
    uint32_t count = 0;
    swim_node_t *node = ctx->nodes;
    while (node) {
        if (node->state == state) count++;
        node = node->next;
    }
    
    swim_unlock(ctx);
    return count;
}

/**
 * Get local node
 */
swim_node_t* swim_get_local_node(swim_context_t *ctx) {
    swim_lock(ctx);
    
    swim_node_t *node = ctx->nodes;
    while (node) {
        if (node->is_local) {
            swim_unlock(ctx);
            return node;
        }
        node = node->next;
    }
    
    swim_unlock(ctx);
    return NULL;
}

/**
 * Find node by ID
 */
swim_node_t* swim_find_node(swim_context_t *ctx, const char *id) {
    swim_lock(ctx);
    
    swim_node_t *node = ctx->nodes;
    while (node) {
        if (strcmp(node->id, id) == 0) {
            swim_unlock(ctx);
            return node;
        }
        node = node->next;
    }
    
    swim_unlock(ctx);
    return NULL;
}

/**
 * Set node event callback
 */
void swim_set_node_callback(swim_context_t *ctx, swim_node_event_cb callback, void *user_data) {
    ctx->on_node_event = callback;
    ctx->user_data = user_data;
}

/**
 * Set message callback
 */
void swim_set_message_callback(swim_context_t *ctx, swim_message_cb callback, void *user_data) {
    ctx->on_message = callback;
    ctx->user_data = user_data;
}

/**
 * Broadcast message to all nodes
 */
int swim_broadcast(swim_context_t *ctx, const uint8_t *payload, size_t len) {
    int sent = 0;
    
    swim_lock(ctx);
    swim_node_t *node = ctx->nodes;
    while (node) {
        if (!node->is_local && node->state == NODE_STATE_ALIVE) {
            struct sockaddr_in addr = {0};
            addr.sin_family = AF_INET;
            addr.sin_port = htons(node->port);
            inet_pton(AF_INET, node->address, &addr.sin_addr);
            
            int result = sendto(ctx->sock, (const char*)payload, (int)len, 0,
                               (struct sockaddr*)&addr, sizeof(addr));
            if (result > 0) sent++;
        }
        node = node->next;
    }
    swim_unlock(ctx);
    
    return sent;
}

/**
 * Send to specific node
 */
int swim_send_to(swim_context_t *ctx, const char *node_id, const uint8_t *payload, size_t len) {
    swim_node_t *node = swim_find_node(ctx, node_id);
    if (!node) return -1;
    
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(node->port);
    inet_pton(AF_INET, node->address, &addr.sin_addr);
    
    int result = sendto(ctx->sock, (const char*)payload, (int)len, 0,
                       (struct sockaddr*)&addr, sizeof(addr));
    
    return result > 0 ? 0 : -1;
}

/**
 * Set this node as main coordinator
 */
void swim_set_main_node(swim_context_t *ctx, bool is_main) {
    ctx->is_main_node = is_main;
    
    swim_node_t *local = swim_get_local_node(ctx);
    if (local) {
        local->is_main_node = is_main;
        ctx->incarnation++;  // Force update propagation
    }
}

/**
 * Get statistics
 */
void swim_get_stats(swim_context_t *ctx, uint64_t *sent, uint64_t *received,
                    uint64_t *probe_success, uint64_t *probe_failure) {
    if (sent) *sent = ctx->messages_sent;
    if (received) *received = ctx->messages_received;
    if (probe_success) *probe_success = ctx->probe_success;
    if (probe_failure) *probe_failure = ctx->probe_failure;
}
