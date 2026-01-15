/**
 * LSDAMM Desktop Client - Main Process
 * Electron main process entry point
 */

import { app, BrowserWindow, ipcMain, Menu, Tray, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Store from 'electron-store';
import { MeshClient } from './services/mesh_client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Store for persisting settings
const store = new Store({
  name: 'lsdamm-config',
  defaults: {
    serverUrl: 'wss://mesh.lackadaisical-security.com/ws',
    authToken: '',
    clientId: '',
    theme: 'system',
    minimizeToTray: true,
  },
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let meshClient: MeshClient | null = null;

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'LSDAMM Desktop',
    icon: path.join(__dirname, '../build/icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  }

  // Show window when ready
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle window close
  mainWindow.on('close', (event) => {
    if (store.get('minimizeToTray') && tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Create system tray
 */
function createTray(): void {
  const iconPath = path.join(__dirname, '../build/tray-icon.png');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show LSDAMM',
      click: () => {
        mainWindow?.show();
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Connection Status',
      enabled: false,
    },
    {
      label: meshClient?.isConnected() ? '● Connected' : '○ Disconnected',
      enabled: false,
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('LSDAMM Desktop');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
    }
  });
}

/**
 * Initialize mesh client
 */
function initializeMeshClient(): void {
  const serverUrl = store.get('serverUrl') as string;
  const authToken = store.get('authToken') as string;
  const clientId = store.get('clientId') as string;

  if (!authToken || !clientId) {
    console.log('Mesh client not configured - auth token or client ID missing');
    return;
  }

  meshClient = new MeshClient(serverUrl, clientId, authToken);
  
  meshClient.on('connected', () => {
    console.log('Connected to mesh server');
    mainWindow?.webContents.send('mesh:connected');
    updateTrayMenu();
  });

  meshClient.on('disconnected', () => {
    console.log('Disconnected from mesh server');
    mainWindow?.webContents.send('mesh:disconnected');
    updateTrayMenu();
  });

  meshClient.on('message', (message) => {
    mainWindow?.webContents.send('mesh:message', message);
  });

  meshClient.on('error', (error) => {
    console.error('Mesh client error:', error);
    mainWindow?.webContents.send('mesh:error', error.message);
  });

  meshClient.connect();
}

/**
 * Update tray menu
 */
function updateTrayMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show LSDAMM',
      click: () => {
        mainWindow?.show();
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Connection Status',
      enabled: false,
    },
    {
      label: meshClient?.isConnected() ? '● Connected' : '○ Disconnected',
      enabled: false,
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Set up IPC handlers
 */
function setupIpcHandlers(): void {
  // Settings
  ipcMain.handle('settings:get', (_event, key: string) => {
    return store.get(key);
  });

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    store.set(key, value);
  });

  // Mesh client
  ipcMain.handle('mesh:connect', () => {
    if (meshClient) {
      meshClient.connect();
    } else {
      initializeMeshClient();
    }
  });

  ipcMain.handle('mesh:disconnect', () => {
    meshClient?.disconnect();
  });

  ipcMain.handle('mesh:send', (_event, message: unknown) => {
    meshClient?.send(message);
  });

  ipcMain.handle('mesh:status', () => {
    return {
      connected: meshClient?.isConnected() ?? false,
      serverUrl: store.get('serverUrl'),
    };
  });

  // AI requests
  ipcMain.handle('ai:complete', async (_event, prompt: string, options?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    return new Promise((resolve, reject) => {
      if (!meshClient?.isConnected()) {
        reject(new Error('Not connected to mesh server'));
        return;
      }

      const messageId = meshClient.sendMessage(prompt, options);
      
      // Set up response listener
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 60000);

      meshClient.once(`response:${messageId}`, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIpcHandlers();
  initializeMeshClient();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  meshClient?.disconnect();
});

// Handle second instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
