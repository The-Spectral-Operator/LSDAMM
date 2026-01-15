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

interface MeshStatistics {
  connected: boolean;
  activeNodes: number;
  messagesSent: number;
  messagesReceived: number;
  avgLatencyMs: number;
  tokensUsed: number;
  costUsd: number;
  uptimeSeconds: number;
}

interface MeshNode {
  id: string;
  address: string;
  port: number;
  state: string;
  isMainNode: boolean;
  lastSeen: number;
}

export class MeshService extends EventEmitter implements vscode.Disposable {
  private ws: WebSocket | null = null;
  private context: vscode.ExtensionContext;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private statusChangeEmitter = new vscode.EventEmitter<boolean>();
  
  // Statistics tracking
  private stats: MeshStatistics = {
    connected: false,
    activeNodes: 0,
    messagesSent: 0,
    messagesReceived: 0,
    avgLatencyMs: 0,
    tokensUsed: 0,
    costUsd: 0,
    uptimeSeconds: 0,
  };
  private connectionStartTime: number = 0;

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
        this.connectionStartTime = Date.now();
        this.register(clientId, authToken);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.cleanup();
        this.stats.connected = false;
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
    this.stats.connected = false;
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
      extendedThinking?: boolean;
      maxTokens?: number;
      imageUri?: string;
      vision?: boolean;
    }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('Not connected to mesh server'));
        return;
      }

      const messageId = uuidv4();
      const config = vscode.workspace.getConfiguration('lsdamm');
      const startTime = Date.now();

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
          systemPrompt: options?.systemPrompt,
          extendedThinking: options?.extendedThinking,
          maxTokens: options?.maxTokens,
          vision: options?.vision,
          imageUri: options?.imageUri,
        },
      };

      // Set up response listener
      const timeout = setTimeout(() => {
        this.removeAllListeners(`response:${messageId}`);
        reject(new Error('Request timeout'));
      }, 120000); // 2 minute timeout for extended thinking

      this.once(`response:${messageId}`, (response: { content?: string; usage?: { totalTokens?: number } }) => {
        clearTimeout(timeout);
        
        // Update statistics
        const latency = Date.now() - startTime;
        this.stats.avgLatencyMs = (this.stats.avgLatencyMs + latency) / 2;
        this.stats.messagesReceived++;
        if (response.usage?.totalTokens) {
          this.stats.tokensUsed += response.usage.totalTokens;
        }
        
        resolve(response.content || '');
      });

      this.stats.messagesSent++;
      this.ws?.send(JSON.stringify(message));
    });
  }

  /**
   * Text-to-speech conversion
   */
  async textToSpeech(text: string, options?: { voice?: string }): Promise<void> {
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
        type: 'COMMAND',
        source: {
          clientId: config.get<string>('clientId') || '',
          sessionId: this.sessionId || '',
        },
        timestamp: Date.now(),
        priority: 5,
        payload: {
          command: 'text_to_speech',
          text,
          voice: options?.voice || config.get<string>('ttsVoice') || 'alloy',
        },
      };

      const timeout = setTimeout(() => {
        this.removeAllListeners(`response:${messageId}`);
        reject(new Error('TTS request timeout'));
      }, 30000);

      this.once(`response:${messageId}`, () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws?.send(JSON.stringify(message));
    });
  }

  /**
   * Upload an attachment
   */
  async uploadAttachment(filePath: string): Promise<string> {
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
        type: 'COMMAND',
        source: {
          clientId: config.get<string>('clientId') || '',
          sessionId: this.sessionId || '',
        },
        timestamp: Date.now(),
        priority: 5,
        payload: {
          command: 'upload_attachment',
          filePath,
        },
      };

      const timeout = setTimeout(() => {
        this.removeAllListeners(`response:${messageId}`);
        reject(new Error('Upload timeout'));
      }, 60000);

      this.once(`response:${messageId}`, (response: { attachmentId?: string }) => {
        clearTimeout(timeout);
        resolve(response.attachmentId || '');
      });

      this.ws?.send(JSON.stringify(message));
    });
  }

  /**
   * Get real-time statistics
   */
  async getStatistics(): Promise<MeshStatistics> {
    // Update uptime
    if (this.connectionStartTime > 0) {
      this.stats.uptimeSeconds = Math.floor((Date.now() - this.connectionStartTime) / 1000);
    }
    this.stats.connected = this.isConnected();
    
    return { ...this.stats };
  }

  /**
   * Get mesh nodes
   */
  async getNodes(): Promise<MeshNode[]> {
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
        type: 'QUERY',
        source: {
          clientId: config.get<string>('clientId') || '',
          sessionId: this.sessionId || '',
        },
        timestamp: Date.now(),
        priority: 5,
        payload: {
          queryType: 'get_nodes',
        },
      };

      const timeout = setTimeout(() => {
        this.removeAllListeners(`response:${messageId}`);
        // Return empty array on timeout instead of error
        resolve([]);
      }, 10000);

      this.once(`response:${messageId}`, (response: { nodes?: MeshNode[] }) => {
        clearTimeout(timeout);
        this.stats.activeNodes = response.nodes?.length || 0;
        resolve(response.nodes || []);
      });

      this.ws?.send(JSON.stringify(message));
    });
  }

  /**
   * Register with server
   */
  private register(clientId: string, authToken: string): void {
    const config = vscode.workspace.getConfiguration('lsdamm');
    
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
          supportsExtendedThinking: config.get<boolean>('enableExtendedThinking'),
          supportsVision: config.get<boolean>('enableVision'),
          supportsTTS: config.get<boolean>('enableTTS'),
          supportsAttachments: config.get<boolean>('enableAttachments'),
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
            this.stats.connected = true;
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

        case 'ERROR': {
          const errorPayload = message.payload as { errorMessage?: string };
          vscode.window.showErrorMessage(`LSDAMM: ${errorPayload.errorMessage || 'Unknown error'}`);
          break;
        }
          
        case 'EVENT': {
          // Handle events like node updates
          const eventPayload = message.payload as { eventType?: string; nodeCount?: number };
          if (eventPayload.eventType === 'node_update' && eventPayload.nodeCount !== undefined) {
            this.stats.activeNodes = eventPayload.nodeCount;
          }
          break;
        }
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
