/**
 * LSDAMM - Multi-Node Manager Implementation
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Manages multiple SWIM nodes on a single server
 * 
 * (c) 2025 Lackadaisical Security
 */

#include "node_manager.h"
#include "../util/logging.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

// Lock/unlock helpers
static void mgr_lock(node_manager_t *mgr) {
#ifdef _WIN32
    EnterCriticalSection(&mgr->lock);
#else
    pthread_mutex_lock(&mgr->lock);
#endif
}

static void mgr_unlock(node_manager_t *mgr) {
#ifdef _WIN32
    LeaveCriticalSection(&mgr->lock);
#else
    pthread_mutex_unlock(&mgr->lock);
#endif
}

/**
 * Generate unique node ID
 */
static void generate_node_id(char *buffer, size_t size, const char *server_id, int index) {
    snprintf(buffer, size, "%s-node-%d-%ld", server_id, index, (long)time(NULL));
}

/**
 * Initialize node manager
 */
node_manager_t* node_manager_init(const char *server_id, uint16_t port_start, uint16_t port_end) {
    node_manager_t *mgr = (node_manager_t*)calloc(1, sizeof(node_manager_t));
    if (!mgr) return NULL;
    
    strncpy(mgr->server_id, server_id, sizeof(mgr->server_id) - 1);
    mgr->port_range_start = port_start ? port_start : 7946;
    mgr->port_range_end = port_end ? port_end : port_start + 100;
    mgr->next_available_port = mgr->port_range_start;
    mgr->max_instances = MAX_NODES_PER_SERVER;
    
#ifdef _WIN32
    InitializeCriticalSection(&mgr->lock);
#else
    pthread_mutex_init(&mgr->lock, NULL);
#endif
    
    log_info("Node manager initialized: server=%s, ports=%d-%d",
             server_id, mgr->port_range_start, mgr->port_range_end);
    
    return mgr;
}

/**
 * Destroy node manager
 */
void node_manager_destroy(node_manager_t *mgr) {
    if (!mgr) return;
    
    // Stop and remove all nodes
    node_manager_stop_all(mgr);
    
    mgr_lock(mgr);
    node_instance_t *node = mgr->instances;
    while (node) {
        node_instance_t *next = node->next;
        
        if (node->coordinator) {
            coordinator_destroy(node->coordinator);
        }
        if (node->swim) {
            swim_destroy(node->swim);
        }
        free(node);
        node = next;
    }
    mgr->instances = NULL;
    mgr->instance_count = 0;
    mgr_unlock(mgr);
    
#ifdef _WIN32
    DeleteCriticalSection(&mgr->lock);
#else
    pthread_mutex_destroy(&mgr->lock);
#endif
    
    free(mgr);
}

/**
 * Allocate next available port
 */
uint16_t node_manager_allocate_port(node_manager_t *mgr) {
    mgr_lock(mgr);
    
    // Find an unused port in range
    uint16_t port = mgr->next_available_port;
    bool found = false;
    
    for (uint16_t p = mgr->port_range_start; p < mgr->port_range_end; p++) {
        bool in_use = false;
        node_instance_t *node = mgr->instances;
        while (node) {
            if (node->swim_port == port || node->ws_port == port) {
                in_use = true;
                break;
            }
            node = node->next;
        }
        
        if (!in_use) {
            found = true;
            break;
        }
        port++;
        if (port >= mgr->port_range_end) {
            port = mgr->port_range_start;
        }
    }
    
    if (found) {
        mgr->next_available_port = port + 1;
        if (mgr->next_available_port >= mgr->port_range_end) {
            mgr->next_available_port = mgr->port_range_start;
        }
    } else {
        port = 0;  // No ports available
    }
    
    mgr_unlock(mgr);
    return port;
}

/**
 * Release a port back to the pool
 */
void node_manager_release_port(node_manager_t *mgr, uint16_t port) {
    (void)mgr;
    (void)port;
    // Ports are automatically reused when checking for available ports
}

/**
 * Create a new node instance
 */
node_instance_t* node_manager_create_node(node_manager_t *mgr, const node_instance_config_t *config) {
    if (!mgr || !config) return NULL;
    
    mgr_lock(mgr);
    
    if (mgr->instance_count >= mgr->max_instances) {
        log_error("Maximum node instances reached: %d", mgr->max_instances);
        mgr_unlock(mgr);
        return NULL;
    }
    
    mgr_unlock(mgr);
    
    // Allocate port if not specified
    uint16_t swim_port = config->swim_port;
    if (swim_port == 0) {
        swim_port = node_manager_allocate_port(mgr);
        if (swim_port == 0) {
            log_error("No available ports for new node");
            return NULL;
        }
    }
    
    uint16_t ws_port = config->ws_port;
    if (ws_port == 0) {
        ws_port = node_manager_allocate_port(mgr);
    }
    
    // Create node instance
    node_instance_t *node = (node_instance_t*)calloc(1, sizeof(node_instance_t));
    if (!node) return NULL;
    
    // Generate or copy node ID
    if (config->node_id[0]) {
        strncpy(node->id, config->node_id, sizeof(node->id) - 1);
    } else {
        generate_node_id(node->id, sizeof(node->id), mgr->server_id, mgr->instance_count);
    }
    
    node->swim_port = swim_port;
    node->ws_port = ws_port;
    node->is_main_node = config->is_main_node;
    node->is_running = false;
    
    // Create SWIM context
    node->swim = swim_init(node->id, swim_port, SWIM_DEFAULT_INTERVAL);
    if (!node->swim) {
        log_error("Failed to create SWIM context for node %s", node->id);
        free(node);
        return NULL;
    }
    
    // Create coordinator
    node->coordinator = coordinator_init(node->swim, config->is_main_node);
    if (!node->coordinator) {
        log_error("Failed to create coordinator for node %s", node->id);
        swim_destroy(node->swim);
        free(node);
        return NULL;
    }
    
    // Add to list
    mgr_lock(mgr);
    node->next = mgr->instances;
    mgr->instances = node;
    mgr->instance_count++;
    mgr_unlock(mgr);
    
    log_info("Node instance created: id=%s, swim_port=%d, ws_port=%d, main=%d",
             node->id, node->swim_port, node->ws_port, node->is_main_node);
    
    // Auto-start if configured
    if (config->auto_start) {
        node_manager_start_node(mgr, node->id);
        
        // Join seed if specified
        if (config->seed_address[0] && config->seed_port > 0) {
            swim_join(node->swim, config->seed_address, config->seed_port);
        }
    }
    
    return node;
}

/**
 * Start a node instance
 */
int node_manager_start_node(node_manager_t *mgr, const char *node_id) {
    node_instance_t *node = node_manager_get_node(mgr, node_id);
    if (!node) {
        log_error("Node not found: %s", node_id);
        return -1;
    }
    
    if (node->is_running) {
        log_warn("Node already running: %s", node_id);
        return 0;
    }
    
    // Start SWIM protocol
    if (swim_start(node->swim) != 0) {
        log_error("Failed to start SWIM for node %s", node_id);
        return -1;
    }
    
    node->is_running = true;
    node->start_time = time(NULL);
    
    log_info("Node started: %s", node_id);
    
    if (mgr->on_node_started) {
        mgr->on_node_started(node, mgr->user_data);
    }
    
    return 0;
}

/**
 * Stop a node instance
 */
int node_manager_stop_node(node_manager_t *mgr, const char *node_id) {
    node_instance_t *node = node_manager_get_node(mgr, node_id);
    if (!node) {
        log_error("Node not found: %s", node_id);
        return -1;
    }
    
    if (!node->is_running) {
        return 0;
    }
    
    // Leave mesh gracefully
    swim_leave(node->swim);
    
    // Stop SWIM protocol
    swim_stop(node->swim);
    
    node->is_running = false;
    node->uptime_seconds += (uint64_t)difftime(time(NULL), node->start_time);
    
    log_info("Node stopped: %s", node_id);
    
    if (mgr->on_node_stopped) {
        mgr->on_node_stopped(node, mgr->user_data);
    }
    
    return 0;
}

/**
 * Remove a node instance
 */
int node_manager_remove_node(node_manager_t *mgr, const char *node_id) {
    // Stop first
    node_manager_stop_node(mgr, node_id);
    
    mgr_lock(mgr);
    
    node_instance_t **pp = &mgr->instances;
    while (*pp) {
        if (strcmp((*pp)->id, node_id) == 0) {
            node_instance_t *node = *pp;
            *pp = node->next;
            mgr->instance_count--;
            
            // Cleanup
            if (node->coordinator) {
                coordinator_destroy(node->coordinator);
            }
            if (node->swim) {
                swim_destroy(node->swim);
            }
            free(node);
            
            mgr_unlock(mgr);
            log_info("Node removed: %s", node_id);
            return 0;
        }
        pp = &(*pp)->next;
    }
    
    mgr_unlock(mgr);
    log_warn("Node not found for removal: %s", node_id);
    return -1;
}

/**
 * Start all nodes
 */
int node_manager_start_all(node_manager_t *mgr) {
    int started = 0;
    
    mgr_lock(mgr);
    node_instance_t *node = mgr->instances;
    mgr_unlock(mgr);
    
    while (node) {
        if (node_manager_start_node(mgr, node->id) == 0) {
            started++;
        }
        node = node->next;
    }
    
    log_info("Started %d/%d nodes", started, mgr->instance_count);
    return started;
}

/**
 * Stop all nodes
 */
void node_manager_stop_all(node_manager_t *mgr) {
    mgr_lock(mgr);
    node_instance_t *node = mgr->instances;
    mgr_unlock(mgr);
    
    while (node) {
        node_manager_stop_node(mgr, node->id);
        node = node->next;
    }
    
    log_info("Stopped all nodes");
}

/**
 * Get node instance by ID
 */
node_instance_t* node_manager_get_node(node_manager_t *mgr, const char *node_id) {
    mgr_lock(mgr);
    
    node_instance_t *node = mgr->instances;
    while (node) {
        if (strcmp(node->id, node_id) == 0) {
            mgr_unlock(mgr);
            return node;
        }
        node = node->next;
    }
    
    mgr_unlock(mgr);
    return NULL;
}

/**
 * Get all node instances
 */
uint32_t node_manager_get_nodes(node_manager_t *mgr, node_instance_t **nodes, uint32_t max) {
    mgr_lock(mgr);
    
    uint32_t count = 0;
    node_instance_t *node = mgr->instances;
    while (node && count < max) {
        nodes[count++] = node;
        node = node->next;
    }
    
    mgr_unlock(mgr);
    return count;
}

/**
 * Get running node count
 */
uint32_t node_manager_running_count(node_manager_t *mgr) {
    mgr_lock(mgr);
    
    uint32_t count = 0;
    node_instance_t *node = mgr->instances;
    while (node) {
        if (node->is_running) count++;
        node = node->next;
    }
    
    mgr_unlock(mgr);
    return count;
}

/**
 * Get total node count
 */
uint32_t node_manager_total_count(node_manager_t *mgr) {
    return mgr->instance_count;
}

/**
 * Set callbacks
 */
void node_manager_set_callbacks(
    node_manager_t *mgr,
    void (*on_started)(node_instance_t*, void*),
    void (*on_stopped)(node_instance_t*, void*),
    void (*on_error)(node_instance_t*, const char*, void*),
    void *user_data
) {
    mgr->on_node_started = on_started;
    mgr->on_node_stopped = on_stopped;
    mgr->on_node_error = on_error;
    mgr->user_data = user_data;
}

/**
 * Process all nodes
 */
void node_manager_process(node_manager_t *mgr) {
    mgr_lock(mgr);
    node_instance_t *node = mgr->instances;
    mgr_unlock(mgr);
    
    while (node) {
        if (node->is_running) {
            // Process SWIM
            if (node->swim) {
                swim_process(node->swim);
            }
            
            // Process coordinator
            if (node->coordinator) {
                coordinator_process(node->coordinator);
            }
        }
        node = node->next;
    }
}

/**
 * Get aggregate statistics
 */
void node_manager_get_stats(
    node_manager_t *mgr,
    uint32_t *total_nodes,
    uint32_t *running_nodes,
    uint64_t *total_messages,
    uint64_t *total_uptime
) {
    mgr_lock(mgr);
    
    uint32_t total = 0;
    uint32_t running = 0;
    uint64_t messages = 0;
    uint64_t uptime = 0;
    
    node_instance_t *node = mgr->instances;
    while (node) {
        total++;
        if (node->is_running) {
            running++;
            uptime += (uint64_t)difftime(time(NULL), node->start_time);
        }
        uptime += node->uptime_seconds;
        messages += node->messages_processed;
        node = node->next;
    }
    
    mgr_unlock(mgr);
    
    if (total_nodes) *total_nodes = total;
    if (running_nodes) *running_nodes = running;
    if (total_messages) *total_messages = messages;
    if (total_uptime) *total_uptime = uptime;
}
