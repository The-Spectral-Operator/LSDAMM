/**
 * LSDAMM - WebSocket Server
 * Real-time WebSocket communication for mesh coordination
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'node:http';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../util/config_parser.js';
import { logger, createCorrelatedLogger } from '../util/logging.js';
import { WebSocketRateLimiter } from '../util/rate_limit.js';
import { MessageEnvelope, validateMessage } from './message_router.js';
import { SessionManager } from './session_manager.js';

export interface WebSocketClient {
  sessionId: string;
  clientId?: string;
  ws: WebSocket;
  isAuthenticated: boolean;
  lastActivity: number;
  subscriptions: Set<string>;
}

export class CoordinationWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private rateLimiter: WebSocketRateLimiter;
  private sessionManager: SessionManager;

  constructor() {
    this.rateLimiter = new WebSocketRateLimiter(100, 60000);
    this.sessionManager = new SessionManager();
  }

  /**
   * Start the WebSocket server
   */
  start(httpServer: import('http').Server): void {
    const config = getConfig();

    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3,
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024,
        },
        serverNoContextTakeover: true,
        clientNoContextTakeover: true,
      },
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error });
    });

    // Start heartbeat monitoring
    this.startHeartbeatMonitor(config.websocket.heartbeat_interval_ms);

    logger.info('WebSocket server started', { path: '/ws' });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const sessionId = uuidv4();
    const correlatedLogger = createCorrelatedLogger(sessionId);
    
    const clientIp = req.socket.remoteAddress || 'unknown';
    correlatedLogger.info('New WebSocket connection', { ip: clientIp });

    const client: WebSocketClient = {
      sessionId,
      ws,
      isAuthenticated: false,
      lastActivity: Date.now(),
      subscriptions: new Set(),
    };

    this.clients.set(sessionId, client);

    // Set up event handlers
    ws.on('message', (data) => this.handleMessage(sessionId, data));
    ws.on('close', (code, reason) => this.handleClose(sessionId, code, reason));
    ws.on('error', (error) => this.handleError(sessionId, error));
    ws.on('pong', () => this.handlePong(sessionId));

    // Send welcome message
    this.sendToClient(sessionId, {
      messageId: uuidv4(),
      version: '1.0',
      type: 'WELCOME',
      source: { clientId: 'server', sessionId: 'server' },
      timestamp: Date.now(),
      priority: 10,
      payload: {
        sessionId,
        serverVersion: '1.0.0',
        capabilities: ['streaming', 'binary', 'groups', 'memory'],
      },
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(sessionId: string, data: RawData): Promise<void> {
    const client = this.clients.get(sessionId);
    if (!client) return;

    const correlatedLogger = createCorrelatedLogger(sessionId);

    // Rate limiting
    const { allowed } = await this.rateLimiter.consume(sessionId);
    if (!allowed) {
      this.sendError(sessionId, 'RATE_LIMIT_EXCEEDED', 'Too many messages');
      return;
    }

    client.lastActivity = Date.now();

    try {
      const messageStr = data.toString();
      const message = JSON.parse(messageStr);

      // Validate message structure
      if (!validateMessage(message)) {
        this.sendError(sessionId, 'INVALID_MESSAGE', 'Message validation failed');
        return;
      }

      correlatedLogger.debug('Received message', { type: message.type });

      // Handle different message types
      await this.processMessage(sessionId, message as MessageEnvelope);
    } catch (error) {
      correlatedLogger.error('Failed to process message', { error });
      this.sendError(sessionId, 'INTERNAL_ERROR', 'Failed to process message');
    }
  }

  /**
   * Process validated message
   */
  private async processMessage(sessionId: string, message: MessageEnvelope): Promise<void> {
    const client = this.clients.get(sessionId);
    if (!client) return;

    switch (message.type) {
      case 'REGISTER':
        await this.handleRegister(sessionId, message);
        break;

      case 'HEARTBEAT':
        this.handleHeartbeat(sessionId, message);
        break;

      case 'MESSAGE':
        if (!client.isAuthenticated) {
          this.sendError(sessionId, 'AUTHENTICATION_REQUIRED', 'Must register first');
          return;
        }
        await this.handleUserMessage(sessionId, message);
        break;

      case 'QUERY':
        if (!client.isAuthenticated) {
          this.sendError(sessionId, 'AUTHENTICATION_REQUIRED', 'Must register first');
          return;
        }
        await this.handleQuery(sessionId, message);
        break;

      case 'SUBSCRIBE':
        if (!client.isAuthenticated) {
          this.sendError(sessionId, 'AUTHENTICATION_REQUIRED', 'Must register first');
          return;
        }
        this.handleSubscribe(sessionId, message);
        break;

      case 'UNSUBSCRIBE':
        this.handleUnsubscribe(sessionId, message);
        break;

      default:
        this.sendError(sessionId, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle client registration
   */
  private async handleRegister(sessionId: string, message: MessageEnvelope): Promise<void> {
    const client = this.clients.get(sessionId);
    if (!client) return;

    const { clientId, authToken, clientType, capabilities } = message.payload as {
      clientId: string;
      authToken: string;
      clientType: string;
      capabilities?: Record<string, boolean>;
    };

    // Create session
    const session = await this.sessionManager.createSession(
      sessionId,
      clientId,
      authToken,
      { clientType, capabilities }
    );

    if (!session) {
      this.sendError(sessionId, 'AUTHENTICATION_FAILED', 'Invalid credentials');
      client.ws.close(4001, 'Authentication failed');
      return;
    }

    client.clientId = clientId;
    client.isAuthenticated = true;

    logger.info('Client registered', { sessionId, clientId, clientType });

    // Send registration acknowledgment
    this.sendToClient(sessionId, {
      messageId: uuidv4(),
      version: '1.0',
      type: 'REGISTER_ACK',
      source: { clientId: 'server', sessionId: 'server' },
      timestamp: Date.now(),
      priority: 10,
      payload: {
        success: true,
        sessionId,
        serverInfo: {
          version: '1.0.0',
          capabilities: ['streaming', 'binary', 'groups', 'memory'],
          providers: ['openai', 'anthropic', 'ollama', 'google', 'xai'],
        },
      },
    });
  }

  /**
   * Handle heartbeat
   */
  private handleHeartbeat(sessionId: string, message: MessageEnvelope): void {
    const client = this.clients.get(sessionId);
    if (!client) return;

    client.lastActivity = Date.now();

    this.sendToClient(sessionId, {
      messageId: uuidv4(),
      version: '1.0',
      type: 'HEARTBEAT_ACK',
      source: { clientId: 'server', sessionId: 'server' },
      inReplyTo: message.messageId,
      timestamp: Date.now(),
      priority: 10,
      payload: { serverTime: Date.now() },
    });
  }

  /**
   * Handle user message (route to AI or other clients)
   */
  private async handleUserMessage(sessionId: string, message: MessageEnvelope): Promise<void> {
    const { target } = message;

    if (target?.clientId) {
      // Route to specific client
      const targetSession = this.findSessionByClientId(target.clientId);
      if (targetSession) {
        this.sendToClient(targetSession, message);
      } else {
        // Queue for later delivery
        this.sendError(sessionId, 'TARGET_NOT_FOUND', 'Target client not connected');
      }
    } else if (target?.group) {
      // Broadcast to group
      this.broadcastToGroup(target.group, message, sessionId);
    } else if (target?.all) {
      // Broadcast to all
      this.broadcastToAll(message, sessionId);
    } else {
      // Process as AI request
      await this.handleAIRequest(sessionId, message);
    }
  }

  /**
   * Handle AI request
   */
  private async handleAIRequest(sessionId: string, message: MessageEnvelope): Promise<void> {
    const { route, streamRoute } = await import('../models/router.js');
    const { memoryService } = await import('../services/memory_service.js');
    
    const payload = message.payload as {
      content: string;
      provider?: string;
      model?: string;
      stream?: boolean;
      temperature?: number;
      maxTokens?: number;
      conversationId?: string;
      sessionMemoryId?: string;
      systemPrompt?: string;
    };

    const client = this.clients.get(sessionId);
    const userId = client?.clientId || 'anonymous';

    try {
      // Get or create conversation
      let conversationId = payload.conversationId;
      if (!conversationId && userId !== 'anonymous') {
        try {
          const conversation = await memoryService.createConversation(userId, {
            sessionId: payload.sessionMemoryId,
            provider: payload.provider,
            model: payload.model,
            systemPrompt: payload.systemPrompt
          });
          conversationId = conversation.id;
        } catch (error) {
          logger.debug('Could not create conversation for anonymous user', { error });
        }
      }

      // Load conversation context and relevant memories
      let contextMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      if (payload.systemPrompt) {
        contextMessages.push({ role: 'system', content: payload.systemPrompt });
      }

      // Add recent conversation history
      if (conversationId && userId !== 'anonymous') {
        try {
          const recentMessages = await memoryService.getConversationMessages(conversationId, { limit: 10 });
          contextMessages = contextMessages.concat(
            recentMessages.map(msg => ({
              role: msg.role as 'system' | 'user' | 'assistant',
              content: msg.content
            }))
          );
        } catch (error) {
          logger.debug('Could not load conversation history', { error });
        }
      }

      // Add current user message
      contextMessages.push({ role: 'user', content: payload.content });

      // Save user message to database
      if (conversationId && userId !== 'anonymous') {
        try {
          await memoryService.addMessage(conversationId, {
            sessionId: payload.sessionMemoryId,
            role: 'user',
            content: payload.content,
            provider: payload.provider,
            model: payload.model
          });
        } catch (error) {
          logger.debug('Could not save user message', { error });
        }
      }

      const startTime = Date.now();

      if (payload.stream) {
        // Stream response
        let fullResponse = '';
        let thinkingContent = '';
        let isThinking = false;

        for await (const chunk of streamRoute({
          messages: contextMessages,
          preferredProvider: payload.provider as 'openai' | 'anthropic' | 'ollama' | 'google' | 'xai' | undefined,
          preferredModel: payload.model,
          temperature: payload.temperature,
          maxTokens: payload.maxTokens,
        })) {
          // Detect thinking blocks from Claude
          const chunkContent = (chunk as { delta?: { content?: string } }).delta?.content || '';
          if (chunkContent.includes('<thinking>')) {
            isThinking = true;
          }
          if (isThinking) {
            thinkingContent += chunkContent;
            if (chunkContent.includes('</thinking>')) {
              isThinking = false;
            }
          } else {
            fullResponse += chunkContent;
          }

          this.sendToClient(sessionId, {
            messageId: uuidv4(),
            version: '1.0',
            type: 'STREAM_CHUNK',
            source: { clientId: 'server', sessionId: 'server' },
            correlationId: message.messageId,
            timestamp: Date.now(),
            priority: message.priority,
            payload: chunk as unknown as Record<string, unknown>,
          });
        }

        // Save assistant response to database
        if (conversationId && userId !== 'anonymous' && fullResponse) {
          try {
            const latencyMs = Date.now() - startTime;
            await memoryService.addMessage(conversationId, {
              sessionId: payload.sessionMemoryId,
              role: 'assistant',
              content: fullResponse,
              thinkingContent: thinkingContent || undefined,
              provider: payload.provider,
              model: payload.model,
              latencyMs
            });
          } catch (error) {
            logger.debug('Could not save assistant message', { error });
          }
        }

        // Send stream end
        this.sendToClient(sessionId, {
          messageId: uuidv4(),
          version: '1.0',
          type: 'STREAM_END',
          source: { clientId: 'server', sessionId: 'server' },
          correlationId: message.messageId,
          timestamp: Date.now(),
          priority: message.priority,
          payload: { conversationId },
        });
      } else {
        // Non-streaming response
        const response = await route({
          messages: contextMessages,
          preferredProvider: payload.provider as 'openai' | 'anthropic' | 'ollama' | 'google' | 'xai' | undefined,
          preferredModel: payload.model,
          temperature: payload.temperature,
          maxTokens: payload.maxTokens,
        });

        const latencyMs = Date.now() - startTime;

        // Save assistant response to database
        if (conversationId && userId !== 'anonymous') {
          try {
            await memoryService.addMessage(conversationId, {
              sessionId: payload.sessionMemoryId,
              role: 'assistant',
              content: response.content || '',
              tokensUsed: response.usage?.total_tokens,
              provider: response.provider,
              model: response.model,
              latencyMs
            });
          } catch (error) {
            logger.debug('Could not save assistant message', { error });
          }
        }

        this.sendToClient(sessionId, {
          messageId: uuidv4(),
          version: '1.0',
          type: 'RESPONSE',
          source: { clientId: 'server', sessionId: 'server' },
          inReplyTo: message.messageId,
          timestamp: Date.now(),
          priority: message.priority,
          payload: { ...response, conversationId } as unknown as Record<string, unknown>,
        });
      }
    } catch (error) {
      logger.error('AI request failed', { sessionId, error });
      this.sendError(sessionId, 'PROVIDER_ERROR', (error as Error).message, message.messageId);
    }
  }

  /**
   * Handle query
   */
  private async handleQuery(sessionId: string, message: MessageEnvelope): Promise<void> {
    const { queryType } = message.payload as {
      queryType: string;
      query: unknown;
    };

    try {
      let result: unknown;

      switch (queryType) {
        case 'list_providers': {
          const { getAvailableProviders } = await import('../models/router.js');
          result = { providers: getAvailableProviders() };
          break;
        }

        case 'list_models': {
          const { getAllModels } = await import('../models/router.js');
          result = { models: await getAllModels() };
          break;
        }

        case 'session_info': {
          const client = this.clients.get(sessionId);
          result = {
            sessionId,
            clientId: client?.clientId,
            isAuthenticated: client?.isAuthenticated,
            subscriptions: Array.from(client?.subscriptions || []),
          };
          break;
        }

        default:
          result = { error: 'Unknown query type' };
      }

      this.sendToClient(sessionId, {
        messageId: uuidv4(),
        version: '1.0',
        type: 'RESPONSE',
        source: { clientId: 'server', sessionId: 'server' },
        inReplyTo: message.messageId,
        timestamp: Date.now(),
        priority: message.priority,
        payload: { success: true, data: result },
      });
    } catch (error) {
      this.sendError(sessionId, 'QUERY_ERROR', (error as Error).message, message.messageId);
    }
  }

  /**
   * Handle subscription
   */
  private handleSubscribe(sessionId: string, message: MessageEnvelope): void {
    const client = this.clients.get(sessionId);
    if (!client) return;

    const { channels } = message.payload as { channels: string[] };
    
    for (const channel of channels) {
      client.subscriptions.add(channel);
    }

    this.sendToClient(sessionId, {
      messageId: uuidv4(),
      version: '1.0',
      type: 'SUBSCRIBE_ACK',
      source: { clientId: 'server', sessionId: 'server' },
      inReplyTo: message.messageId,
      timestamp: Date.now(),
      priority: 5,
      payload: { channels, subscribed: true },
    });
  }

  /**
   * Handle unsubscription
   */
  private handleUnsubscribe(sessionId: string, message: MessageEnvelope): void {
    const client = this.clients.get(sessionId);
    if (!client) return;

    const { channels } = message.payload as { channels: string[] };
    
    for (const channel of channels) {
      client.subscriptions.delete(channel);
    }

    this.sendToClient(sessionId, {
      messageId: uuidv4(),
      version: '1.0',
      type: 'UNSUBSCRIBE_ACK',
      source: { clientId: 'server', sessionId: 'server' },
      inReplyTo: message.messageId,
      timestamp: Date.now(),
      priority: 5,
      payload: { channels, unsubscribed: true },
    });
  }

  /**
   * Handle connection close
   */
  private handleClose(sessionId: string, code: number, reason: Buffer): void {
    const client = this.clients.get(sessionId);
    
    logger.info('WebSocket connection closed', {
      sessionId,
      clientId: client?.clientId,
      code,
      reason: reason.toString(),
    });

    if (client?.clientId) {
      this.sessionManager.endSession(sessionId);
    }

    this.clients.delete(sessionId);
  }

  /**
   * Handle connection error
   */
  private handleError(sessionId: string, error: Error): void {
    logger.error('WebSocket connection error', { sessionId, error });
  }

  /**
   * Handle pong (heartbeat response)
   */
  private handlePong(sessionId: string): void {
    const client = this.clients.get(sessionId);
    if (client) {
      client.lastActivity = Date.now();
    }
  }

  /**
   * Send message to specific client
   */
  sendToClient(sessionId: string, message: MessageEnvelope): void {
    const client = this.clients.get(sessionId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send message to client', { sessionId, error });
    }
  }

  /**
   * Send error message
   */
  sendError(
    sessionId: string,
    errorCode: string,
    errorMessage: string,
    inReplyTo?: string
  ): void {
    this.sendToClient(sessionId, {
      messageId: uuidv4(),
      version: '1.0',
      type: 'ERROR',
      source: { clientId: 'server', sessionId: 'server' },
      inReplyTo,
      timestamp: Date.now(),
      priority: 10,
      payload: {
        errorCode,
        errorMessage,
        retryable: ['RATE_LIMIT_EXCEEDED', 'PROVIDER_ERROR'].includes(errorCode),
      },
    });
  }

  /**
   * Find session by client ID
   */
  private findSessionByClientId(clientId: string): string | null {
    for (const [sessionId, client] of this.clients) {
      if (client.clientId === clientId && client.ws.readyState === WebSocket.OPEN) {
        return sessionId;
      }
    }
    return null;
  }

  /**
   * Broadcast to group
   */
  broadcastToGroup(group: string, message: MessageEnvelope, excludeSession?: string): void {
    for (const [sessionId, client] of this.clients) {
      if (
        sessionId !== excludeSession &&
        client.isAuthenticated &&
        client.subscriptions.has(group) &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        this.sendToClient(sessionId, message);
      }
    }
  }

  /**
   * Broadcast to all authenticated clients
   */
  broadcastToAll(message: MessageEnvelope, excludeSession?: string): void {
    for (const [sessionId, client] of this.clients) {
      if (
        sessionId !== excludeSession &&
        client.isAuthenticated &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        this.sendToClient(sessionId, message);
      }
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitor(intervalMs: number): void {
    const config = getConfig();
    const timeout = config.websocket.heartbeat_timeout_ms;

    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [sessionId, client] of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          // Check if client has timed out
          if (now - client.lastActivity > timeout) {
            logger.warn('Client heartbeat timeout', { sessionId, clientId: client.clientId });
            client.ws.terminate();
            continue;
          }

          // Send ping
          client.ws.ping();
        }
      }
    }, intervalMs);
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get authenticated client count
   */
  getAuthenticatedClientCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.isAuthenticated) {
        count++;
      }
    }
    return count;
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all connections
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info('WebSocket server stopped');
  }
}
