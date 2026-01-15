/**
 * LSDAMM - SWIM Gossip Protocol Tests
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * (c) 2025 Lackadaisical Security
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "../src/mesh/swim_gossip.h"
#include "../src/util/logging.h"

#define TEST_PASS() printf("  PASS\n")
#define TEST_FAIL(msg) do { printf("  FAIL: %s\n", msg); return 1; } while(0)

/**
 * Test SWIM context initialization
 */
int test_swim_init(void) {
    printf("Testing swim_init...\n");
    
    swim_context_t *ctx = swim_init("test-node-1", 7946, 1000);
    if (!ctx) {
        TEST_FAIL("Failed to create SWIM context");
    }
    
    // Check local node exists
    swim_node_t *local = swim_get_local_node(ctx);
    if (!local) {
        swim_destroy(ctx);
        TEST_FAIL("Local node not created");
    }
    
    if (strcmp(local->id, "test-node-1") != 0) {
        swim_destroy(ctx);
        TEST_FAIL("Local node ID mismatch");
    }
    
    if (!local->is_local) {
        swim_destroy(ctx);
        TEST_FAIL("Local node not marked as local");
    }
    
    swim_destroy(ctx);
    TEST_PASS();
    return 0;
}

/**
 * Test node count
 */
int test_node_count(void) {
    printf("Testing swim_get_node_count...\n");
    
    swim_context_t *ctx = swim_init("test-node-2", 7947, 1000);
    if (!ctx) {
        TEST_FAIL("Failed to create SWIM context");
    }
    
    // Should have 1 node (local)
    uint32_t alive = swim_get_node_count(ctx, NODE_STATE_ALIVE);
    if (alive != 1) {
        swim_destroy(ctx);
        TEST_FAIL("Expected 1 alive node");
    }
    
    uint32_t dead = swim_get_node_count(ctx, NODE_STATE_DEAD);
    if (dead != 0) {
        swim_destroy(ctx);
        TEST_FAIL("Expected 0 dead nodes");
    }
    
    swim_destroy(ctx);
    TEST_PASS();
    return 0;
}

/**
 * Test node lookup
 */
int test_node_lookup(void) {
    printf("Testing swim_find_node...\n");
    
    swim_context_t *ctx = swim_init("test-node-3", 7948, 1000);
    if (!ctx) {
        TEST_FAIL("Failed to create SWIM context");
    }
    
    // Find local node
    swim_node_t *found = swim_find_node(ctx, "test-node-3");
    if (!found) {
        swim_destroy(ctx);
        TEST_FAIL("Failed to find local node");
    }
    
    // Try to find non-existent node
    swim_node_t *not_found = swim_find_node(ctx, "non-existent");
    if (not_found) {
        swim_destroy(ctx);
        TEST_FAIL("Found non-existent node");
    }
    
    swim_destroy(ctx);
    TEST_PASS();
    return 0;
}

/**
 * Test main node setting
 */
int test_main_node(void) {
    printf("Testing swim_set_main_node...\n");
    
    swim_context_t *ctx = swim_init("test-node-4", 7949, 1000);
    if (!ctx) {
        TEST_FAIL("Failed to create SWIM context");
    }
    
    swim_set_main_node(ctx, true);
    
    swim_node_t *local = swim_get_local_node(ctx);
    if (!local->is_main_node) {
        swim_destroy(ctx);
        TEST_FAIL("Main node not set");
    }
    
    swim_set_main_node(ctx, false);
    
    if (local->is_main_node) {
        swim_destroy(ctx);
        TEST_FAIL("Main node not cleared");
    }
    
    swim_destroy(ctx);
    TEST_PASS();
    return 0;
}

/**
 * Test statistics
 */
int test_statistics(void) {
    printf("Testing swim_get_stats...\n");
    
    swim_context_t *ctx = swim_init("test-node-5", 7950, 1000);
    if (!ctx) {
        TEST_FAIL("Failed to create SWIM context");
    }
    
    uint64_t sent, received, success, failure;
    swim_get_stats(ctx, &sent, &received, &success, &failure);
    
    // Initial stats should be 0
    if (sent != 0 || received != 0 || success != 0 || failure != 0) {
        swim_destroy(ctx);
        TEST_FAIL("Initial stats not zero");
    }
    
    swim_destroy(ctx);
    TEST_PASS();
    return 0;
}

/**
 * Run all tests
 */
int main(void) {
    printf("\n========================================\n");
    printf("LSDAMM SWIM Gossip Protocol Tests\n");
    printf("========================================\n\n");
    
    // Initialize logging
    log_init(NULL, LOG_LEVEL_WARN);
    
    int failures = 0;
    
    failures += test_swim_init();
    failures += test_node_count();
    failures += test_node_lookup();
    failures += test_main_node();
    failures += test_statistics();
    
    printf("\n----------------------------------------\n");
    if (failures == 0) {
        printf("All tests passed!\n");
    } else {
        printf("Tests failed: %d\n", failures);
    }
    printf("----------------------------------------\n\n");
    
    log_shutdown();
    
    return failures;
}
