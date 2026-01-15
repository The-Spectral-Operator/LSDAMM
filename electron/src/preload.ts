/**
 * LSDAMM Desktop - Preload Script
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose mesh API to renderer
contextBridge.exposeInMainWorld('mesh', {
  // Connection
  connect: () => ipcRenderer.invoke('mesh:connect'),
  disconnect: () => ipcRenderer.invoke('mesh:disconnect'),
  getStatus: () => ipcRenderer.invoke('mesh:status'),
  
  // Messages
  send: (message: unknown) => ipcRenderer.invoke('mesh:send', message),
  
  // Events
  onConnected: (callback: () => void) => {
    ipcRenderer.on('mesh:connected', callback);
    return () => ipcRenderer.removeListener('mesh:connected', callback);
  },
  onDisconnected: (callback: () => void) => {
    ipcRenderer.on('mesh:disconnected', callback);
    return () => ipcRenderer.removeListener('mesh:disconnected', callback);
  },
  onMessage: (callback: (message: unknown) => void) => {
    ipcRenderer.on('mesh:message', (_event, message) => callback(message));
    return () => ipcRenderer.removeListener('mesh:message', callback);
  },
  onError: (callback: (error: string) => void) => {
    ipcRenderer.on('mesh:error', (_event, error) => callback(error));
    return () => ipcRenderer.removeListener('mesh:error', callback);
  },
});

// Expose AI API to renderer
contextBridge.exposeInMainWorld('ai', {
  complete: (prompt: string, options?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) => ipcRenderer.invoke('ai:complete', prompt, options),
});

// Expose settings API to renderer
contextBridge.exposeInMainWorld('settings', {
  get: (key: string) => ipcRenderer.invoke('settings:get', key),
  set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
});

// Expose platform info
contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
});

// Type declarations for window object
declare global {
  interface Window {
    mesh: {
      connect: () => Promise<void>;
      disconnect: () => Promise<void>;
      getStatus: () => Promise<{ connected: boolean; serverUrl: string }>;
      send: (message: unknown) => Promise<void>;
      onConnected: (callback: () => void) => () => void;
      onDisconnected: (callback: () => void) => () => void;
      onMessage: (callback: (message: unknown) => void) => () => void;
      onError: (callback: (error: string) => void) => () => void;
    };
    ai: {
      complete: (prompt: string, options?: {
        provider?: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
      }) => Promise<unknown>;
    };
    settings: {
      get: (key: string) => Promise<unknown>;
      set: (key: string, value: unknown) => Promise<void>;
    };
    platform: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
    };
  }
}
