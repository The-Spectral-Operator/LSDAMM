/**
 * LSDAMM Desktop - Mesh Client Service
 * WebSocket client for mesh coordination
 */

import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';

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

export class MeshClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private clientId: string;
  private authToken: string;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private pendingResponses: Map<string, (response: unknown) => void> = new Map();

  constructor(serverUrl: string, clientId: string, authToken: string) {
    super();
    this.serverUrl = serverUrl;
    this.clientId = clientId;
    this.authToken = authToken;
  }

  /**
   * Connect to mesh server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.register();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.cleanup();
        this.emit('disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      this.emit('error', error);
      this.attemptReconnect();
    }
  }

  /**
   * Disconnect from mesh server
   */
  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionId !== null;
  }

  /**
   * Send a raw message
   */
  send(message: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send a message and get response
   */
  sendMessage(
    content: string,
    options?: {
      provider?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): string {
    const messageId = uuidv4();

    const message: MessageEnvelope = {
      messageId,
      version: '1.0',
      type: 'MESSAGE',
      source: {
        clientId: this.clientId,
        sessionId: this.sessionId || '',
      },
      timestamp: Date.now(),
      priority: 5,
      payload: {
        content,
        provider: options?.provider,
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        stream: options?.stream ?? false,
      },
    };

    this.send(message);
    return messageId;
  }

  /**
   * Register with server
   */
  private register(): void {
    const message: MessageEnvelope = {
      messageId: uuidv4(),
      version: '1.0',
      type: 'REGISTER',
      source: {
        clientId: this.clientId,
        sessionId: 'pending',
      },
      timestamp: Date.now(),
      priority: 10,
      payload: {
        clientId: this.clientId,
        authToken: this.authToken,
        clientType: 'desktop',
        capabilities: {
          supportsStreaming: true,
        },
      },
    };

    this.send(message);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as MessageEnvelope;

      switch (message.type) {
        case 'WELCOME':
          console.log('Received welcome from server');
          break;

        case 'REGISTER_ACK':
          if ((message.payload as { success?: boolean }).success) {
            this.sessionId = (message.payload as { sessionId: string }).sessionId;
            console.log('Registered with session:', this.sessionId);
            this.startHeartbeat();
            this.emit('connected');
          } else {
            console.error('Registration failed');
            this.disconnect();
          }
          break;

        case 'HEARTBEAT_ACK':
          // Server acknowledged heartbeat
          break;

        case 'RESPONSE':
          this.emit('message', message.payload);
          
          // Handle pending response
          if (message.inReplyTo) {
            const callback = this.pendingResponses.get(message.inReplyTo);
            if (callback) {
              callback(message.payload);
              this.pendingResponses.delete(message.inReplyTo);
            }
            this.emit(`response:${message.inReplyTo}`, message.payload);
          }
          break;

        case 'STREAM_CHUNK':
          this.emit('stream:chunk', message.payload);
          if (message.correlationId) {
            this.emit(`stream:${message.correlationId}`, message.payload);
          }
          break;

        case 'STREAM_END':
          this.emit('stream:end', message.correlationId);
          if (message.correlationId) {
            this.emit(`stream:end:${message.correlationId}`, message.payload);
          }
          break;

        case 'ERROR':
          console.error('Server error:', message.payload);
          this.emit('error', new Error((message.payload as { errorMessage?: string }).errorMessage ?? 'Unknown error'));
          break;

        case 'BROADCAST':
          this.emit('broadcast', message.payload);
          break;

        case 'EVENT':
          this.emit('event', message.payload);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const message: MessageEnvelope = {
          messageId: uuidv4(),
          version: '1.0',
          type: 'HEARTBEAT',
          source: {
            clientId: this.clientId,
            sessionId: this.sessionId || '',
          },
          timestamp: Date.now(),
          priority: 10,
          payload: {},
        };

        this.send(message);
      }
    }, 30000);
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
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
}
