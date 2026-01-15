/**
 * LSDAMM Native Client - Win32 GUI Implementation
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Win32 API GUI with real-time statistics dashboard
 * 
 * (c) 2025 Lackadaisical Security
 */

#ifndef MAIN_WIN_H
#define MAIN_WIN_H

#ifdef _WIN32

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <richedit.h>
#include <shellapi.h>
#include <stdint.h>
#include <stdbool.h>

// Forward declarations
typedef struct app_state_t app_state_t;

// Window class names
#define LSDAMM_MAIN_CLASS   L"LSDAMM_MainWindow"
#define LSDAMM_DASH_CLASS   L"LSDAMM_Dashboard"

// Window dimensions
#define MAIN_WINDOW_WIDTH   1280
#define MAIN_WINDOW_HEIGHT  800
#define SIDEBAR_WIDTH       280
#define TOPBAR_HEIGHT       60
#define STATUSBAR_HEIGHT    24

// Control IDs
#define ID_STATUSBAR        1001
#define ID_CONNECT_BTN      1002
#define ID_DISCONNECT_BTN   1003
#define ID_SETTINGS_BTN     1004
#define ID_SEND_BTN         1005
#define ID_MESSAGE_INPUT    1006
#define ID_MESSAGE_OUTPUT   1007
#define ID_NODE_LIST        1008
#define ID_PROVIDER_COMBO   1009
#define ID_MODEL_COMBO      1010
#define ID_STATS_PANEL      1011
#define ID_TIMER_UPDATE     2001

// Menu IDs
#define IDM_FILE_CONNECT    3001
#define IDM_FILE_DISCONNECT 3002
#define IDM_FILE_SETTINGS   3003
#define IDM_FILE_EXIT       3004
#define IDM_VIEW_DASHBOARD  3005
#define IDM_VIEW_NODES      3006
#define IDM_VIEW_LOGS       3007
#define IDM_HELP_ABOUT      3008

// Statistics structure
typedef struct {
    uint64_t messages_sent;
    uint64_t messages_received;
    uint64_t bytes_sent;
    uint64_t bytes_received;
    uint32_t active_nodes;
    uint32_t uptime_seconds;
    double avg_latency_ms;
    double cpu_usage;
    double memory_usage_mb;
    uint32_t tokens_used;
    double cost_usd;
} gui_stats_t;

// Theme colors
typedef struct {
    COLORREF bg_primary;
    COLORREF bg_secondary;
    COLORREF bg_tertiary;
    COLORREF text_primary;
    COLORREF text_secondary;
    COLORREF accent;
    COLORREF success;
    COLORREF warning;
    COLORREF error;
} gui_theme_t;

// GUI context
typedef struct {
    HWND hwnd_main;
    HWND hwnd_statusbar;
    HWND hwnd_sidebar;
    HWND hwnd_content;
    HWND hwnd_message_input;
    HWND hwnd_message_output;
    HWND hwnd_node_list;
    HWND hwnd_provider_combo;
    HWND hwnd_model_combo;
    HWND hwnd_stats_panel;
    HWND hwnd_connect_btn;
    HWND hwnd_disconnect_btn;
    
    HFONT hfont_title;
    HFONT hfont_normal;
    HFONT hfont_mono;
    
    HBRUSH hbrush_bg;
    HBRUSH hbrush_sidebar;
    
    gui_theme_t theme;
    gui_stats_t stats;
    
    app_state_t *app_state;
    bool dark_mode;
} gui_context_t;

// Function declarations
int gui_main(HINSTANCE hInstance, int nCmdShow, app_state_t *app_state);
void gui_update_stats(gui_context_t *ctx);
void gui_update_node_list(gui_context_t *ctx);
void gui_append_message(gui_context_t *ctx, const wchar_t *sender, const wchar_t *message, bool is_user);
void gui_set_connection_status(gui_context_t *ctx, bool connected);

#endif // _WIN32

#endif // MAIN_WIN_H
