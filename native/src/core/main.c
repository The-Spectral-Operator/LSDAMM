/**
 * LSDAMM Native Client - Main Entry Point
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Win32 GUI Application with SWIM Gossip Protocol
 * Build: MinGW64/GCC + NASM
 * 
 * (c) 2025 Lackadaisical Security
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
#else
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#endif

#include "../gui/main_win.h"
#include "../mesh/swim_gossip.h"
#include "../mesh/node_coordinator.h"
#include "../network/websocket.h"
#include "../util/config.h"
#include "../util/logging.h"

// Application version
#define LSDAMM_VERSION_MAJOR 1
#define LSDAMM_VERSION_MINOR 0
#define LSDAMM_VERSION_PATCH 0

// Global application state
typedef struct {
    bool is_running;
    bool is_connected;
    bool is_main_node;
    char node_id[64];
    char server_url[256];
    swim_context_t *swim_ctx;
    node_coordinator_t *coordinator;
    ws_client_t *ws_client;
    config_t config;
} app_state_t;

static app_state_t g_app_state = {0};

/**
 * Initialize Windows sockets
 */
static int init_networking(void) {
#ifdef _WIN32
    WSADATA wsa_data;
    int result = WSAStartup(MAKEWORD(2, 2), &wsa_data);
    if (result != 0) {
        log_error("WSAStartup failed: %d", result);
        return -1;
    }
#endif
    return 0;
}

/**
 * Cleanup Windows sockets
 */
static void cleanup_networking(void) {
#ifdef _WIN32
    WSACleanup();
#endif
}

/**
 * Generate unique node ID
 */
static void generate_node_id(char *buffer, size_t size) {
#ifdef _WIN32
    GUID guid;
    CoCreateGuid(&guid);
    snprintf(buffer, size, "%08lX-%04X-%04X-%02X%02X-%02X%02X%02X%02X%02X%02X",
             guid.Data1, guid.Data2, guid.Data3,
             guid.Data4[0], guid.Data4[1], guid.Data4[2], guid.Data4[3],
             guid.Data4[4], guid.Data4[5], guid.Data4[6], guid.Data4[7]);
#else
    // Use /dev/urandom on Linux
    FILE *f = fopen("/dev/urandom", "rb");
    if (f) {
        uint8_t bytes[16];
        fread(bytes, 1, 16, f);
        fclose(f);
        snprintf(buffer, size, "%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%02X%02X%02X",
                 bytes[0], bytes[1], bytes[2], bytes[3],
                 bytes[4], bytes[5], bytes[6], bytes[7],
                 bytes[8], bytes[9], bytes[10], bytes[11],
                 bytes[12], bytes[13], bytes[14], bytes[15]);
    }
#endif
}

/**
 * Initialize application
 */
static int init_application(void) {
    // Initialize logging
    if (log_init("lsdamm.log", LOG_LEVEL_DEBUG) != 0) {
        fprintf(stderr, "Failed to initialize logging\n");
        return -1;
    }
    
    log_info("LSDAMM Native Client v%d.%d.%d starting...", 
             LSDAMM_VERSION_MAJOR, LSDAMM_VERSION_MINOR, LSDAMM_VERSION_PATCH);
    
    // Load configuration
    if (config_load(&g_app_state.config, "lsdamm.toml") != 0) {
        log_warn("Failed to load config, using defaults");
        config_set_defaults(&g_app_state.config);
    }
    
    // Generate unique node ID
    generate_node_id(g_app_state.node_id, sizeof(g_app_state.node_id));
    log_info("Node ID: %s", g_app_state.node_id);
    
    // Initialize networking
    if (init_networking() != 0) {
        log_error("Failed to initialize networking");
        return -1;
    }
    
    // Initialize SWIM gossip protocol
    g_app_state.swim_ctx = swim_init(g_app_state.node_id, 
                                      g_app_state.config.swim_port,
                                      g_app_state.config.swim_interval_ms);
    if (!g_app_state.swim_ctx) {
        log_error("Failed to initialize SWIM gossip protocol");
        return -1;
    }
    
    // Initialize node coordinator
    g_app_state.coordinator = coordinator_init(g_app_state.swim_ctx,
                                                g_app_state.config.is_main_node);
    if (!g_app_state.coordinator) {
        log_error("Failed to initialize node coordinator");
        return -1;
    }
    
    // Set server URL from config
    strncpy(g_app_state.server_url, g_app_state.config.server_url, 
            sizeof(g_app_state.server_url) - 1);
    
    g_app_state.is_running = true;
    g_app_state.is_main_node = g_app_state.config.is_main_node;
    
    log_info("Application initialized successfully");
    return 0;
}

/**
 * Cleanup application
 */
static void cleanup_application(void) {
    log_info("Shutting down application...");
    
    g_app_state.is_running = false;
    
    // Cleanup WebSocket
    if (g_app_state.ws_client) {
        ws_disconnect(g_app_state.ws_client);
        ws_destroy(g_app_state.ws_client);
        g_app_state.ws_client = NULL;
    }
    
    // Cleanup coordinator
    if (g_app_state.coordinator) {
        coordinator_destroy(g_app_state.coordinator);
        g_app_state.coordinator = NULL;
    }
    
    // Cleanup SWIM
    if (g_app_state.swim_ctx) {
        swim_destroy(g_app_state.swim_ctx);
        g_app_state.swim_ctx = NULL;
    }
    
    // Cleanup networking
    cleanup_networking();
    
    // Cleanup logging
    log_shutdown();
}

/**
 * Get application state (for GUI access)
 */
app_state_t* get_app_state(void) {
    return &g_app_state;
}

/**
 * Connect to mesh server
 */
int connect_to_mesh(void) {
    if (g_app_state.is_connected) {
        log_warn("Already connected to mesh");
        return 0;
    }
    
    log_info("Connecting to mesh: %s", g_app_state.server_url);
    
    g_app_state.ws_client = ws_create(g_app_state.server_url);
    if (!g_app_state.ws_client) {
        log_error("Failed to create WebSocket client");
        return -1;
    }
    
    if (ws_connect(g_app_state.ws_client) != 0) {
        log_error("Failed to connect to mesh server");
        ws_destroy(g_app_state.ws_client);
        g_app_state.ws_client = NULL;
        return -1;
    }
    
    g_app_state.is_connected = true;
    log_info("Connected to mesh successfully");
    
    // Start SWIM gossip
    swim_start(g_app_state.swim_ctx);
    
    return 0;
}

/**
 * Disconnect from mesh server
 */
void disconnect_from_mesh(void) {
    if (!g_app_state.is_connected) {
        return;
    }
    
    log_info("Disconnecting from mesh...");
    
    // Stop SWIM gossip
    swim_stop(g_app_state.swim_ctx);
    
    if (g_app_state.ws_client) {
        ws_disconnect(g_app_state.ws_client);
        ws_destroy(g_app_state.ws_client);
        g_app_state.ws_client = NULL;
    }
    
    g_app_state.is_connected = false;
    log_info("Disconnected from mesh");
}

#ifdef _WIN32
/**
 * Windows main entry point
 */
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, 
                   LPSTR lpCmdLine, int nCmdShow) {
    (void)hPrevInstance;
    (void)lpCmdLine;
    
    // Initialize COM for GUID generation
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    
    // Initialize application
    if (init_application() != 0) {
        MessageBoxA(NULL, "Failed to initialize application", 
                    "LSDAMM Error", MB_OK | MB_ICONERROR);
        return 1;
    }
    
    // Create and run GUI
    int result = gui_main(hInstance, nCmdShow, &g_app_state);
    
    // Cleanup
    cleanup_application();
    CoUninitialize();
    
    return result;
}
#else
/**
 * Linux/Unix main entry point
 */
int main(int argc, char *argv[]) {
    (void)argc;
    (void)argv;
    
    // Initialize application
    if (init_application() != 0) {
        fprintf(stderr, "Failed to initialize application\n");
        return 1;
    }
    
    // For non-Windows, run in console mode or with GTK
    log_info("Running in console mode (GUI not available on this platform)");
    
    // Simple event loop
    while (g_app_state.is_running) {
        // Process SWIM gossip
        if (g_app_state.swim_ctx) {
            swim_process(g_app_state.swim_ctx);
        }
        
        // Process WebSocket
        if (g_app_state.ws_client && g_app_state.is_connected) {
            ws_process(g_app_state.ws_client);
        }
        
        // Sleep a bit
        usleep(10000);  // 10ms
    }
    
    // Cleanup
    cleanup_application();
    
    return 0;
}
#endif
