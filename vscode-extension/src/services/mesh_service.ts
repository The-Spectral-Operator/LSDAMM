/**
 * LSDAMM VS Code Extension - Mesh Service
 * WebSocket client for mesh coordination
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

interface MessageEnvelope {
  messageId: string;
  version: string;
  type: string;
  source: { clientId: string; sessionId: string };
  target?: { clientId?: string; group?: string; all?: boolean };
  correlationId?: string;
  inReplyTo?: string;
  timestamp: number;
  priority: number;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export class MeshService extends EventEmitter implements vscode.Disposable {
  private ws: WebSocket | null = null;
  private context: vscode.ExtensionContext;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private statusChangeEmitter = new vscode.EventEmitter<boolean>();

  readonly onStatusChange = this.statusChangeEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    super();
    this.context = context;
  }

  /**
   * Connect to mesh server
   */
  async connect(): Promise<void> {
    const config = vscode.workspace.getConfiguration('lsdamm');
    const serverUrl = config.get<string>('serverUrl');
    const authToken = config.get<string>('authToken');
    const clientId = config.get<string>('clientId');

    if (!serverUrl || !authToken || !clientId) {
      vscode.window.showErrorMessage('LSDAMM: Missing configuration. Please configure server URL, auth token, and client ID.');
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Note: In a real VS Code extension, you'd use a proper WebSocket implementation
      // For now, this is a placeholder
      this.ws = new WebSocket(serverUrl);

      this.ws.onopen = () => {
        console.log('Connected to mesh server');
        this.reconnectAttempts = 0;
        this.register(clientId, authToken);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.cleanup();
        this.statusChangeEmitter.fire(false);
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        vscode.window.showErrorMessage(`LSDAMM: Connection error`);
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      vscode.window.showErrorMessage(`LSDAMM: Failed to connect - ${(error as Error).message}`);
    }
  }

  /**
   * Disconnect from mesh server
   */
  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
    this.statusChangeEmitter.fire(false);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionId !== null;
  }

  /**
   * Send a message to AI
   */
  async sendToAI(
    content: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
    }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('Not connected to mesh server'));
        return;
      }

      const messageId = uuidv4();
      const config = vscode.workspace.getConfiguration('lsdamm');

      const message: MessageEnvelope = {
        messageId,
        version: '1.0',
        type: 'MESSAGE',
        source: {
          clientId: config.get<string>('clientId') || '',
          sessionId: this.sessionId || '',
        },
        timestamp: Date.now(),
        priority: 5,
        payload: {
          content,
          provider: options?.provider || config.get<string>('defaultProvider'),
          model: options?.model || config.get<string>('defaultModel'),
          stream: false,
        },
      };

      // Set up response listener
      const timeout = setTimeout(() => {
        this.removeAllListeners(`response:${messageId}`);
        reject(new Error('Request timeout'));
      }, 60000);

      this.once(`response:${messageId}`, (response: { content?: string }) => {
        clearTimeout(timeout);
        resolve(response.content || '');
      });

      this.ws?.send(JSON.stringify(message));
    });
  }

  /**
   * Register with server
   */
  private register(clientId: string, authToken: string): void {
    const message: MessageEnvelope = {
      messageId: uuidv4(),
      version: '1.0',
      type: 'REGISTER',
      source: {
        clientId,
        sessionId: 'pending',
      },
      timestamp: Date.now(),
      priority: 10,
      payload: {
        clientId,
        authToken,
        clientType: 'vscode',
        capabilities: {
          supportsStreaming: true,
        },
      },
    };

    this.ws?.send(JSON.stringify(message));
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as MessageEnvelope;

      switch (message.type) {
        case 'REGISTER_ACK':
          if ((message.payload as { success?: boolean }).success) {
            this.sessionId = (message.payload as { sessionId: string }).sessionId;
            this.startHeartbeat();
            this.statusChangeEmitter.fire(true);
            vscode.window.showInformationMessage('LSDAMM: Connected to mesh server');
          } else {
            vscode.window.showErrorMessage('LSDAMM: Registration failed');
            this.disconnect();
          }
          break;

        case 'RESPONSE':
          if (message.inReplyTo) {
            this.emit(`response:${message.inReplyTo}`, message.payload);
          }
          break;

        case 'ERROR':
          const errorPayload = message.payload as { errorMessage?: string };
          vscode.window.showErrorMessage(`LSDAMM: ${errorPayload.errorMessage || 'Unknown error'}`);
          break;
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    const config = vscode.workspace.getConfiguration('lsdamm');
    const clientId = config.get<string>('clientId') || '';

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const message: MessageEnvelope = {
          messageId: uuidv4(),
          version: '1.0',
          type: 'HEARTBEAT',
          source: {
            clientId,
            sessionId: this.sessionId || '',
          },
          timestamp: Date.now(),
          priority: 10,
          payload: {},
        };

        this.ws.send(JSON.stringify(message));
      }
    }, 30000);
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= 5) {
      return;
    }

    this.reconnectAttempts++;
    const delay = 1000 * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.sessionId = null;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.disconnect();
    this.statusChangeEmitter.dispose();
  }
}
