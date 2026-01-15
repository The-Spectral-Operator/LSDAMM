/**
 * LSDAMM - Node Coordinator Implementation
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * (c) 2025 Lackadaisical Security
 */

#include "node_coordinator.h"
#include "../util/logging.h"
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

// Get current time in milliseconds
static int64_t get_time_ms(void) {
#ifdef _WIN32
    return GetTickCount64();
#else
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (ts.tv_sec * 1000) + (ts.tv_nsec / 1000000);
#endif
}

// Generate random election timeout (150-300ms)
static int64_t random_election_timeout(void) {
    return 150 + (rand() % 150);
}

// Node event callback
static void on_node_event(swim_node_t *node, swim_node_state_t old_state,
                          swim_node_state_t new_state, void *user_data) {
    node_coordinator_t *coord = (node_coordinator_t*)user_data;
    
    // If leader went down, start election
    if (strcmp(node->id, coord->leader_id) == 0 && new_state != NODE_STATE_ALIVE) {
        log_info("COORD: Leader %s is no longer alive, starting election", node->id);
        coordinator_start_election(coord);
    }
}

/**
 * Initialize coordinator
 */
node_coordinator_t* coordinator_init(swim_context_t *swim, bool start_as_main) {
    node_coordinator_t *coord = (node_coordinator_t*)calloc(1, sizeof(node_coordinator_t));
    if (!coord) return NULL;
    
    coord->swim = swim;
    coord->is_main_node = start_as_main;
    coord->state = start_as_main ? COORD_STATE_LEADER : COORD_STATE_FOLLOWER;
    coord->term = 1;
    coord->election_timeout = get_time_ms() + random_election_timeout();
    
    if (start_as_main) {
        // Set self as leader
        swim_node_t *local = swim_get_local_node(swim);
        if (local) {
            strncpy(coord->leader_id, local->id, sizeof(coord->leader_id) - 1);
            swim_set_main_node(swim, true);
        }
        log_info("COORD: Starting as main node (leader)");
    } else {
        log_info("COORD: Starting as follower node");
    }
    
    // Register for node events
    swim_set_node_callback(swim, on_node_event, coord);
    
    return coord;
}

/**
 * Destroy coordinator
 */
void coordinator_destroy(node_coordinator_t *coord) {
    if (!coord) return;
    
    // Free pending tasks
    task_t *task = coord->pending_tasks;
    while (task) {
        task_t *next = task->next;
        if (task->payload) free(task->payload);
        free(task);
        task = next;
    }
    
    // Free completed tasks
    task = coord->completed_tasks;
    while (task) {
        task_t *next = task->next;
        if (task->payload) free(task->payload);
        free(task);
        task = next;
    }
    
    free(coord);
}

/**
 * Process coordinator events
 */
void coordinator_process(node_coordinator_t *coord) {
    int64_t now = get_time_ms();
    
    switch (coord->state) {
        case COORD_STATE_FOLLOWER:
            // Check if election timeout expired
            if (now > coord->election_timeout) {
                log_info("COORD: Election timeout expired, starting election");
                coordinator_start_election(coord);
            }
            break;
            
        case COORD_STATE_CANDIDATE:
            // Check if we have enough votes
            // In simple implementation, if we're the only node or have most votes, become leader
            {
                uint32_t alive = swim_get_node_count(coord->swim, NODE_STATE_ALIVE);
                if (coord->votes_received > alive / 2) {
                    coord->state = COORD_STATE_LEADER;
                    swim_node_t *local = swim_get_local_node(coord->swim);
                    if (local) {
                        strncpy(coord->leader_id, local->id, sizeof(coord->leader_id) - 1);
                        swim_set_main_node(coord->swim, true);
                    }
                    coord->is_main_node = true;
                    log_info("COORD: Won election, now leader");
                    
                    if (coord->on_become_leader) {
                        coord->on_become_leader(coord->user_data);
                    }
                }
            }
            break;
            
        case COORD_STATE_LEADER:
            // Process pending tasks
            {
                task_t *task = coord->pending_tasks;
                while (task) {
                    // For now, just mark as processed
                    // In real implementation, would distribute to nodes
                    coord->tasks_processed++;
                    
                    // Move to completed
                    task_t *next = task->next;
                    task->next = coord->completed_tasks;
                    coord->completed_tasks = task;
                    coord->completed_count++;
                    coord->pending_count--;
                    
                    if (coord->on_task_complete) {
                        coord->on_task_complete(task->task_id, true, coord->user_data);
                    }
                    
                    task = next;
                }
                coord->pending_tasks = NULL;
            }
            break;
    }
}

/**
 * Submit a task
 */
int coordinator_submit_task(node_coordinator_t *coord, task_type_t type,
                            const uint8_t *payload, size_t len) {
    task_t *task = (task_t*)calloc(1, sizeof(task_t));
    if (!task) return -1;
    
    // Generate task ID
    snprintf(task->task_id, sizeof(task->task_id), "task-%ld-%d",
             (long)time(NULL), rand() % 10000);
    
    task->type = type;
    task->created_at = get_time_ms();
    task->deadline = task->created_at + 30000;  // 30 second deadline
    
    if (payload && len > 0) {
        task->payload = (uint8_t*)malloc(len);
        if (task->payload) {
            memcpy(task->payload, payload, len);
            task->payload_len = len;
        }
    }
    
    // Add to pending queue
    task->next = coord->pending_tasks;
    coord->pending_tasks = task;
    coord->pending_count++;
    
    log_debug("COORD: Submitted task %s", task->task_id);
    
    return 0;
}

/**
 * Get current leader
 */
const char* coordinator_get_leader(node_coordinator_t *coord) {
    return coord->leader_id;
}

/**
 * Check if this node is leader
 */
bool coordinator_is_leader(node_coordinator_t *coord) {
    return coord->state == COORD_STATE_LEADER;
}

/**
 * Start election
 */
void coordinator_start_election(node_coordinator_t *coord) {
    coord->state = COORD_STATE_CANDIDATE;
    coord->term++;
    coord->votes_received = 1;  // Vote for self
    coord->election_timeout = get_time_ms() + random_election_timeout();
    
    log_info("COORD: Starting election for term %d", coord->term);
    
    // In a full implementation, would broadcast RequestVote to all nodes
    // For now, simplified: if no other candidates, become leader
    uint32_t alive = swim_get_node_count(coord->swim, NODE_STATE_ALIVE);
    if (alive <= 1) {
        coord->state = COORD_STATE_LEADER;
        swim_node_t *local = swim_get_local_node(coord->swim);
        if (local) {
            strncpy(coord->leader_id, local->id, sizeof(coord->leader_id) - 1);
            swim_set_main_node(coord->swim, true);
        }
        coord->is_main_node = true;
        log_info("COORD: No other nodes, automatically becoming leader");
        
        if (coord->on_become_leader) {
            coord->on_become_leader(coord->user_data);
        }
    }
}

/**
 * Set callbacks
 */
void coordinator_set_callbacks(node_coordinator_t *coord,
                               void (*on_become_leader)(void*),
                               void (*on_lose_leadership)(void*),
                               void (*on_task_complete)(const char*, bool, void*),
                               void *user_data) {
    coord->on_become_leader = on_become_leader;
    coord->on_lose_leadership = on_lose_leadership;
    coord->on_task_complete = on_task_complete;
    coord->user_data = user_data;
}

/**
 * Get pending count
 */
uint32_t coordinator_pending_count(node_coordinator_t *coord) {
    return coord->pending_count;
}

/**
 * Get statistics
 */
void coordinator_get_stats(node_coordinator_t *coord,
                           uint64_t *processed,
                           uint64_t *failed,
                           double *avg_latency) {
    if (processed) *processed = coord->tasks_processed;
    if (failed) *failed = coord->tasks_failed;
    if (avg_latency) *avg_latency = coord->avg_task_latency_ms;
}
