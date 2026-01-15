/**
 * LSDAMM - Multi-Node Manager Header
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Manages multiple SWIM nodes on a single server
 * Supports automatic port allocation and node lifecycle management
 * 
 * (c) 2025 Lackadaisical Security
 */

#ifndef NODE_MANAGER_H
#define NODE_MANAGER_H

#include <stdint.h>
#include <stdbool.h>
#include "swim_gossip.h"
#include "node_coordinator.h"

// Maximum nodes per server
#define MAX_NODES_PER_SERVER 16

// Node instance configuration
typedef struct {
    char node_id[64];
    uint16_t swim_port;
    uint16_t ws_port;
    bool is_main_node;
    bool auto_start;
    char seed_address[64];
    uint16_t seed_port;
} node_instance_config_t;

// Node instance state
typedef struct node_instance {
    char id[64];
    uint16_t swim_port;
    uint16_t ws_port;
    bool is_running;
    bool is_main_node;
    
    swim_context_t *swim;
    node_coordinator_t *coordinator;
    
    // Statistics
    uint64_t messages_processed;
    uint64_t uptime_seconds;
    time_t start_time;
    
    struct node_instance *next;
} node_instance_t;

// Multi-node manager context
typedef struct {
    node_instance_t *instances;
    uint32_t instance_count;
    uint32_t max_instances;
    
    // Port range for auto-allocation
    uint16_t port_range_start;
    uint16_t port_range_end;
    uint16_t next_available_port;
    
    // Shared configuration
    char server_id[64];
    char mesh_url[256];
    
    // Callbacks
    void (*on_node_started)(node_instance_t *instance, void *user_data);
    void (*on_node_stopped)(node_instance_t *instance, void *user_data);
    void (*on_node_error)(node_instance_t *instance, const char *error, void *user_data);
    void *user_data;
    
    // Thread safety
#ifdef _WIN32
    CRITICAL_SECTION lock;
#else
    pthread_mutex_t lock;
#endif
} node_manager_t;

// API Functions

/**
 * Initialize node manager
 * @param server_id Unique server identifier
 * @param port_start Start of port range for nodes
 * @param port_end End of port range for nodes
 * @return Manager context or NULL on failure
 */
node_manager_t* node_manager_init(const char *server_id, uint16_t port_start, uint16_t port_end);

/**
 * Destroy node manager and all instances
 */
void node_manager_destroy(node_manager_t *mgr);

/**
 * Create a new node instance
 * @param mgr Node manager
 * @param config Node configuration (port=0 for auto-allocation)
 * @return Node instance or NULL on failure
 */
node_instance_t* node_manager_create_node(node_manager_t *mgr, const node_instance_config_t *config);

/**
 * Start a node instance
 */
int node_manager_start_node(node_manager_t *mgr, const char *node_id);

/**
 * Stop a node instance
 */
int node_manager_stop_node(node_manager_t *mgr, const char *node_id);

/**
 * Remove a node instance
 */
int node_manager_remove_node(node_manager_t *mgr, const char *node_id);

/**
 * Start all nodes
 */
int node_manager_start_all(node_manager_t *mgr);

/**
 * Stop all nodes
 */
void node_manager_stop_all(node_manager_t *mgr);

/**
 * Get node instance by ID
 */
node_instance_t* node_manager_get_node(node_manager_t *mgr, const char *node_id);

/**
 * Get all node instances
 */
uint32_t node_manager_get_nodes(node_manager_t *mgr, node_instance_t **nodes, uint32_t max);

/**
 * Get running node count
 */
uint32_t node_manager_running_count(node_manager_t *mgr);

/**
 * Get total node count
 */
uint32_t node_manager_total_count(node_manager_t *mgr);

/**
 * Allocate next available port
 */
uint16_t node_manager_allocate_port(node_manager_t *mgr);

/**
 * Release a port back to the pool
 */
void node_manager_release_port(node_manager_t *mgr, uint16_t port);

/**
 * Set callbacks
 */
void node_manager_set_callbacks(
    node_manager_t *mgr,
    void (*on_started)(node_instance_t*, void*),
    void (*on_stopped)(node_instance_t*, void*),
    void (*on_error)(node_instance_t*, const char*, void*),
    void *user_data
);

/**
 * Process all nodes (call from main loop)
 */
void node_manager_process(node_manager_t *mgr);

/**
 * Get aggregate statistics
 */
void node_manager_get_stats(
    node_manager_t *mgr,
    uint32_t *total_nodes,
    uint32_t *running_nodes,
    uint64_t *total_messages,
    uint64_t *total_uptime
);

#endif // NODE_MANAGER_H
