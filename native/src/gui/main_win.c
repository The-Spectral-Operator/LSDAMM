/**
 * LSDAMM Native Client - Win32 GUI Implementation
 * Lackadaisical Spectral Distributed AI MCP Mesh
 * 
 * Win32 API GUI with real-time statistics dashboard
 * 
 * (c) 2025 Lackadaisical Security
 */

#ifdef _WIN32

#include "main_win.h"
#include "../util/logging.h"
#include "../mesh/swim_gossip.h"
#include "../mesh/node_coordinator.h"
#include <stdio.h>
#include <stdlib.h>
#include <windowsx.h>

#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")

// Global GUI context
static gui_context_t g_gui_ctx = {0};

// Forward declarations
static LRESULT CALLBACK MainWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
static void CreateMainMenu(HWND hwnd);
static void CreateControls(HWND hwnd);
static void InitTheme(gui_context_t *ctx, bool dark_mode);
static void DrawDashboard(HDC hdc, RECT *rect, gui_context_t *ctx);
static void OnConnect(gui_context_t *ctx);
static void OnDisconnect(gui_context_t *ctx);
static void OnSendMessage(gui_context_t *ctx);
static void OnTimerUpdate(gui_context_t *ctx);
static void ShowAboutDialog(HWND hwnd);

/**
 * Initialize GUI theme
 */
static void InitTheme(gui_context_t *ctx, bool dark_mode) {
    ctx->dark_mode = dark_mode;
    
    if (dark_mode) {
        // Dark theme - Cosmic/Space theme
        ctx->theme.bg_primary = RGB(18, 18, 24);      // Deep space black
        ctx->theme.bg_secondary = RGB(28, 28, 40);    // Dark purple-gray
        ctx->theme.bg_tertiary = RGB(38, 38, 56);     // Lighter purple-gray
        ctx->theme.text_primary = RGB(240, 240, 250); // Almost white
        ctx->theme.text_secondary = RGB(160, 160, 180); // Light gray
        ctx->theme.accent = RGB(100, 120, 255);       // Electric blue
        ctx->theme.success = RGB(80, 200, 120);       // Emerald green
        ctx->theme.warning = RGB(255, 180, 60);       // Amber
        ctx->theme.error = RGB(255, 80, 100);         // Coral red
    } else {
        // Light theme
        ctx->theme.bg_primary = RGB(255, 255, 255);
        ctx->theme.bg_secondary = RGB(245, 245, 250);
        ctx->theme.bg_tertiary = RGB(235, 235, 245);
        ctx->theme.text_primary = RGB(30, 30, 40);
        ctx->theme.text_secondary = RGB(100, 100, 120);
        ctx->theme.accent = RGB(60, 80, 200);
        ctx->theme.success = RGB(40, 160, 80);
        ctx->theme.warning = RGB(220, 140, 40);
        ctx->theme.error = RGB(200, 60, 80);
    }
    
    // Create brushes
    if (ctx->hbrush_bg) DeleteObject(ctx->hbrush_bg);
    if (ctx->hbrush_sidebar) DeleteObject(ctx->hbrush_sidebar);
    
    ctx->hbrush_bg = CreateSolidBrush(ctx->theme.bg_primary);
    ctx->hbrush_sidebar = CreateSolidBrush(ctx->theme.bg_secondary);
}

/**
 * Create main menu bar
 */
static void CreateMainMenu(HWND hwnd) {
    HMENU hMenu = CreateMenu();
    HMENU hFileMenu = CreatePopupMenu();
    HMENU hViewMenu = CreatePopupMenu();
    HMENU hHelpMenu = CreatePopupMenu();
    
    // File menu
    AppendMenuW(hFileMenu, MF_STRING, IDM_FILE_CONNECT, L"&Connect\tCtrl+C");
    AppendMenuW(hFileMenu, MF_STRING, IDM_FILE_DISCONNECT, L"&Disconnect\tCtrl+D");
    AppendMenuW(hFileMenu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(hFileMenu, MF_STRING, IDM_FILE_SETTINGS, L"&Settings\tCtrl+,");
    AppendMenuW(hFileMenu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(hFileMenu, MF_STRING, IDM_FILE_EXIT, L"E&xit\tAlt+F4");
    
    // View menu
    AppendMenuW(hViewMenu, MF_STRING, IDM_VIEW_DASHBOARD, L"&Dashboard");
    AppendMenuW(hViewMenu, MF_STRING, IDM_VIEW_NODES, L"&Nodes");
    AppendMenuW(hViewMenu, MF_STRING, IDM_VIEW_LOGS, L"&Logs");
    
    // Help menu
    AppendMenuW(hHelpMenu, MF_STRING, IDM_HELP_ABOUT, L"&About LSDAMM");
    
    // Append to main menu
    AppendMenuW(hMenu, MF_POPUP, (UINT_PTR)hFileMenu, L"&File");
    AppendMenuW(hMenu, MF_POPUP, (UINT_PTR)hViewMenu, L"&View");
    AppendMenuW(hMenu, MF_POPUP, (UINT_PTR)hHelpMenu, L"&Help");
    
    SetMenu(hwnd, hMenu);
}

/**
 * Create GUI controls
 */
static void CreateControls(HWND hwnd) {
    gui_context_t *ctx = &g_gui_ctx;
    RECT rect;
    GetClientRect(hwnd, &rect);
    
    int content_width = rect.right - SIDEBAR_WIDTH;
    int content_height = rect.bottom - TOPBAR_HEIGHT - STATUSBAR_HEIGHT;
    
    // Create fonts
    ctx->hfont_title = CreateFontW(24, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE,
                                    DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                    CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                                    DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
    
    ctx->hfont_normal = CreateFontW(14, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                                     DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                     CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                                     DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
    
    ctx->hfont_mono = CreateFontW(13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                                   DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                   CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                                   FIXED_PITCH | FF_MODERN, L"Consolas");
    
    // Status bar
    ctx->hwnd_statusbar = CreateWindowExW(0, STATUSCLASSNAMEW, NULL,
                                           WS_CHILD | WS_VISIBLE | SBARS_SIZEGRIP,
                                           0, 0, 0, 0, hwnd,
                                           (HMENU)ID_STATUSBAR, GetModuleHandle(NULL), NULL);
    
    int parts[] = {200, 400, 600, -1};
    SendMessage(ctx->hwnd_statusbar, SB_SETPARTS, 4, (LPARAM)parts);
    SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 0, (LPARAM)L"Disconnected");
    SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 1, (LPARAM)L"Nodes: 0");
    SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 2, (LPARAM)L"Messages: 0");
    SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 3, (LPARAM)L"Ready");
    
    // Connect button
    ctx->hwnd_connect_btn = CreateWindowExW(0, L"BUTTON", L"Connect",
                                             WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                             10, TOPBAR_HEIGHT + 20, 120, 36, hwnd,
                                             (HMENU)ID_CONNECT_BTN, GetModuleHandle(NULL), NULL);
    SendMessage(ctx->hwnd_connect_btn, WM_SETFONT, (WPARAM)ctx->hfont_normal, TRUE);
    
    // Disconnect button
    ctx->hwnd_disconnect_btn = CreateWindowExW(0, L"BUTTON", L"Disconnect",
                                                WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON | WS_DISABLED,
                                                140, TOPBAR_HEIGHT + 20, 120, 36, hwnd,
                                                (HMENU)ID_DISCONNECT_BTN, GetModuleHandle(NULL), NULL);
    SendMessage(ctx->hwnd_disconnect_btn, WM_SETFONT, (WPARAM)ctx->hfont_normal, TRUE);
    
    // Provider combo box
    ctx->hwnd_provider_combo = CreateWindowExW(0, L"COMBOBOX", NULL,
                                                WS_CHILD | WS_VISIBLE | CBS_DROPDOWNLIST | WS_VSCROLL,
                                                10, TOPBAR_HEIGHT + 70, SIDEBAR_WIDTH - 20, 200, hwnd,
                                                (HMENU)ID_PROVIDER_COMBO, GetModuleHandle(NULL), NULL);
    SendMessage(ctx->hwnd_provider_combo, WM_SETFONT, (WPARAM)ctx->hfont_normal, TRUE);
    SendMessageW(ctx->hwnd_provider_combo, CB_ADDSTRING, 0, (LPARAM)L"OpenAI (GPT-4o)");
    SendMessageW(ctx->hwnd_provider_combo, CB_ADDSTRING, 0, (LPARAM)L"Anthropic (Claude)");
    SendMessageW(ctx->hwnd_provider_combo, CB_ADDSTRING, 0, (LPARAM)L"Google (Gemini)");
    SendMessageW(ctx->hwnd_provider_combo, CB_ADDSTRING, 0, (LPARAM)L"xAI (Grok)");
    SendMessageW(ctx->hwnd_provider_combo, CB_ADDSTRING, 0, (LPARAM)L"Ollama (Local)");
    SendMessage(ctx->hwnd_provider_combo, CB_SETCURSEL, 1, 0);  // Default to Anthropic
    
    // Node list
    ctx->hwnd_node_list = CreateWindowExW(WS_EX_CLIENTEDGE, L"LISTBOX", NULL,
                                           WS_CHILD | WS_VISIBLE | WS_VSCROLL | LBS_NOTIFY,
                                           10, TOPBAR_HEIGHT + 140, SIDEBAR_WIDTH - 20, 200, hwnd,
                                           (HMENU)ID_NODE_LIST, GetModuleHandle(NULL), NULL);
    SendMessage(ctx->hwnd_node_list, WM_SETFONT, (WPARAM)ctx->hfont_mono, TRUE);
    
    // Message output (rich edit)
    LoadLibraryW(L"riched20.dll");
    ctx->hwnd_message_output = CreateWindowExW(WS_EX_CLIENTEDGE, RICHEDIT_CLASSW, NULL,
                                                WS_CHILD | WS_VISIBLE | WS_VSCROLL | ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL,
                                                SIDEBAR_WIDTH + 10, TOPBAR_HEIGHT + 10,
                                                content_width - 20, content_height - 80, hwnd,
                                                (HMENU)ID_MESSAGE_OUTPUT, GetModuleHandle(NULL), NULL);
    SendMessage(ctx->hwnd_message_output, WM_SETFONT, (WPARAM)ctx->hfont_mono, TRUE);
    SendMessage(ctx->hwnd_message_output, EM_SETBKGNDCOLOR, 0, ctx->theme.bg_secondary);
    
    // Message input
    ctx->hwnd_message_input = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", NULL,
                                               WS_CHILD | WS_VISIBLE | ES_MULTILINE | ES_AUTOVSCROLL,
                                               SIDEBAR_WIDTH + 10, rect.bottom - STATUSBAR_HEIGHT - 60,
                                               content_width - 100, 50, hwnd,
                                               (HMENU)ID_MESSAGE_INPUT, GetModuleHandle(NULL), NULL);
    SendMessage(ctx->hwnd_message_input, WM_SETFONT, (WPARAM)ctx->hfont_normal, TRUE);
    
    // Send button
    HWND hwnd_send = CreateWindowExW(0, L"BUTTON", L"Send",
                                      WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                      rect.right - 80, rect.bottom - STATUSBAR_HEIGHT - 60,
                                      70, 50, hwnd,
                                      (HMENU)ID_SEND_BTN, GetModuleHandle(NULL), NULL);
    SendMessage(hwnd_send, WM_SETFONT, (WPARAM)ctx->hfont_normal, TRUE);
    
    // Start update timer (100ms)
    SetTimer(hwnd, ID_TIMER_UPDATE, 100, NULL);
}

/**
 * Draw statistics dashboard
 */
static void DrawDashboard(HDC hdc, RECT *rect, gui_context_t *ctx) {
    SetBkMode(hdc, TRANSPARENT);
    
    // Title
    SetTextColor(hdc, ctx->theme.text_primary);
    SelectObject(hdc, ctx->hfont_title);
    
    wchar_t title[] = L"LSDAMM Mesh Dashboard";
    TextOutW(hdc, rect->left + 20, rect->top + 10, title, (int)wcslen(title));
    
    // Subtitle
    SetTextColor(hdc, ctx->theme.text_secondary);
    SelectObject(hdc, ctx->hfont_normal);
    
    wchar_t subtitle[] = L"Lackadaisical Spectral Distributed AI MCP Mesh";
    TextOutW(hdc, rect->left + 20, rect->top + 38, subtitle, (int)wcslen(subtitle));
    
    // Divider line
    HPEN hpen = CreatePen(PS_SOLID, 1, ctx->theme.bg_tertiary);
    SelectObject(hdc, hpen);
    MoveToEx(hdc, rect->left + 20, rect->top + 56, NULL);
    LineTo(hdc, rect->right - 20, rect->top + 56);
    DeleteObject(hpen);
}

/**
 * Window procedure
 */
static LRESULT CALLBACK MainWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    gui_context_t *ctx = &g_gui_ctx;
    
    switch (msg) {
        case WM_CREATE:
            CreateControls(hwnd);
            break;
            
        case WM_SIZE: {
            // Resize status bar
            SendMessage(ctx->hwnd_statusbar, WM_SIZE, 0, 0);
            
            // Resize controls
            RECT rect;
            GetClientRect(hwnd, &rect);
            int content_width = rect.right - SIDEBAR_WIDTH;
            int content_height = rect.bottom - TOPBAR_HEIGHT - STATUSBAR_HEIGHT;
            
            // Resize message output
            if (ctx->hwnd_message_output) {
                MoveWindow(ctx->hwnd_message_output, 
                          SIDEBAR_WIDTH + 10, TOPBAR_HEIGHT + 10,
                          content_width - 20, content_height - 80, TRUE);
            }
            
            // Resize message input
            if (ctx->hwnd_message_input) {
                MoveWindow(ctx->hwnd_message_input,
                          SIDEBAR_WIDTH + 10, rect.bottom - STATUSBAR_HEIGHT - 60,
                          content_width - 100, 50, TRUE);
            }
            break;
        }
        
        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC hdc = BeginPaint(hwnd, &ps);
            
            RECT rect;
            GetClientRect(hwnd, &rect);
            
            // Fill background
            FillRect(hdc, &rect, ctx->hbrush_bg);
            
            // Draw sidebar
            RECT sidebar_rect = {0, 0, SIDEBAR_WIDTH, rect.bottom};
            FillRect(hdc, &sidebar_rect, ctx->hbrush_sidebar);
            
            // Draw topbar
            RECT topbar_rect = {SIDEBAR_WIDTH, 0, rect.right, TOPBAR_HEIGHT};
            FillRect(hdc, &topbar_rect, ctx->hbrush_bg);
            
            // Draw dashboard content
            DrawDashboard(hdc, &topbar_rect, ctx);
            
            EndPaint(hwnd, &ps);
            break;
        }
        
        case WM_TIMER:
            if (wParam == ID_TIMER_UPDATE) {
                OnTimerUpdate(ctx);
            }
            break;
        
        case WM_COMMAND:
            switch (LOWORD(wParam)) {
                case ID_CONNECT_BTN:
                case IDM_FILE_CONNECT:
                    OnConnect(ctx);
                    break;
                    
                case ID_DISCONNECT_BTN:
                case IDM_FILE_DISCONNECT:
                    OnDisconnect(ctx);
                    break;
                    
                case IDM_FILE_SETTINGS:
                    // TODO: Open settings dialog
                    break;
                    
                case IDM_FILE_EXIT:
                    PostQuitMessage(0);
                    break;
                    
                case ID_SEND_BTN:
                    OnSendMessage(ctx);
                    break;
                    
                case IDM_HELP_ABOUT:
                    ShowAboutDialog(hwnd);
                    break;
            }
            break;
        
        case WM_CTLCOLORSTATIC:
        case WM_CTLCOLOREDIT: {
            HDC hdcStatic = (HDC)wParam;
            SetBkColor(hdcStatic, ctx->theme.bg_secondary);
            SetTextColor(hdcStatic, ctx->theme.text_primary);
            return (LRESULT)ctx->hbrush_sidebar;
        }
        
        case WM_DESTROY:
            KillTimer(hwnd, ID_TIMER_UPDATE);
            
            // Cleanup fonts
            if (ctx->hfont_title) DeleteObject(ctx->hfont_title);
            if (ctx->hfont_normal) DeleteObject(ctx->hfont_normal);
            if (ctx->hfont_mono) DeleteObject(ctx->hfont_mono);
            
            // Cleanup brushes
            if (ctx->hbrush_bg) DeleteObject(ctx->hbrush_bg);
            if (ctx->hbrush_sidebar) DeleteObject(ctx->hbrush_sidebar);
            
            PostQuitMessage(0);
            break;
        
        default:
            return DefWindowProc(hwnd, msg, wParam, lParam);
    }
    
    return 0;
}

/**
 * Connect button handler
 */
static void OnConnect(gui_context_t *ctx) {
    if (ctx->app_state) {
        // Call connect function from main.c
        extern int connect_to_mesh(void);
        if (connect_to_mesh() == 0) {
            gui_set_connection_status(ctx, true);
        }
    }
}

/**
 * Disconnect button handler
 */
static void OnDisconnect(gui_context_t *ctx) {
    if (ctx->app_state) {
        extern void disconnect_from_mesh(void);
        disconnect_from_mesh();
        gui_set_connection_status(ctx, false);
    }
}

/**
 * Send message handler
 */
static void OnSendMessage(gui_context_t *ctx) {
    wchar_t message[4096];
    GetWindowTextW(ctx->hwnd_message_input, message, 4096);
    
    if (wcslen(message) == 0) {
        return;
    }
    
    // Append user message to output
    gui_append_message(ctx, L"You", message, true);
    
    // Clear input
    SetWindowTextW(ctx->hwnd_message_input, L"");
    
    // TODO: Send message to mesh server
    ctx->stats.messages_sent++;
    
    // Simulate AI response for now
    gui_append_message(ctx, L"Claude", L"[Processing your request...]", false);
}

/**
 * Timer update handler
 */
static void OnTimerUpdate(gui_context_t *ctx) {
    ctx->stats.uptime_seconds++;
    
    // Update status bar
    wchar_t status[256];
    
    if (ctx->app_state && ((app_state_t*)ctx->app_state)->is_connected) {
        swprintf(status, 256, L"Connected to Mesh");
    } else {
        swprintf(status, 256, L"Disconnected");
    }
    SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 0, (LPARAM)status);
    
    swprintf(status, 256, L"Nodes: %d", ctx->stats.active_nodes);
    SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 1, (LPARAM)status);
    
    swprintf(status, 256, L"Msgs: %llu sent, %llu recv", 
             ctx->stats.messages_sent, ctx->stats.messages_received);
    SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 2, (LPARAM)status);
    
    swprintf(status, 256, L"Latency: %.1f ms", ctx->stats.avg_latency_ms);
    SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 3, (LPARAM)status);
}

/**
 * Show about dialog
 */
static void ShowAboutDialog(HWND hwnd) {
    MessageBoxW(hwnd,
                L"LSDAMM - Lackadaisical Spectral Distributed AI MCP Mesh\n\n"
                L"Version 1.0.0\n\n"
                L"A distributed AI coordination platform with SWIM gossip protocol,\n"
                L"extended thinking, vision, and TTS capabilities.\n\n"
                L"© 2025 Lackadaisical Security\n"
                L"https://lackadaisical-security.com",
                L"About LSDAMM",
                MB_OK | MB_ICONINFORMATION);
}

/**
 * Update connection status in GUI
 */
void gui_set_connection_status(gui_context_t *ctx, bool connected) {
    EnableWindow(ctx->hwnd_connect_btn, !connected);
    EnableWindow(ctx->hwnd_disconnect_btn, connected);
    
    if (connected) {
        SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 0, (LPARAM)L"Connected");
    } else {
        SendMessageW(ctx->hwnd_statusbar, SB_SETTEXTW, 0, (LPARAM)L"Disconnected");
    }
}

/**
 * Append message to output
 */
void gui_append_message(gui_context_t *ctx, const wchar_t *sender, const wchar_t *message, bool is_user) {
    // Set selection to end
    int length = GetWindowTextLengthW(ctx->hwnd_message_output);
    SendMessage(ctx->hwnd_message_output, EM_SETSEL, length, length);
    
    // Format message
    wchar_t formatted[8192];
    swprintf(formatted, 8192, L"\r\n[%s]: %s", sender, message);
    
    // Set text color based on sender
    CHARFORMAT2W cf = {0};
    cf.cbSize = sizeof(cf);
    cf.dwMask = CFM_COLOR;
    cf.crTextColor = is_user ? ctx->theme.accent : ctx->theme.success;
    SendMessage(ctx->hwnd_message_output, EM_SETCHARFORMAT, SCF_SELECTION, (LPARAM)&cf);
    
    // Append text
    SendMessageW(ctx->hwnd_message_output, EM_REPLACESEL, FALSE, (LPARAM)formatted);
    
    // Scroll to bottom
    SendMessage(ctx->hwnd_message_output, WM_VSCROLL, SB_BOTTOM, 0);
}

/**
 * Update node list
 */
void gui_update_node_list(gui_context_t *ctx) {
    // Clear list
    SendMessage(ctx->hwnd_node_list, LB_RESETCONTENT, 0, 0);
    
    // TODO: Get nodes from SWIM context and add to list
    SendMessageW(ctx->hwnd_node_list, LB_ADDSTRING, 0, (LPARAM)L"● Local Node (self)");
}

/**
 * Update statistics
 */
void gui_update_stats(gui_context_t *ctx) {
    // Stats are updated in OnTimerUpdate
    (void)ctx;
}

/**
 * Main GUI entry point
 */
int gui_main(HINSTANCE hInstance, int nCmdShow, app_state_t *app_state) {
    // Initialize common controls
    INITCOMMONCONTROLSEX icc = {0};
    icc.dwSize = sizeof(icc);
    icc.dwICC = ICC_STANDARD_CLASSES | ICC_BAR_CLASSES | ICC_LISTVIEW_CLASSES;
    InitCommonControlsEx(&icc);
    
    // Store app state reference
    g_gui_ctx.app_state = app_state;
    
    // Initialize theme
    InitTheme(&g_gui_ctx, true);  // Dark mode by default
    
    // Register window class
    WNDCLASSEXW wc = {0};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = MainWndProc;
    wc.hInstance = hInstance;
    wc.hIcon = LoadIcon(NULL, IDI_APPLICATION);
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = g_gui_ctx.hbrush_bg;
    wc.lpszClassName = LSDAMM_MAIN_CLASS;
    wc.hIconSm = LoadIcon(NULL, IDI_APPLICATION);
    
    if (!RegisterClassExW(&wc)) {
        MessageBoxW(NULL, L"Window class registration failed", L"Error", MB_OK | MB_ICONERROR);
        return 1;
    }
    
    // Create main window
    HWND hwnd = CreateWindowExW(0, LSDAMM_MAIN_CLASS,
                                 L"LSDAMM - Lackadaisical Spectral Distributed AI MCP Mesh",
                                 WS_OVERLAPPEDWINDOW,
                                 CW_USEDEFAULT, CW_USEDEFAULT,
                                 MAIN_WINDOW_WIDTH, MAIN_WINDOW_HEIGHT,
                                 NULL, NULL, hInstance, NULL);
    
    if (!hwnd) {
        MessageBoxW(NULL, L"Window creation failed", L"Error", MB_OK | MB_ICONERROR);
        return 1;
    }
    
    g_gui_ctx.hwnd_main = hwnd;
    
    // Create menu
    CreateMainMenu(hwnd);
    
    // Show window
    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);
    
    // Message loop
    MSG msg = {0};
    while (GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
    
    return (int)msg.wParam;
}

#endif // _WIN32
