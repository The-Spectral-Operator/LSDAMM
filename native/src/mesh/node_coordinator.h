/**
 * LSDAMM - Node Coordinator Header
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Coordinates nodes in the mesh, manages main node election,
 * and handles task distribution.
 * 
 * (c) 2025 Lackadaisical Security
 */

#ifndef NODE_COORDINATOR_H
#define NODE_COORDINATOR_H

#include <stdint.h>
#include <stdbool.h>
#include "swim_gossip.h"

// Coordinator states
typedef enum {
    COORD_STATE_FOLLOWER = 0,
    COORD_STATE_CANDIDATE,
    COORD_STATE_LEADER
} coordinator_state_t;

// Task types
typedef enum {
    TASK_TYPE_AI_REQUEST = 0,
    TASK_TYPE_MEMORY_SYNC,
    TASK_TYPE_BROADCAST,
    TASK_TYPE_HEALTH_CHECK
} task_type_t;

// Task structure
typedef struct task {
    char task_id[64];
    task_type_t type;
    char assigned_node[64];
    uint8_t *payload;
    size_t payload_len;
    int64_t created_at;
    int64_t deadline;
    int retries;
    struct task *next;
} task_t;

// Coordinator context
typedef struct node_coordinator {
    swim_context_t *swim;
    coordinator_state_t state;
    bool is_main_node;
    
    // Leader info
    char leader_id[64];
    int64_t leader_last_seen;
    
    // Election state
    uint32_t term;
    int64_t election_timeout;
    int votes_received;
    
    // Task queue
    task_t *pending_tasks;
    task_t *completed_tasks;
    uint32_t pending_count;
    uint32_t completed_count;
    
    // Statistics
    uint64_t tasks_processed;
    uint64_t tasks_failed;
    double avg_task_latency_ms;
    
    // Callbacks
    void (*on_become_leader)(void *user_data);
    void (*on_lose_leadership)(void *user_data);
    void (*on_task_complete)(const char *task_id, bool success, void *user_data);
    void *user_data;
} node_coordinator_t;

// API Functions

/**
 * Initialize coordinator
 */
node_coordinator_t* coordinator_init(swim_context_t *swim, bool start_as_main);

/**
 * Destroy coordinator
 */
void coordinator_destroy(node_coordinator_t *coord);

/**
 * Process coordinator events (call from main loop)
 */
void coordinator_process(node_coordinator_t *coord);

/**
 * Submit a task for processing
 */
int coordinator_submit_task(node_coordinator_t *coord, task_type_t type,
                            const uint8_t *payload, size_t len);

/**
 * Get current leader ID
 */
const char* coordinator_get_leader(node_coordinator_t *coord);

/**
 * Check if this node is the leader
 */
bool coordinator_is_leader(node_coordinator_t *coord);

/**
 * Force election (for testing)
 */
void coordinator_start_election(node_coordinator_t *coord);

/**
 * Set callbacks
 */
void coordinator_set_callbacks(node_coordinator_t *coord,
                               void (*on_become_leader)(void*),
                               void (*on_lose_leadership)(void*),
                               void (*on_task_complete)(const char*, bool, void*),
                               void *user_data);

/**
 * Get pending task count
 */
uint32_t coordinator_pending_count(node_coordinator_t *coord);

/**
 * Get statistics
 */
void coordinator_get_stats(node_coordinator_t *coord,
                           uint64_t *processed,
                           uint64_t *failed,
                           double *avg_latency);

#endif // NODE_COORDINATOR_H
