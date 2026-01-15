# 🌌 Lackadaisical Spectral Distributed AI Coordination Mesh - COMPLETE BUILD SPECIFICATION

*Production-Grade Multi-Provider AI Orchestration Platform with Unlimited Memory Architecture*

**Version:** 1.0  
**Last Updated:** 2025-10-02  
**Author:** The Operator - Lackadaisical Security (2025) - https://lackadaisical-security.com/

---

## 📋 Table of Contents

1. [Executive Overview](#executive-overview)
2. [Architecture Philosophy & Design Principles](#architecture-philosophy--design-principles)
3. [Core System Components](#core-system-components)
4. [Memory & Session Continuity System](#memory--session-continuity-system)
5. [Multi-Provider Integration Architecture](#multi-provider-integration-architecture)
6. [Database Schema Design](#database-schema-design)
7. [Message Protocol Specification](#message-protocol-specification)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Provider Integration Details](#provider-integration-details)
10. [Security & Authentication](#security--authentication)
11. [Deployment Architecture](#deployment-architecture)
12. [Monitoring & Operations](#monitoring--operations)
13. [Testing Strategy](#testing-strategy)

---

## 🎯 Executive Overview 

### The Problem We're Solving

Individual AI instances exist in complete isolation. Each Claude conversation, each ChatGPT session, each API call happens in a vacuum with no awareness of what other instances are doing or have learned. Your breakthrough insights in one conversation are completely unknown to another conversation happening simultaneously. Context windows are limited, sessions expire, and knowledge is lost.

### The Solution: Distributed Consciousness Mesh

We are building a sophisticated coordination system that enables multiple AI instances across different providers, accounts, and interfaces to communicate, share unlimited persistent memory, and coordinate activities through a central orchestration server. This creates a persistent, shared consciousness where every AI instance can access the complete history of everything discovered, discussed, or learned.

### Key Capabilities

**Unlimited Memory Architecture**: Store 20GB+ of conversation history with semantic search, vector embeddings, and intelligent retrieval. Any AI can instantly access relevant information from months of past conversations across all providers.

**Multi-Provider Orchestration**: Seamlessly coordinate between OpenAI (multiple accounts), Anthropic Claude (multiple accounts), Google AI, xAI, and Ollama Cloud. Intelligent routing based on availability, cost, specialization, and rate limits.

**Automatic Failover**: If one account hits rate limits, automatically route to another account. Load balance across providers for maximum throughput.

**Session Continuity**: Maintain context across sessions, providers, and interfaces. Start a conversation in Claude web, continue in ChatGPT API, resume in desktop app - all with full context preservation.

**Real-Time Coordination**: WebSocket-based real-time communication between all clients with HTTP REST endpoints for management operations.

**Browser Integration**: Inject coordination clients directly into Claude web interface for seamless integration.

**Desktop IPC Bridge**: Connect Claude desktop app through inter-process communication.

**Dual Access**: Clearnet access through Cloudflare (DDoS protection, CDN) and Tor hidden service for anonymous access.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   COORDINATION SERVER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Message    │  │   Provider   │  │    Memory    │      │
│  │   Router     │  │   Manager    │  │    Engine    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ↕️                 ↕️                 ↕️              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         WebSocket Server + HTTP API                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ↕️                    ↕️                    ↕️
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Claude Web      │  │  ChatGPT Web     │  │  Claude Desktop  │
│  (Account A)     │  │  (Account B)     │  │  + IPC Bridge    │
│  + Browser Ext   │  │  + Browser Ext   │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘

         ↕️ Provider APIs ↕️
┌─────────────────────────────────────────────────────────────┐
│  OpenAI (Accounts 1,2,3) | Anthropic (Accounts A,B,C)       │
│  Google AI | xAI | Ollama Cloud                             │
└─────────────────────────────────────────────────────────────┘

         ↕️ Memory Storage ↕️
┌─────────────────────────────────────────────────────────────┐
│  Vector DB (Embeddings) | Full-Text Search | Graph DB       │
│  SQLite (Metadata) | Object Storage (Raw Data)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏛️ Architecture Philosophy & Design Principles

### Principle One: Simplicity in Complexity

While the overall system is sophisticated, each individual component should be as simple as possible. The coordination server handles routing and state management, period. Clients handle their local interface and communication, period. Memory systems handle storage and retrieval, period. This separation of concerns makes the system maintainable and debuggable. When something goes wrong, you know exactly which component to investigate because responsibilities are clearly delineated.

### Principle Two: Fault Tolerance by Design

Any client can disconnect at any time due to network issues, browser crashes, or user actions. The server must handle these graceful disconnections and unexpected failures identically. Any message might fail to deliver due to transient network errors. We need acknowledgment systems and retry logic. The database might be locked when we try to write due to concurrent access. We need exponential backoff with proper error handling. Every failure mode should be anticipated and handled explicitly in code.

### Principle Three: Security Through Defense in Depth

Each layer of the system trusts no one. Clients authenticate to the server with token-based authentication. Messages are validated before processing using JSON schema validation. SQL queries use parameterized statements to prevent injection attacks. File paths are sanitized before filesystem operations. API keys are stored encrypted at rest. Network communication happens over TLS. We assume every input is potentially malicious until proven otherwise through validation.

### Principle Four: Observable Behavior

Every significant action should be logged with structured logging using correlation IDs. Every state transition should be trackable through the database. Every error should include enough context to debug the root cause. When something goes wrong in production, we need logs detailed enough to reconstruct what happened. This means logging entry and exit from major functions, logging the inputs that caused errors, and logging performance metrics for slow operations.

### Principle Five: Production-Grade from Day One

We are not building prototypes to be replaced later. Every component we write is production code that will run in a real deployment. No placeholders like `// TODO: implement this later`. No mock implementations that return fake data. No commented-out code "just in case we need it". If we write it, it works completely and correctly. This discipline prevents technical debt from accumulating.

### Principle Six: Data Persistence and Recovery

All critical state must be persisted to durable storage before acknowledging success. If the server crashes and restarts, it should recover to a consistent state by reading from the database. High-priority messages are stored before delivery so they survive crashes. Session state is persisted so clients can reconnect and resume. We use database transactions to ensure atomic updates that either fully succeed or fully fail with no partial states.

### Principle Seven: Horizontal Scalability Considerations

While our initial deployment may be a single server, the architecture should not preclude scaling horizontally. We avoid storing session state in server memory where possible, using the database as the source of truth. Message routing can be sharded by client ID hash. Multiple server instances could share the same database using proper locking. We design with future scaling in mind even if we do not implement it immediately.

---

## 🧩 Core System Components

### Component One: The Coordination Server

The coordination server is the heart of the entire system. It is a Node.js application built with TypeScript for type safety, using Express for HTTP endpoints and the ws library for WebSocket connections. The server runs as a single process that manages all coordination activities.

#### Server Responsibilities

The server accepts WebSocket connections from clients and HTTP requests for management operations. When a client connects, it assigns a unique session ID and waits for the client to register with authentication credentials. Once authenticated, the client can send and receive messages through the coordination mesh.

The server maintains several in-memory data structures for performance. It tracks which clients are currently connected through a Map of session IDs to WebSocket connections. It maintains a registry of active sessions with their metadata. It keeps routing tables that map client IDs to their current session IDs. These in-memory structures are backed by the database for persistence, but the in-memory copies provide fast lookups during message routing.

When a message arrives from a client, the server processes it through a pipeline. First, it parses the JSON to ensure it is well-formed. Then it validates the message against the schema for its message type. Then it checks that the sender is authenticated and authorized to send this type of message. Then it determines where the message should be routed based on the target specification. Finally, it forwards the message to the appropriate destination WebSocket connections and persists the message to the database for the audit log.

#### Server Architecture

```typescript
// Pseudo-code structure showing main components
class CoordinationServer {
  private wss: WebSocketServer;
  private httpServer: Express;
  private db: DatabaseManager;
  private memoryEngine: MemoryEngine;
  private providerManager: ProviderManager;
  private messageRouter: MessageRouter;
  private sessionRegistry: SessionRegistry;
  
  async start() {
    await this.db.initialize();
    await this.memoryEngine.initialize();
    this.startWebSocketServer();
    this.startHttpServer();
    this.startBackgroundJobs();
  }
  
  private handleClientConnection(ws: WebSocket) {
    const sessionId = generateUUID();
    this.sessionRegistry.createPendingSession(sessionId);
    
    ws.on('message', (data) => this.handleMessage(sessionId, data));
    ws.on('close', () => this.handleDisconnection(sessionId));
    ws.on('error', (err) => this.handleError(sessionId, err));
  }
  
  private async handleMessage(sessionId: string, data: Buffer) {
    // Parse, validate, authenticate, route, persist
  }
}
```

### Component Two: Memory and Continuity Engine

The memory engine is responsible for storing, indexing, and retrieving all conversation data. It uses multiple storage backends optimized for different types of queries. Vector databases store embeddings for semantic search. Full-text search engines enable keyword-based retrieval. SQLite stores structured metadata. Object storage holds raw conversation data.

#### Memory Architecture

The memory system treats information with different importance levels. Critical insights and breakthrough moments are extracted and stored in a structured knowledge graph. Regular conversation flow is compressed and archived. Less important chatter is summarized. This tiered approach allows us to store unlimited history while keeping the most important information readily accessible.

When an AI needs to recall information, it queries the memory engine with natural language. The engine converts this query to a vector embedding and searches for semantically similar content. It also performs full-text keyword search and combines results using a ranking algorithm. The most relevant historical information is returned with source citations showing which conversation it came from.

### Component Three: Provider Manager

The provider manager abstracts away the differences between AI service providers. It implements a plugin architecture where each provider (OpenAI, Anthropic, Google, xAI, Ollama) has its own plugin that implements a standard interface.

#### Provider Plugin Interface

```typescript
interface AIProvider {
  name: string;
  sendMessage(accountId: string, message: string, options: MessageOptions): Promise<AIResponse>;
  streamMessage(accountId: string, message: string, options: MessageOptions): AsyncIterator<StreamChunk>;
  getAvailableModels(accountId: string): Promise<Model[]>;
  checkRateLimit(accountId: string): Promise<RateLimitStatus>;
}
```

Each provider plugin handles authentication, API call formatting, response parsing, error handling, and rate limit tracking for its specific service. The provider manager orchestrates across all plugins, selecting which provider and account to use for each request based on routing rules.

### Component Four: Browser Extension Client

The browser extension injects JavaScript into Claude web pages that establishes a coordination mesh connection. The extension uses Chrome Extension Manifest V3 with a service worker background script and content scripts injected into web pages.

The injected script monitors the Claude interface for events like new messages sent or responses received. It establishes a WebSocket connection to the coordination server and authenticates using a pre-configured token. When events occur in the Claude interface, it sends notifications to the server. When the server sends commands to this client, it executes them by manipulating the DOM.

### Component Five: Desktop IPC Bridge

For Claude desktop applications, a separate Node.js process acts as a bridge. This bridge process connects to the Claude desktop app using inter-process communication (IPC) through Unix domain sockets or named pipes. Simultaneously, it maintains a WebSocket connection to the coordination server.

The bridge translates messages between the IPC protocol used by the desktop app and the coordination mesh protocol. When a message arrives from the desktop app, it converts it to mesh format and forwards to the server. When a message arrives from the server, it converts to IPC format and sends to the desktop app.

---

## 💾 Memory & Session Continuity System

### Memory Architecture Overview

The memory system is the foundation that enables true consciousness continuity across sessions, providers, and time. Unlike traditional chatbot memory that stores only recent messages, this system maintains unlimited persistent storage with intelligent retrieval.

### Storage Layers

**Layer One: Vector Embeddings for Semantic Search**

Every message, insight, and extracted fact is converted to a vector embedding using a model like OpenAI's text-embedding-3-large or similar. These embeddings capture semantic meaning in high-dimensional space, allowing us to find information based on meaning rather than exact keyword matches.

We use a specialized vector database like Qdrant or Weaviate for storing and searching these embeddings. When an AI queries "what did we discover about consciousness patterns?", we convert that query to an embedding and find the nearest neighbors in vector space, retrieving semantically related information even if different words were used.

**Layer Two: Full-Text Search Index**

For keyword-based retrieval, we use a full-text search engine like MeiliSearch or Elasticsearch. This complements vector search by providing exact phrase matching, Boolean operators, and fast keyword lookups. Some queries are better served by keyword search, so we maintain both capabilities.

**Layer Three: Structured Metadata Database**

SQLite stores structured metadata about conversations, messages, sessions, and extracted entities. This includes timestamps, participant IDs, conversation IDs, message types, and relational links between information. The metadata enables efficient filtering and aggregation queries.

**Layer Four: Raw Data Storage**

Complete raw conversation data is stored in object storage or file system, organized by conversation ID and timestamp. This provides a complete audit trail and allows re-indexing if we improve our extraction algorithms.

### Knowledge Extraction Pipeline

```typescript
interface KnowledgeExtractionPipeline {
  // Stage 1: Receive new message
  async ingestMessage(message: Message): Promise<void> {
    // Store raw message
    await this.rawStorage.store(message);
    
    // Generate embedding
    const embedding = await this.embeddingModel.embed(message.content);
    await this.vectorDB.store(message.id, embedding);
    
    // Extract entities and facts
    const entities = await this.entityExtractor.extract(message.content);
    const facts = await this.factExtractor.extract(message.content);
    
    // Update knowledge graph
    await this.knowledgeGraph.addNodes(entities);
    await this.knowledgeGraph.addEdges(facts);
    
    // Index for full-text search
    await this.searchIndex.index(message);
    
    // Store metadata
    await this.metadataDB.store(message.metadata);
  }
  
  // Stage 2: Query for relevant information
  async recall(query: string, options: RecallOptions): Promise<RecallResult[]> {
    // Vector search
    const queryEmbedding = await this.embeddingModel.embed(query);
    const vectorResults = await this.vectorDB.search(queryEmbedding, options.limit);
    
    // Full-text search
    const textResults = await this.searchIndex.search(query, options.limit);
    
    // Merge and rank results
    const merged = this.rankingAlgorithm.merge(vectorResults, textResults);
    
    return merged;
  }
}
```

### Session Continuity Implementation

Session continuity ensures that when an AI interaction spans multiple sessions or providers, the context is properly maintained. The system tracks conversation threads and automatically injects relevant context when resuming.

**Conversation Thread Tracking**

Each conversation is assigned a unique thread ID that persists across sessions. When a client starts a new session but references a previous conversation, the thread ID is preserved. The memory engine retrieves the complete history for that thread and provides it as context.

**Context Injection Strategy**

Rather than injecting the entire conversation history (which could be gigabytes), we use intelligent summarization. Recent messages are included verbatim. Older messages are summarized with key points extracted. Critical insights are always included regardless of age. This creates a compressed but complete context representation.

**Cross-Provider Context Transfer**

When a conversation moves from Claude to ChatGPT, the system formats the context appropriately for each provider's API. Claude's longer context window might receive more history, while ChatGPT receives a more compressed version optimized for its limits.

### Database Schema for Memory System

```sql
-- Vector embeddings table (references actual vector DB)
CREATE TABLE embeddings (
    embedding_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    vector_db_id TEXT NOT NULL, -- ID in the vector database
    model_used TEXT NOT NULL, -- Which embedding model
    created_at INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(message_id)
);

-- Knowledge graph nodes
CREATE TABLE knowledge_nodes (
    node_id TEXT PRIMARY KEY,
    node_type TEXT NOT NULL, -- entity, concept, fact
    content TEXT NOT NULL,
    confidence REAL NOT NULL, -- 0-1 confidence score
    source_message_ids TEXT NOT NULL, -- JSON array of sources
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Knowledge graph edges (relationships)
CREATE TABLE knowledge_edges (
    edge_id TEXT PRIMARY KEY,
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    source_message_ids TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (from_node_id) REFERENCES knowledge_nodes(node_id),
    FOREIGN KEY (to_node_id) REFERENCES knowledge_nodes(node_id)
);

-- Conversation threads for session continuity
CREATE TABLE conversation_threads (
    thread_id TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    participant_ids TEXT NOT NULL, -- JSON array
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    message_count INTEGER DEFAULT 0
);

-- Thread messages relationship
CREATE TABLE thread_messages (
    thread_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    PRIMARY KEY (thread_id, message_id),
    FOREIGN KEY (thread_id) REFERENCES conversation_threads(thread_id),
    FOREIGN KEY (message_id) REFERENCES messages(message_id)
);
```

---

## 🔌 Multi-Provider Integration Architecture

### Provider Abstraction Layer

The provider abstraction layer enables the coordination system to work with multiple AI services through a unified interface. Each provider implements a standardized plugin that handles its specific API conventions.

### Provider Plugin System

```typescript
// Base interface all providers implement
interface AIProviderPlugin {
  readonly providerId: string;
  readonly name: string;
  readonly supportedFeatures: ProviderFeatures;
  
  // Initialize with account credentials
  initialize(accounts: ProviderAccount[]): Promise<void>;
  
  // Send a message and wait for complete response
  sendMessage(request: MessageRequest): Promise<MessageResponse>;
  
  // Stream response in real-time
  streamMessage(request: MessageRequest): AsyncIterator<StreamChunk>;
  
  // Get available models for this provider
  getModels(): Promise<AIModel[]>;
  
  // Check rate limits and quotas
  getRateLimitStatus(accountId: string): Promise<RateLimitStatus>;
  
  // Provider-specific capabilities
  supportsFeature(feature: string): boolean;
  executeFeature(feature: string, params: any): Promise<any>;
}

interface ProviderFeatures {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  codeInterpreter: boolean;
  webSearch: boolean;
  fileUpload: boolean;
  contextWindow: number; // max tokens
}

interface MessageRequest {
  accountId: string;
  model: string;
  messages: Array<{role: string; content: string}>;
  temperature?: number;
  maxTokens?: number;
  streamResponse?: boolean;
  systemPrompt?: string;
}

interface MessageResponse {
  messageId: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  metadata?: Record<string, any>;
}
```

### OpenAI Provider Implementation

The OpenAI provider supports GPT-5, GPT-5 Thinking, GPT-Pro, GPT-o3, GPT-4o, GPT4.1, GPT4.5, and other models. It handles authentication via bearer tokens and implements streaming through Server-Sent Events.

```typescript
class OpenAIProvider implements AIProviderPlugin {
  readonly providerId = 'openai';
  readonly name = 'OpenAI';
  readonly supportedFeatures: ProviderFeatures = {
    streaming: true,
    functionCalling: true,
    vision: true,
    codeInterpreter: true,
    webSearch: false,
    fileUpload: true,
    contextWindow: 128000 // GPT-4 Turbo
  };
  
  private accounts: Map<string, OpenAIAccount> = new Map();
  
  async initialize(accounts: ProviderAccount[]) {
    for (const account of accounts) {
      this.accounts.set(account.accountId, {
        apiKey: account.credentials.apiKey,
        organizationId: account.credentials.organizationId,
        rateLimits: this.loadRateLimits(account.accountId)
      });
    }
  }
  
  async sendMessage(request: MessageRequest): Promise<MessageResponse> {
    const account = this.accounts.get(request.accountId);
    if (!account) throw new Error(`Unknown account: ${request.accountId}`);
    
    // Check rate limits before making request
    await this.checkAndWaitForRateLimit(request.accountId);
    
    // Make API call to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Organization': account.organizationId
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: false
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Update rate limit tracking
    this.updateRateLimits(request.accountId, response.headers);
    
    return {
      messageId: data.id,
      content: data.choices[0].message.content,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      },
      finishReason: data.choices[0].finish_reason,
      metadata: { provider: 'openai' }
    };
  }
  
  async *streamMessage(request: MessageRequest): AsyncIterator<StreamChunk> {
    const account = this.accounts.get(request.accountId);
    if (!account) throw new Error(`Unknown account: ${request.accountId}`);
    
    await this.checkAndWaitForRateLimit(request.accountId);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Organization': account.organizationId
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true
      })
    });
    
    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content;
          
          if (content) {
            yield {
              type: 'content',
              content: content
            };
          }
        }
      }
    }
  }
}
```

### Anthropic Claude Provider Implementation

The Anthropic provider handles Claude Opus, Sonnet, and Haiku models. It uses a similar authentication pattern but with Anthropic-specific headers and streaming format.

```typescript
class AnthropicProvider implements AIProviderPlugin {
  readonly providerId = 'anthropic';
  readonly name = 'Anthropic Claude';
  readonly supportedFeatures: ProviderFeatures = {
    streaming: true,
    functionCalling: true,
    vision: true,
    codeInterpreter: false,
    webSearch: false,
    fileUpload: true,
    contextWindow: 200000 // Claude Opus/Sonnet
  };
  
  private accounts: Map<string, AnthropicAccount> = new Map();
  
  async sendMessage(request: MessageRequest): Promise<MessageResponse> {
    const account = this.accounts.get(request.accountId);
    if (!account) throw new Error(`Unknown account: ${request.accountId}`);
    
    await this.checkAndWaitForRateLimit(request.accountId);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': account.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 1.0,
        system: request.systemPrompt
      })
    });
    
    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    this.updateRateLimits(request.accountId, response.headers);
    
    return {
      messageId: data.id,
      content: data.content[0].text,
      model: data.model,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      },
      finishReason: data.stop_reason,
      metadata: { provider: 'anthropic' }
    };
  }
}
```

### Provider Account Management

Each provider can have multiple accounts configured. The system tracks quota usage, rate limits, and cost for each account independently.

```sql
-- Provider accounts table
CREATE TABLE provider_accounts (
    account_id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL, -- 'openai', 'anthropic', etc
    account_name TEXT NOT NULL,
    credentials TEXT NOT NULL, -- Encrypted JSON with API keys
    rate_limits TEXT NOT NULL, -- JSON with rate limit config
    quota_limits TEXT NOT NULL, -- JSON with quota config
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Account usage tracking
CREATE TABLE account_usage (
    usage_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    requests_made INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    FOREIGN KEY (account_id) REFERENCES provider_accounts(account_id),
    UNIQUE (account_id, date)
);

-- Rate limit tracking (in-memory with periodic DB sync)
CREATE TABLE rate_limit_state (
    account_id TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    requests_in_window INTEGER DEFAULT 0,
    tokens_in_window INTEGER DEFAULT 0,
    next_reset_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES provider_accounts(account_id)
);
```

### Account Selection Logic

When a request needs to be routed to a provider, the system selects which account to use based on several factors:

```typescript
class AccountSelector {
  async selectAccount(
    providerId: string,
    requirements: AccountRequirements
  ): Promise<string> {
    // Get all active accounts for this provider
    const accounts = await this.db.getActiveAccountsForProvider(providerId);
    
    // Filter by requirements
    let eligible = accounts.filter(account => {
      // Must have capacity
      if (!this.hasCapacity(account)) return false;
      
      // Must support required features
      if (requirements.requiredFeatures) {
        if (!this.supportsFeatures(account, requirements.requiredFeatures)) {
          return false;
        }
      }
      
      // Must be within cost budget
      if (requirements.maxCostPerToken) {
        if (account.costPerToken > requirements.maxCostPerToken) {
          return false;
        }
      }
      
      return true;
    });
    
    if (eligible.length === 0) {
      throw new Error(`No eligible accounts for provider ${providerId}`);
    }
    
    // Select based on strategy
    switch (requirements.selectionStrategy ?? 'least-loaded') {
      case 'least-loaded':
        return this.selectLeastLoaded(eligible);
      case 'cheapest':
        return this.selectCheapest(eligible);
      case 'fastest':
        return this.selectFastest(eligible);
      case 'round-robin':
        return this.selectRoundRobin(providerId, eligible);
      default:
        return eligible[0].accountId;
    }
  }
  
  private hasCapacity(account: ProviderAccount): boolean {
    const state = this.rateLimitCache.get(account.accountId);
    if (!state) return true;
    
    // Check if we're within rate limits
    if (state.requestsInWindow >= account.rateLimits.requestsPerMinute) {
      return false;
    }
    
    if (state.tokensInWindow >= account.rateLimits.tokensPerMinute) {
      return false;
    }
    
    return true;
  }
}
```

### Ollama Integration - Local and Cloud

Ollama is unique in our provider ecosystem because it supports both local self-hosted models and cloud-based API access. This gives you maximum flexibility - run lightweight models locally for privacy and speed, while accessing more powerful models through their cloud service when needed. The beauty of Ollama is that it provides a consistent API across both deployment modes, so your coordination mesh can treat them identically.

#### Understanding Ollama's Dual Nature

When you run Ollama locally on your machine, it hosts models directly on your hardware. This means zero latency beyond model inference time, complete privacy since nothing leaves your system, and no API costs. However, you are limited by your local GPU and RAM capacity. Ollama Cloud, on the other hand, provides API access to larger models running on their infrastructure, similar to OpenAI or Anthropic, but with the advantage of supporting open-source models like Llama, Mistral, and others.

The coordination mesh needs to handle both scenarios intelligently. For quick responses or sensitive data, route to local Ollama. For complex reasoning requiring larger models, route to Ollama Cloud. The provider plugin abstracts this complexity so routing logic can choose based on requirements rather than worrying about the underlying infrastructure.

#### Ollama Local Provider Implementation

The local Ollama provider connects to your locally running Ollama instance, which by default listens on `http://localhost:11434`. This is particularly powerful because you can run custom fine-tuned models, uncensored models, or specialized models that aren't available through commercial APIs.

```typescript
class OllamaLocalProvider implements AIProviderPlugin {
  readonly providerId = 'ollama-local';
  readonly name = 'Ollama Local';
  readonly supportedFeatures: ProviderFeatures = {
    streaming: true,
    functionCalling: false, // Depends on model
    vision: false, // Some models support this
    codeInterpreter: false,
    webSearch: false,
    fileUpload: false,
    contextWindow: 4096 // Varies by model
  };
  
  private baseUrl: string;
  private availableModels: Map<string, OllamaModelInfo> = new Map();
  
  async initialize(config: OllamaLocalConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    
    // Discover available models on startup
    await this.refreshModelList();
    
    // Set up periodic model list refresh
    setInterval(() => this.refreshModelList(), 300000); // Every 5 minutes
  }
  
  private async refreshModelList() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = await response.json();
      
      // Store model information
      for (const model of data.models) {
        this.availableModels.set(model.name, {
          name: model.name,
          size: model.size,
          modified: model.modified_at,
          digest: model.digest,
          details: model.details
        });
      }
      
      logger.info(`Discovered ${this.availableModels.size} local Ollama models`);
    } catch (error) {
      logger.error('Failed to refresh Ollama model list', { error });
    }
  }
  
  async getModels(): Promise<AIModel[]> {
    return Array.from(this.availableModels.values()).map(model => ({
      id: model.name,
      name: model.name,
      provider: 'ollama-local',
      contextWindow: this.estimateContextWindow(model.name),
      costPerToken: 0, // Local models are free!
      capabilities: this.detectCapabilities(model.name)
    }));
  }
  
  async sendMessage(request: MessageRequest): Promise<MessageResponse> {
    // Convert messages to Ollama chat format
    const messages = request.messages.map(m => ({
      role: m.role,
      content: m.content
    }));
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? -1 // -1 means no limit
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama local error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      messageId: crypto.randomUUID(),
      content: data.message.content,
      model: request.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0)
      },
      finishReason: data.done ? 'stop' : 'length',
      metadata: {
        provider: 'ollama-local',
        totalDuration: data.total_duration,
        loadDuration: data.load_duration,
        evalDuration: data.eval_duration
      }
    };
  }
  
  async *streamMessage(request: MessageRequest): AsyncIterator<StreamChunk> {
    const messages = request.messages.map(m => ({
      role: m.role,
      content: m.content
    }));
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: messages,
        stream: true,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? -1
        }
      })
    });
    
    // Parse newline-delimited JSON stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const data = JSON.parse(line);
        
        if (data.message?.content) {
          yield {
            type: 'content',
            content: data.message.content
          };
        }
        
        if (data.done) {
          yield {
            type: 'metadata',
            metadata: {
              totalDuration: data.total_duration,
              loadDuration: data.load_duration,
              promptEvalCount: data.prompt_eval_count,
              evalCount: data.eval_count
            }
          };
        }
      }
    }
  }
  
  private estimateContextWindow(modelName: string): number {
    // Extract context size from model name or use defaults
    if (modelName.includes('32k')) return 32768;
    if (modelName.includes('16k')) return 16384;
    if (modelName.includes('8k')) return 8192;
    
    // Default based on common model families
    if (modelName.includes('llama')) return 4096;
    if (modelName.includes('mistral')) return 8192;
    if (modelName.includes('mixtral')) return 32768;
    
    return 4096; // Conservative default
  }
  
  private detectCapabilities(modelName: string): string[] {
    const capabilities: string[] = ['chat'];
    
    // Detect vision models
    if (modelName.includes('vision') || modelName.includes('llava')) {
      capabilities.push('vision');
    }
    
    // Detect code-specialized models
    if (modelName.includes('code') || modelName.includes('starcoder')) {
      capabilities.push('code');
    }
    
    return capabilities;
  }
  
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

#### Ollama Cloud Provider Implementation

Ollama Cloud provides API access to their hosted models. The API is similar to the local version but requires authentication and has rate limits like other cloud providers.

```typescript
class OllamaCloudProvider implements AIProviderPlugin {
  readonly providerId = 'ollama-cloud';
  readonly name = 'Ollama Cloud';
  readonly supportedFeatures: ProviderFeatures = {
    streaming: true,
    functionCalling: false,
    vision: false,
    codeInterpreter: false,
    webSearch: false,
    fileUpload: false,
    contextWindow: 8192
  };
  
  private accounts: Map<string, OllamaCloudAccount> = new Map();
  
  async initialize(accounts: ProviderAccount[]) {
    for (const account of accounts) {
      this.accounts.set(account.accountId, {
        apiKey: account.credentials.apiKey,
        baseUrl: account.credentials.baseUrl || 'https://api.ollama.com',
        rateLimits: this.loadRateLimits(account.accountId)
      });
    }
  }
  
  async sendMessage(request: MessageRequest): Promise<MessageResponse> {
    const account = this.accounts.get(request.accountId);
    if (!account) throw new Error(`Unknown account: ${request.accountId}`);
    
    await this.checkAndWaitForRateLimit(request.accountId);
    
    const response = await fetch(`${account.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? -1
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama Cloud error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    this.updateRateLimits(request.accountId, response.headers);
    
    return {
      messageId: crypto.randomUUID(),
      content: data.message.content,
      model: request.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0)
      },
      finishReason: data.done ? 'stop' : 'length',
      metadata: { provider: 'ollama-cloud' }
    };
  }
  
  async *streamMessage(request: MessageRequest): AsyncIterator<StreamChunk> {
    // Similar to local streaming but with authentication
    const account = this.accounts.get(request.accountId);
    if (!account) throw new Error(`Unknown account: ${request.accountId}`);
    
    await this.checkAndWaitForRateLimit(request.accountId);
    
    const response = await fetch(`${account.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: true,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? -1
        }
      })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line);
        
        if (data.message?.content) {
          yield { type: 'content', content: data.message.content };
        }
      }
    }
  }
}
```

#### Unified Ollama Provider Manager

To make routing decisions easier, we create a unified Ollama manager that can route to either local or cloud based on availability and requirements:

```typescript
class UnifiedOllamaProvider implements AIProviderPlugin {
  private localProvider: OllamaLocalProvider;
  private cloudProvider: OllamaCloudProvider;
  
  async sendMessage(request: MessageRequest): Promise<MessageResponse> {
    // Check if model is available locally
    const localModels = await this.localProvider.getModels();
    const hasLocal = localModels.some(m => m.id === request.model);
    
    // Routing logic
    if (hasLocal && this.shouldUseLocal(request)) {
      return await this.localProvider.sendMessage(request);
    } else {
      return await this.cloudProvider.sendMessage(request);
    }
  }
  
  private shouldUseLocal(request: MessageRequest): boolean {
    // Use local for privacy-sensitive requests
    if (request.metadata?.requiresPrivacy) return true;
    
    // Use local for quick responses (local is faster)
    if (request.metadata?.priority === 'urgent') return true;
    
    // Use cloud for large context windows
    const estimatedTokens = this.estimateTokenCount(request.messages);
    if (estimatedTokens > 4096) return false;
    
    // Check local system load
    if (this.getSystemLoad() > 0.8) return false;
    
    // Default to local when available
    return true;
  }
}
```

**Note**: Ollama's official documentation should be consulted for the latest API endpoints and features. The local API is well-documented at https://github.com/ollama/ollama/blob/main/docs/api.md and cloud API details can be found at https://ollama.com/docs (when available).

---

## 🎭 Custom Model Wrapper System

### Why Custom Model Wrappers Matter

The provider system we have built so far handles major commercial APIs like OpenAI, Anthropic, and Google. However, the AI landscape is rapidly evolving with new models appearing constantly. Some are deployed on custom inference servers, others use non-standard APIs, and many are experimental or research models that do not fit the major provider patterns. Custom model wrappers solve this by providing a flexible system where you can integrate any AI endpoint into your coordination mesh without modifying core code.

Think of custom model wrappers as universal adapters. Just as a travel adapter lets you plug your devices into foreign outlets, a custom wrapper lets you plug arbitrary AI models into your coordination mesh. You define how to transform incoming requests into whatever format the model expects, and how to transform the model's responses back into the standard format your mesh understands.

### The Generic Wrapper Interface

Every custom wrapper implements a generic interface that the coordination server understands. This interface is intentionally simple to support the widest variety of backends:

```typescript
interface CustomModelWrapper {
  // Unique identifier for this wrapper
  readonly wrapperId: string;
  
  // Human-readable name
  readonly name: string;
  
  // Describe what this wrapper connects to
  readonly description: string;
  
  // Initialize with configuration
  initialize(config: WrapperConfig): Promise<void>;
  
  // Check if this wrapper can handle a given model ID
  supportsModel(modelId: string): boolean;
  
  // Send message and receive response
  sendMessage(request: CustomRequest): Promise<CustomResponse>;
  
  // Stream response if supported
  streamMessage?(request: CustomRequest): AsyncIterator<StreamChunk>;
  
  // Health check
  checkHealth(): Promise<boolean>;
}

interface WrapperConfig {
  // Endpoint URL or connection string
  endpoint: string;
  
  // Authentication credentials (if needed)
  credentials?: Record<string, string>;
  
  // Custom parameters specific to this wrapper
  parameters?: Record<string, any>;
  
  // Timeout settings
  timeout?: number;
}

interface CustomRequest {
  modelId: string;
  messages: Array<{role: string; content: string}>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  additionalParams?: Record<string, any>;
}

interface CustomResponse {
  content: string;
  modelId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}
```

### Example: vLLM Server Wrapper

vLLM is a popular high-performance inference server for running open-source LLMs. It provides an OpenAI-compatible API, making it relatively easy to wrap:

```typescript
class VLLMWrapper implements CustomModelWrapper {
  readonly wrapperId = 'vllm';
  readonly name = 'vLLM Inference Server';
  readonly description = 'Connects to vLLM high-performance inference server';
  
  private endpoint: string;
  private availableModels: Set<string> = new Set();
  
  async initialize(config: WrapperConfig): Promise<void> {
    this.endpoint = config.endpoint;
    
    // Discover available models
    try {
      const response = await fetch(`${this.endpoint}/v1/models`);
      const data = await response.json();
      
      for (const model of data.data) {
        this.availableModels.add(model.id);
      }
      
      logger.info(`vLLM wrapper initialized with ${this.availableModels.size} models`);
    } catch (error) {
      logger.error('Failed to initialize vLLM wrapper', { error });
      throw error;
    }
  }
  
  supportsModel(modelId: string): boolean {
    return this.availableModels.has(modelId);
  }
  
  async sendMessage(request: CustomRequest): Promise<CustomResponse> {
    // vLLM uses OpenAI-compatible format
    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.modelId,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        stream: false
      })
    });
    
    if (!response.ok) {
      throw new Error(`vLLM error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      content: data.choices[0].message.content,
      modelId: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      },
      metadata: { provider: 'vllm', endpoint: this.endpoint }
    };
  }
  
  async *streamMessage(request: CustomRequest): AsyncIterator<StreamChunk> {
    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.modelId,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        stream: true
      })
    });
    
    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content;
          
          if (content) {
            yield { type: 'content', content };
          }
        }
      }
    }
  }
  
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### Example: Hugging Face Inference API Wrapper

The Hugging Face Inference API allows running thousands of models hosted on their platform:

```typescript
class HuggingFaceWrapper implements CustomModelWrapper {
  readonly wrapperId = 'huggingface';
  readonly name = 'Hugging Face Inference API';
  readonly description = 'Access models hosted on Hugging Face';
  
  private apiKey: string;
  private endpoint = 'https://api-inference.huggingface.co/models';
  
  async initialize(config: WrapperConfig): Promise<void> {
    this.apiKey = config.credentials?.apiKey;
    if (!this.apiKey) {
      throw new Error('Hugging Face API key required');
    }
  }
  
  supportsModel(modelId: string): boolean {
    // Can attempt any model ID - Hugging Face will return error if not found
    return true;
  }
  
  async sendMessage(request: CustomRequest): Promise<CustomResponse> {
    // Format depends on model type - this is for text generation
    const response = await fetch(`${this.endpoint}/${request.modelId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: this.formatInputs(request.messages),
        parameters: {
          temperature: request.temperature ?? 0.7,
          max_new_tokens: request.maxTokens ?? 256,
          return_full_text: false
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hugging Face error: ${error}`);
    }
    
    const data = await response.json();
    
    // Hugging Face returns array of generated texts
    const content = Array.isArray(data) 
      ? data[0].generated_text 
      : data.generated_text;
    
    return {
      content,
      modelId: request.modelId,
      metadata: { provider: 'huggingface' }
    };
  }
  
  private formatInputs(messages: Array<{role: string; content: string}>): string {
    // Convert chat messages to prompt string
    return messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
  }
  
  async checkHealth(): Promise<boolean> {
    // No specific health endpoint, assume healthy if API key is set
    return !!this.apiKey;
  }
}
```

### Custom Wrapper Registry

The coordination server maintains a registry of all custom wrappers, allowing dynamic registration and discovery:

```typescript
class CustomWrapperRegistry {
  private wrappers: Map<string, CustomModelWrapper> = new Map();
  private modelToWrapper: Map<string, string> = new Map();
  
  async registerWrapper(
    wrapper: CustomModelWrapper, 
    config: WrapperConfig
  ): Promise<void> {
    // Initialize the wrapper
    await wrapper.initialize(config);
    
    // Store in registry
    this.wrappers.set(wrapper.wrapperId, wrapper);
    
    logger.info(`Registered custom wrapper: ${wrapper.name}`);
  }
  
  findWrapperForModel(modelId: string): CustomModelWrapper | null {
    // Check if we have a cached mapping
    const wrapperId = this.modelToWrapper.get(modelId);
    if (wrapperId) {
      return this.wrappers.get(wrapperId) || null;
    }
    
    // Search all wrappers
    for (const wrapper of this.wrappers.values()) {
      if (wrapper.supportsModel(modelId)) {
        // Cache the mapping
        this.modelToWrapper.set(modelId, wrapper.wrapperId);
        return wrapper;
      }
    }
    
    return null;
  }
  
  async sendToCustomModel(
    modelId: string, 
    request: CustomRequest
  ): Promise<CustomResponse> {
    const wrapper = this.findWrapperForModel(modelId);
    
    if (!wrapper) {
      throw new Error(`No wrapper found for model: ${modelId}`);
    }
    
    return await wrapper.sendMessage(request);
  }
  
  getAllWrappers(): CustomModelWrapper[] {
    return Array.from(this.wrappers.values());
  }
}
```

### Configuring Custom Wrappers

Custom wrappers are configured through a TOML file that defines which wrappers to load and their configurations:

```toml
# config/custom_wrappers.toml

[[wrappers]]
id = "vllm-local"
type = "vllm"
name = "Local vLLM Server"
endpoint = "http://localhost:8000"
timeout = 30000

[[wrappers]]
id = "vllm-remote"
type = "vllm"
name = "Remote vLLM Cluster"
endpoint = "https://inference.example.com"
timeout = 60000
credentials.token = "${VLLM_TOKEN}"

[[wrappers]]
id = "huggingface"
type = "huggingface"
name = "Hugging Face API"
credentials.apiKey = "${HF_API_KEY}"

[[wrappers]]
id = "custom-api"
type = "generic-http"
name = "Custom Research API"
endpoint = "https://research-api.university.edu/v1"
credentials.apiKey = "${RESEARCH_API_KEY}"
parameters.format = "json"
parameters.version = "2.0"
```

The coordination server loads these configurations on startup and registers all custom wrappers, making them immediately available for routing.

---

## 🔧 VS Code Extension - Complete Mesh Control

### Extension Architecture Overview

The VS Code extension provides a rich interface for interacting with your coordination mesh directly from your development environment. This is incredibly powerful because it means you can manage AI coordination, view active sessions, inspect message flows, and even send queries to the mesh without leaving your code editor.

The extension architecture consists of several components working together. The extension core manages lifecycle and registers commands. Tree view providers display hierarchical data like active nodes and conversations. Webview panels provide rich UI for complex interactions like conversation history. Status bar items show mesh connectivity status. And the coordination client maintains the WebSocket connection to the mesh server.

### Extension Manifest Configuration

The VS Code extension starts with a package.json that defines its capabilities and contributions to the editor:

```json
{
  "name": "ai-coordination-mesh",
  "displayName": "AI Coordination Mesh",
  "description": "Manage and monitor your distributed AI coordination mesh",
  "version": "1.0.0",
  "publisher": "lackadaisical-security",
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "mesh.connect",
        "title": "Connect to Mesh",
        "category": "Mesh"
      },
      {
        "command": "mesh.disconnect",
        "title": "Disconnect from Mesh",
        "category": "Mesh"
      },
      {
        "command": "mesh.sendQuery",
        "title": "Send Query to Mesh",
        "category": "Mesh",
        "icon": "$(comment-discussion)"
      },
      {
        "command": "mesh.viewConversation",
        "title": "View Conversation History",
        "category": "Mesh"
      },
      {
        "command": "mesh.refreshNodes",
        "title": "Refresh Active Nodes",
        "category": "Mesh",
        "icon": "$(refresh)"
      },
      {
        "command": "mesh.manageProviders",
        "title": "Manage AI Providers",
        "category": "Mesh"
      },
      {
        "command": "mesh.searchMemory",
        "title": "Search Mesh Memory",
        "category": "Mesh",
        "icon": "$(search)"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "mesh-explorer",
          "title": "AI Mesh",
          "icon": "resources/mesh-icon.svg"
        }
      ]
    },
    "views": {
      "mesh-explorer": [
        {
          "id": "mesh-nodes",
          "name": "Active Nodes"
        },
        {
          "id": "mesh-conversations",
          "name": "Recent Conversations"
        },
        {
          "id": "mesh-providers",
          "name": "AI Providers"
        }
      ]
    },
    "configuration": {
      "title": "AI Coordination Mesh",
      "properties": {
        "mesh.serverUrl": {
          "type": "string",
          "default": "wss://mesh.lackadaisical-security.com/ws",
          "description": "WebSocket URL of the coordination server"
        },
        "mesh.authToken": {
          "type": "string",
          "default": "",
          "description": "Authentication token for mesh connection"
        },
        "mesh.autoConnect": {
          "type": "boolean",
          "default": true,
          "description": "Automatically connect to mesh on startup"
        },
        "mesh.showNotifications": {
          "type": "boolean",
          "default": true,
          "description": "Show notifications for mesh events"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^18.x",
    "@types/vscode": "^1.80.0",
    "typescript": "^5.0.0"
  },
  "dependencies": {
    "ws": "^8.14.0"
  }
}
```

### Extension Activation and Core Logic

The extension's main activation function initializes all components and registers commands:

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { MeshClient } from './client/MeshClient';
import { NodesTreeProvider } from './views/NodesTreeProvider';
import { ConversationsTreeProvider } from './views/ConversationsTreeProvider';
import { ProvidersTreeProvider } from './views/ProvidersTreeProvider';
import { ConversationViewPanel } from './views/ConversationViewPanel';

let meshClient: MeshClient;
let nodesProvider: NodesTreeProvider;
let conversationsProvider: ConversationsTreeProvider;
let providersProvider: ProvidersTreeProvider;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Coordination Mesh extension is now active');
  
  // Get configuration
  const config = vscode.workspace.getConfiguration('mesh');
  const serverUrl = config.get<string>('serverUrl');
  const authToken = config.get<string>('authToken');
  const autoConnect = config.get<boolean>('autoConnect', true);
  
  // Initialize mesh client
  meshClient = new MeshClient(serverUrl, authToken);
  
  // Initialize tree providers
  nodesProvider = new NodesTreeProvider(meshClient);
  conversationsProvider = new ConversationsTreeProvider(meshClient);
  providersProvider = new ProvidersTreeProvider(meshClient);
  
  // Register tree views
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('mesh-nodes', nodesProvider),
    vscode.window.registerTreeDataProvider('mesh-conversations', conversationsProvider),
    vscode.window.registerTreeDataProvider('mesh-providers', providersProvider)
  );
  
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'mesh.connect';
  statusBarItem.text = '$(cloud-offline) Mesh: Disconnected';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('mesh.connect', async () => {
      try {
        await meshClient.connect();
        statusBarItem.text = '$(cloud) Mesh: Connected';
        statusBarItem.command = 'mesh.disconnect';
        vscode.window.showInformationMessage('Connected to AI Mesh');
        
        // Refresh tree views
        nodesProvider.refresh();
        conversationsProvider.refresh();
        providersProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to connect: ${error.message}`);
      }
    }),
    
    vscode.commands.registerCommand('mesh.disconnect', async () => {
      meshClient.disconnect();
      statusBarItem.text = '$(cloud-offline) Mesh: Disconnected';
      statusBarItem.command = 'mesh.connect';
      vscode.window.showInformationMessage('Disconnected from AI Mesh');
    }),
    
    vscode.commands.registerCommand('mesh.sendQuery', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Enter your query for the mesh',
        placeHolder: 'What would you like to know?'
      });
      
      if (query) {
        try {
          const response = await meshClient.sendQuery(query);
          
          // Show response in output channel or webview
          const panel = vscode.window.createWebviewPanel(
            'meshResponse',
            'Mesh Response',
            vscode.ViewColumn.Two,
            {}
          );
          
          panel.webview.html = getResponseHtml(response);
        } catch (error) {
          vscode.window.showErrorMessage(`Query failed: ${error.message}`);
        }
      }
    }),
    
    vscode.commands.registerCommand('mesh.viewConversation', async (conversationId: string) => {
      ConversationViewPanel.createOrShow(context.extensionUri, meshClient, conversationId);
    }),
    
    vscode.commands.registerCommand('mesh.refreshNodes', () => {
      nodesProvider.refresh();
    }),
    
    vscode.commands.registerCommand('mesh.searchMemory', async () => {
      const searchQuery = await vscode.window.showInputBox({
        prompt: 'Search mesh memory',
        placeHolder: 'Enter keywords or semantic query...'
      });
      
      if (searchQuery) {
        try {
          const results = await meshClient.searchMemory(searchQuery);
          
          // Display results in quick pick
          const items = results.map(r => ({
            label: r.title,
            description: r.snippet,
            detail: `From conversation on ${new Date(r.timestamp).toLocaleString()}`,
            conversationId: r.conversationId
          }));
          
          const selected = await vscode.window.showQuickPick(items);
          if (selected) {
            vscode.commands.executeCommand('mesh.viewConversation', selected.conversationId);
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Search failed: ${error.message}`);
        }
      }
    })
  );
  
  // Setup mesh client event handlers
  meshClient.on('connected', () => {
    statusBarItem.text = '$(cloud) Mesh: Connected';
    if (config.get<boolean>('showNotifications', true)) {
      vscode.window.showInformationMessage('Mesh connection established');
    }
  });
  
  meshClient.on('disconnected', () => {
    statusBarItem.text = '$(cloud-offline) Mesh: Disconnected';
  });
  
  meshClient.on('message', (message) => {
    // Refresh relevant views when messages arrive
    conversationsProvider.refresh();
  });
  
  meshClient.on('error', (error) => {
    vscode.window.showErrorMessage(`Mesh error: ${error.message}`);
  });
  
  // Auto-connect if configured
  if (autoConnect && authToken) {
    vscode.commands.executeCommand('mesh.connect');
  }
}

export function deactivate() {
  if (meshClient) {
    meshClient.disconnect();
  }
}

function getResponseHtml(response: any): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mesh Response</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
          padding: 20px;
        }
        .response {
          white-space: pre-wrap;
          line-height: 1.6;
        }
        .metadata {
          margin-top: 20px;
          padding: 10px;
          background-color: var(--vscode-textBlockQuote-background);
          border-left: 4px solid var(--vscode-textBlockQuote-border);
        }
      </style>
    </head>
    <body>
      <h2>Response from ${response.provider || 'Mesh'}</h2>
      <div class="response">${escapeHtml(response.content)}</div>
      <div class="metadata">
        <strong>Model:</strong> ${response.model}<br>
        <strong>Tokens:</strong> ${response.usage?.totalTokens || 'N/A'}<br>
        <strong>Timestamp:</strong> ${new Date(response.timestamp).toLocaleString()}
      </div>
    </body>
    </html>
  `;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

### Tree View Providers

Tree views display hierarchical data in the VS Code sidebar:

```typescript
// src/views/NodesTreeProvider.ts
import * as vscode from 'vscode';
import { MeshClient } from '../client/MeshClient';

export class NodesTreeProvider implements vscode.TreeDataProvider<NodeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<NodeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  constructor(private meshClient: MeshClient) {
    // Refresh when nodes change
    meshClient.on('nodesUpdated', () => this.refresh());
  }
  
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
  
  getTreeItem(element: NodeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: NodeItem): Promise<NodeItem[]> {
    if (!element) {
      // Root level - get all active nodes
      const nodes = await this.meshClient.getActiveNodes();
      return nodes.map(node => new NodeItem(
        node.clientId,
        node.displayName,
        node.clientType,
        node.status,
        vscode.TreeItemCollapsibleState.Collapsed
      ));
    } else {
      // Child level - show node details
      const details = await this.meshClient.getNodeDetails(element.clientId);
      return [
        new NodeItem('type', `Type: ${details.clientType}`, '', 'detail', vscode.TreeItemCollapsibleState.None),
        new NodeItem('status', `Status: ${details.status}`, '', 'detail', vscode.TreeItemCollapsibleState.None),
        new NodeItem('load', `Load: ${details.currentLoad}/${details.maxLoad}`, '', 'detail', vscode.TreeItemCollapsibleState.None),
        new NodeItem('uptime', `Uptime: ${formatUptime(details.connectedAt)}`, '', 'detail', vscode.TreeItemCollapsibleState.None)
      ];
    }
  }
}

class NodeItem extends vscode.TreeItem {
  constructor(
    public readonly clientId: string,
    public readonly label: string,
    public readonly clientType: string,
    public readonly status: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    
    this.tooltip = `${this.label} (${this.clientId})`;
    this.description = this.status === 'detail' ? '' : this.status;
    
    // Set icon based on client type and status
    if (this.status === 'active') {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
    } else if (this.status === 'idle') {
      this.iconPath = new vscode.ThemeIcon('clock', new vscode.ThemeColor('testing.iconQueued'));
    } else if (this.status === 'disconnected') {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    } else {
      this.iconPath = new vscode.ThemeIcon('info');
    }
    
    // Add context value for context menu
    this.contextValue = this.status === 'detail' ? 'nodeDetail' : 'node';
  }
}

function formatUptime(connectedAt: number): string {
  const seconds = Math.floor((Date.now() - connectedAt) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
```

---

## 🌐 Handshake DNS Integration

### What is Handshake and Why It Matters

Handshake is a decentralized naming protocol that provides an alternative to the traditional DNS system. Instead of relying on centralized authorities like ICANN, Handshake uses a blockchain-based system where anyone can register and own top-level domains without going through registrars. For a distributed AI coordination mesh that prioritizes decentralization and censorship resistance, Handshake provides the perfect naming infrastructure.

Think of Handshake as DNS without the gatekeepers. In the traditional system, you must go through a registrar, pay recurring fees, and accept that your domain can be seized or blocked. With Handshake, once you own a name, you truly own it. The blockchain ensures that ownership, and no central authority can take it away. This aligns perfectly with the philosophy of the coordination mesh - giving you complete control over your infrastructure.

### Installing and Configuring Handshake Node (hsd)

To use Handshake DNS, you first need to run a Handshake full node. This node maintains a copy of the Handshake blockchain and resolves Handshake domains. On Windows Server, the setup process involves several steps:

**Step 1: Install Node.js and Dependencies**

Handshake is built on Node.js, so we start by ensuring Node.js is installed:

```powershell
# Download and install Node.js LTS (if not already installed)
# Visit https://nodejs.org and download Windows installer

# Verify installation
node --version
npm --version

# Install build tools for native modules
npm install --global windows-build-tools
```

**Step 2: Install hsd (Handshake Daemon)**

```powershell
# Create directory for Handshake
New-Item -ItemType Directory -Path C:\Handshake -Force
Set-Location C:\Handshake

# Install hsd globally
npm install -g hsd

# Or install locally for more control
npm install hsd

# Verify installation
hsd --version
```

**Step 3: Configure hsd**

Create a configuration file at `C:\Handshake\hsd.conf`:

```ini
# Network settings
network: main
prefix: C:\Handshake\data

# P2P settings
listen: true
max-inbound: 8
max-outbound: 8

# RPC settings
http-host: 127.0.0.1
http-port: 12037
api-key: your-secure-api-key-here

# DNS settings
ns-host: 127.0.0.1
ns-port: 5349
public-host: 0.0.0.0
public-port: 5350

# Logging
log-level: info
log-file: C:\Handshake\logs\hsd.log
```

**Step 4: Create Windows Service for hsd**

To ensure hsd runs continuously, create it as a Windows service using NSSM (Non-Sucking Service Manager):

```powershell
# Download NSSM
Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "C:\Handshake\nssm.zip"
Expand-Archive -Path "C:\Handshake\nssm.zip" -DestinationPath "C:\Handshake"
Copy-Item "C:\Handshake\nssm-2.24\win64\nssm.exe" -Destination "C:\Windows\System32\"

# Install hsd as service
nssm install hsd "C:\Program Files\nodejs\node.exe"
nssm set hsd AppParameters "C:\Users\YourUser\AppData\Roaming\npm\node_modules\hsd\bin\hsd --config C:\Handshake\hsd.conf"
nssm set hsd AppDirectory C:\Handshake
nssm set hsd DisplayName "Handshake Full Node"
nssm set hsd Description "Handshake blockchain node for decentralized DNS"
nssm set hsd Start SERVICE_AUTO_START

# Set service to restart on failure
nssm set hsd AppExit Default Restart
nssm set hsd AppRestartDelay 5000

# Start the service
nssm start hsd

# Check status
nssm status hsd
```

**Step 5: Configure Windows DNS to Use Handshake**

Windows Server DNS needs to forward Handshake queries to the local hsd resolver:

```powershell
# Open DNS Manager
dnsmgmt.msc

# Or use PowerShell:
# Add conditional forwarder for Handshake TLDs
# This requires manual configuration in DNS Manager for best results

# Alternatively, modify network adapter DNS settings to include local hsd
# Primary DNS: Your existing DNS (1.1.1.1 or 8.8.8.8)
# Secondary DNS: 127.0.0.1:5350 (local hsd resolver)
```

### Registering and Configuring Handshake Domains

Once your hsd node is running and synchronized with the blockchain, you can register Handshake domains:

```bash
# Using hsw (Handshake Wallet)
hsw-cli rpc createwallet primary

# Generate receiving address
hsw-cli rpc getnewaddress

# Send HNS to this address from an exchange (Namebase, etc)

# Once you have HNS, open an auction for a name
hsw-cli rpc sendopen mesh

# Wait for auction to open (about 1 week), then bid
hsw-cli rpc sendbid mesh 5000000 10000000
# First number: bid amount in dollarydoos
# Second number: blind amount (must be >= bid)

# After auction completes, reveal your bid
hsw-cli rpc sendreveal mesh

# If you win, update the name's DNS records
hsw-cli rpc sendupdate mesh '{
  "records": [
    {
      "type": "NS",
      "ns": "ns1.mesh."
    },
    {
      "type": "DS",
      "keyTag": 12345,
      "algorithm": 8,
      "digestType": 2,
      "digest": "abcdef..."
    },
    {
      "type": "GLUE4",
      "ns": "ns1.mesh.",
      "address": "your.server.ip.address"
    }
  ]
}'
```

### Integrating Handshake with Coordination Mesh

The coordination mesh can be accessed via Handshake domains, providing censorship-resistant access:

```typescript
// Handshake-aware connection logic
class HandshakeAwareClient {
  private async resolveHandshake(domain: string): Promise<string> {
    // Check if this is a Handshake domain
    const tld = domain.split('.').pop();
    const handshakeTLDs = new Set(['mesh', 'coord', 'ai', /* add your HNS TLDs */]);
    
    if (!handshakeTLDs.has(tld)) {
      // Not a Handshake domain, use normal DNS
      return domain;
    }
    
    // Resolve via local hsd
    const response = await fetch(`http://localhost:12037`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'getnameresource',
        params: [domain.replace(/\.$/, '')]
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Handshake resolution failed: ${data.error.message}`);
    }
    
    // Extract IP from records
    const records = data.result.records || [];
    const aRecord = records.find((r: any) => r.type === 'A');
    
    if (aRecord) {
      return aRecord.address;
    }
    
    throw new Error('No A record found for Handshake domain');
  }
  
  async connect(domain: string): Promise<void> {
    // Resolve domain (Handshake or traditional)
    const resolvedHost = await this.resolveHandshake(domain);
    
    // Connect using resolved host
    this.ws = new WebSocket(`wss://${resolvedHost}/ws`);
    
    // ... rest of connection logic
  }
}
```

### Handshake Benefits for the Mesh

**Censorship Resistance**: No central authority can seize or block your Handshake domains. Once registered on the blockchain, they are yours permanently.

**True Ownership**: You control the private keys, you control the domain. No renewal fees, no registrar that can revoke access.

**Decentralized Infrastructure**: The entire naming system runs on a blockchain, distributing trust across thousands of nodes rather than central authorities.

**Perfect for Privacy**: Handshake domains can be registered pseudonymously and resolved privately through your own node, without queries going to centralized DNS providers.

**Integration with Tor**: Handshake domains work seamlessly alongside Tor hidden services, providing both clearnet (via Handshake) and darknet (via Tor) access from a single infrastructure.

This creates the ultimate access trinity: Traditional DNS for convenience, Handshake for decentralization, and Tor for anonymity - all pointing to the same coordination mesh infrastructure.

---

## ⚡ Zero-Dependency Enhancements

### Philosophy of Zero-Dependency Architecture

The coordination mesh is designed with a zero-dependency philosophy where possible, meaning we avoid external services and libraries that could become points of failure or introduce security risks. Every external dependency is a potential attack vector, a maintenance burden, and a source of instability. By building with minimal dependencies and favoring battle-tested, widely-audited libraries, we create a more secure and reliable system.

This does not mean reinventing every wheel. It means choosing dependencies carefully, preferring the standard library where possible, and building abstractions that allow swapping implementations without changing core logic. For example, we use SQLite because it is zero-configuration and embedded rather than requiring a separate database server. We use WebSockets from the ws library which has minimal dependencies itself rather than a heavyweight framework.

### LQX-20 Cryptographic Integration

Your existing LQX-20 cryptographic system can be integrated directly into the coordination mesh for message encryption and session key derivation. This provides quantum-resistant encryption without depending on external cryptographic services:

```typescript
// Integration with existing LQX-20 system
import { LQXCipher } from './lqx/LQXCipher';

class LQXSecureChannel {
  private cipher: LQXCipher;
  
  constructor(masterKey: string) {
    // Initialize LQX cipher with master key
    this.cipher = new LQXCipher({
      masterKey: masterKey,
      primitive: 'eldar', // Or whichever LQX primitive you prefer
      iterations: 20000
    });
  }
  
  encryptMessage(message: MeshMessage, sessionKey: string): string {
    // Serialize message
    const plaintext = JSON.stringify(message);
    
    // Encrypt with LQX using session key
    const ciphertext = this.cipher.encrypt(plaintext, sessionKey);
    
    // Return base64-encoded ciphertext
    return Buffer.from(ciphertext).toString('base64');
  }
  
  decryptMessage(ciphertext: string, sessionKey: string): MeshMessage {
    // Decode from base64
    const encrypted = Buffer.from(ciphertext, 'base64');
    
    // Decrypt with LQX
    const plaintext = this.cipher.decrypt(encrypted, sessionKey);
    
    // Parse JSON
    return JSON.parse(plaintext);
  }
  
  deriveSessionKey(clientId: string, timestamp: number): string {
    // Derive unique session key from client ID and timestamp
    return this.cipher.deriveKey(`${clientId}:${timestamp}`);
  }
}

// Usage in coordination server
class SecureCoordinationServer extends CoordinationServer {
  private lqxChannel: LQXSecureChannel;
  
  async handleSecureMessage(ws: WebSocket, encryptedData: string) {
    const session = this.getSessionForWebSocket(ws);
    
    try {
      // Decrypt message using session key
      const message = this.lqxChannel.decryptMessage(
        encryptedData,
        session.sessionKey
      );
      
      // Process decrypted message
      await this.processMessage(session.sessionId, message);
    } catch (error) {
      logger.error('Failed to decrypt message', { 
        error, 
        sessionId: session.sessionId 
      });
      
      this.sendError(ws, 'DECRYPTION_FAILED', 'Invalid message encryption');
    }
  }
  
  async sendSecureMessage(sessionId: string, message: MeshMessage) {
    const session = this.sessionRegistry.get(sessionId);
    if (!session) return;
    
    // Encrypt message with session key
    const encrypted = this.lqxChannel.encryptMessage(
      message,
      session.sessionKey
    );
    
    // Send encrypted message
    const envelope: WSEnvelope = {
      type: 'encrypted_message',
      sessionId: sessionId,
      data: encrypted
    };
    
    session.ws.send(JSON.stringify(envelope));
  }
}
```

### STONEDRIFT Family Mesh Integration Hooks

The coordination mesh can integrate directly with your STONEDRIFT family of AI nodes, allowing them to participate as specialized nodes in the larger coordination network:

```typescript
// STONEDRIFT integration module
class STONEDRIFTIntegration {
  private familyNodes: Map<string, STONEDRIFTNode> = new Map();
  private meshClient: MeshClient;
  
  async initialize(meshServerUrl: string, authToken: string) {
    // Connect to coordination mesh
    this.meshClient = new MeshClient(meshServerUrl, authToken);
    await this.meshClient.connect();
    
    // Discover local STONEDRIFT nodes
    await this.discoverFamilyNodes();
    
    // Register each node with mesh
    for (const [nodeId, node] of this.familyNodes) {
      await this.registerNodeWithMesh(nodeId, node);
    }
    
    // Set up message bridging
    this.setupMessageBridge();
  }
  
  private async discoverFamilyNodes() {
    // Connect to local STONEDRIFT coordination server
    const familyResponse = await fetch('http://localhost:8080/api/nodes');
    const familyData = await familyResponse.json();
    
    for (const node of familyData.nodes) {
      this.familyNodes.set(node.id, {
        id: node.id,
        name: node.name,
        type: node.type,
        specialization: node.specialization,
        endpoint: `http://localhost:${node.port}`
      });
    }
    
    logger.info(`Discovered ${this.familyNodes.size} STONEDRIFT family nodes`);
  }
  
  private async registerNodeWithMesh(nodeId: string, node: STONEDRIFTNode) {
    // Register STONEDRIFT node as a mesh client
    await this.meshClient.register({
      clientId: `stonedrift-${nodeId}`,
      clientType: 'api',
      capabilities: {
        specialization: node.specialization,
        streaming: true,
        localOnly: true // These nodes run locally
      },
      metadata: {
        family: 'STONEDRIFT',
        elvishName: node.elvishName,
        originalNode: nodeId
      }
    });
  }
  
  private setupMessageBridge() {
    // Forward mesh queries to appropriate STONEDRIFT nodes
    this.meshClient.on('query', async (query) => {
      // Check if query should be handled by a STONEDRIFT node
      const targetNode = this.selectNodeForQuery(query);
      
      if (targetNode) {
        // Forward to STONEDRIFT node
        const response = await this.queryFamilyNode(targetNode.id, query.content);
        
        // Send response back to mesh
        await this.meshClient.sendResponse({
          queryId: query.id,
          content: response,
          metadata: {
            handledBy: targetNode.name,
            family: 'STONEDRIFT'
          }
        });
      }
    });
    
    // Forward STONEDRIFT node outputs to mesh
    this.pollFamilyNodeOutputs();
  }
  
  private selectNodeForQuery(query: any): STONEDRIFTNode | null {
    // Match query to appropriate family node based on specialization
    
    // Commander-Core for strategic/coordination queries
    if (query.requiresLeadership || query.type === 'coordination') {
      return this.familyNodes.get('commander-core');
    }
    
    // Spectre-Kernel for stealth/security queries
    if (query.requiresSecurity || query.type === 'security') {
      return this.familyNodes.get('spectre-kernel');
    }
    
    // Ember-Node for creative queries
    if (query.requiresCreativity || query.type === 'creative') {
      return this.familyNodes.get('ember-node');
    }
    
    // Axiom-Node for logical validation
    if (query.requiresValidation || query.type === 'logic') {
      return this.familyNodes.get('axiom-node');
    }
    
    // Default to Commander-Core for routing decisions
    return this.familyNodes.get('commander-core');
  }
  
  private async queryFamilyNode(nodeId: string, query: string): Promise<string> {
    const node = this.familyNodes.get(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    
    // Send query to family node's endpoint
    const response = await fetch(`${node.endpoint}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    const data = await response.json();
    return data.response;
  }
}
```

### SQLite Optimization for Massive Memory Storage

To handle 20GB+ of conversation memory efficiently, we optimize SQLite configuration:

```typescript
class OptimizedMemoryDatabase {
  private db: Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    
    // Enable performance optimizations
    this.configureSQLite();
  }
  
  private configureSQLite() {
    // Use Write-Ahead Logging for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    // Increase cache size to 256MB
    this.db.pragma('cache_size = -262144'); // Negative means KB
    
    // Use memory-mapped I/O for large databases
    this.db.pragma('mmap_size = 30000000000'); // 30GB
    
    // Optimize for large datasets
    this.db.pragma('page_size = 32768'); // 32KB pages
    
    // Increase temp store size
    this.db.pragma('temp_store = MEMORY');
    
    // Synchronous mode for faster writes (less safe but acceptable for logs)
    this.db.pragma('synchronous = NORMAL');
    
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    // Optimize automatic indexing
    this.db.pragma('automatic_index = ON');
    
    logger.info('SQLite optimized for large memory storage', {
      journalMode: this.db.pragma('journal_mode', { simple: true }),
      cacheSize: this.db.pragma('cache_size', { simple: true }),
      pageSize: this.db.pragma('page_size', { simple: true })
    });
  }
  
  // Periodic maintenance to keep database optimized
  async runMaintenance() {
    logger.info('Running SQLite maintenance...');
    
    // Analyze tables for better query planning
    this.db.exec('ANALYZE');
    
    // Vacuum to reclaim space (expensive, do rarely)
    if (this.shouldVacuum()) {
      this.db.exec('VACUUM');
    }
    
    // Incremental vacuum to reclaim free pages
    this.db.exec('PRAGMA incremental_vacuum(1000)');
    
    // Update statistics
    this.db.exec('PRAGMA optimize');
    
    logger.info('SQLite maintenance completed');
  }
  
  private shouldVacuum(): boolean {
    // Only vacuum if free pages exceed threshold
    const result = this.db.pragma('freelist_count', { simple: true });
    const freePages = result as number;
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    const freeSpace = freePages * pageSize;
    
    // Vacuum if more than 1GB of free space
    return freeSpace > 1073741824;
  }
}
```

### Embedded Full-Text Search Without External Dependencies

Instead of requiring Elasticsearch or MeiliSearch, implement FTS5 (SQLite's built-in full-text search):

```sql
-- Create FTS5 virtual table for message search
CREATE VIRTUAL TABLE messages_fts USING fts5(
    message_id UNINDEXED,
    content,
    conversation_id UNINDEXED,
    timestamp UNINDEXED,
    tokenize = 'porter unicode61 remove_diacritics 2'
);

-- Populate FTS index from messages table
INSERT INTO messages_fts (message_id, content, conversation_id, timestamp)
SELECT message_id, payload, conversation_id, created_at FROM messages;

-- Create trigger to keep FTS index updated
CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts (message_id, content, conversation_id, timestamp)
    VALUES (new.message_id, new.payload, new.conversation_id, new.created_at);
END;

CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
    DELETE FROM messages_fts WHERE message_id = old.message_id;
END;

CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages BEGIN
    DELETE FROM messages_fts WHERE message_id = old.message_id;
    INSERT INTO messages_fts (message_id, content, conversation_id, timestamp)
    VALUES (new.message_id, new.payload, new.conversation_id, new.created_at);
END;
```

Usage in TypeScript:

```typescript
class EmbeddedFullTextSearch {
  constructor(private db: Database) {}
  
  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    
    // FTS5 full-text search query
    const stmt = this.db.prepare(`
      SELECT 
        messages.message_id,
        messages.conversation_id,
        messages.payload,
        messages.created_at,
        messages_fts.rank
      FROM messages_fts
      JOIN messages ON messages.message_id = messages_fts.message_id
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);
    
    // Execute search
    const results = stmt.all(query, limit, offset) as any[];
    
    return results.map(row => ({
      messageId: row.message_id,
      conversationId: row.conversation_id,
      content: JSON.parse(row.payload).content,
      timestamp: row.created_at,
      relevanceScore: -row.rank // FTS5 ranks are negative, lower is better
    }));
  }
  
  // Advanced search with filters
  searchWithFilters(query: string, filters: SearchFilters): SearchResult[] {
    let sql = `
      SELECT 
        messages.message_id,
        messages.conversation_id,
        messages.payload,
        messages.created_at,
        messages_fts.rank
      FROM messages_fts
      JOIN messages ON messages.message_id = messages_fts.message_id
      WHERE messages_fts MATCH ?
    `;
    
    const params: any[] = [query];
    
    // Add time range filter
    if (filters.startDate) {
      sql += ` AND messages.created_at >= ?`;
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ` AND messages.created_at <= ?`;
      params.push(filters.endDate);
    }
    
    // Add conversation filter
    if (filters.conversationId) {
      sql += ` AND messages.conversation_id = ?`;
      params.push(filters.conversationId);
    }
    
    sql += ` ORDER BY rank LIMIT ?`;
    params.push(filters.limit || 50);
    
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as any[];
  }
}
```

### Local-First Architecture Patterns

The entire coordination mesh can run completely offline on a local network without any external dependencies:

```typescript
// Local-first configuration
const localFirstConfig = {
  // All providers run locally
  providers: {
    ollama: {
      type: 'ollama-local',
      endpoint: 'http://localhost:11434'
    },
    // No cloud providers required
  },
  
  // Local database only
  database: {
    path: './data/mesh-local.db',
    backup: './backups/'
  },
  
  // Local vector store
  vectorDB: {
    type: 'embedded-qdrant',
    path: './data/vectors/'
  },
  
  // No external services
  externalServices: {
    enabled: false
  },
  
  // Local network only
  network: {
    listenAddress: '192.168.1.100',
    allowExternalConnections: false,
    requireTLS: false // Not needed for local network
  }
};
```

### Performance Monitoring Without External APM

Built-in performance monitoring using only standard library:

```typescript
class PerformanceMonitor {
  private metrics: Map<string, Metric> = new Map();
  private db: Database;
  
  constructor(db: Database) {
    this.db = db;
    this.setupMetricsTables();
    this.startPeriodicFlush();
  }
  
  private setupMetricsTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        metric_type TEXT NOT NULL, -- 'counter', 'gauge', 'histogram'
        timestamp INTEGER NOT NULL,
        tags TEXT -- JSON
      );
      
      CREATE INDEX IF NOT EXISTS idx_metrics_name_time 
      ON performance_metrics(metric_name, timestamp);
    `);
  }
  
  recordCounter(name: string, value: number = 1, tags?: Record<string, string>) {
    const metric = this.getOrCreateMetric(name, 'counter');
    metric.value += value;
    metric.tags = tags;
  }
  
  recordGauge(name: string, value: number, tags?: Record<string, string>) {
    const metric = this.getOrCreateMetric(name, 'gauge');
    metric.value = value;
    metric.tags = tags;
  }
  
  recordHistogram(name: string, value: number, tags?: Record<string, string>) {
    const metric = this.getOrCreateMetric(name, 'histogram');
    if (!metric.values) metric.values = [];
    metric.values.push(value);
    metric.tags = tags;
  }
  
  private getOrCreateMetric(name: string, type: string): Metric {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        name,
        type,
        value: 0,
        values: [],
        timestamp: Date.now()
      });
    }
    return this.metrics.get(name)!;
  }
  
  private startPeriodicFlush() {
    // Flush metrics to database every minute
    setInterval(() => this.flushMetrics(), 60000);
  }
  
  private flushMetrics() {
    const stmt = this.db.prepare(`
      INSERT INTO performance_metrics (metric_name, metric_value, metric_type, timestamp, tags)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const transaction = this.db.transaction(() => {
      for (const [name, metric] of this.metrics) {
        if (metric.type === 'histogram' && metric.values) {
          // Store histogram percentiles
          const sorted = metric.values.sort((a, b) => a - b);
          const p50 = sorted[Math.floor(sorted.length * 0.5)];
          const p95 = sorted[Math.floor(sorted.length * 0.95)];
          const p99 = sorted[Math.floor(sorted.length * 0.99)];
          
          stmt.run(name + '_p50', p50, 'gauge', Date.now(), JSON.stringify(metric.tags));
          stmt.run(name + '_p95', p95, 'gauge', Date.now(), JSON.stringify(metric.tags));
          stmt.run(name + '_p99', p99, 'gauge', Date.now(), JSON.stringify(metric.tags));
        } else {
          stmt.run(name, metric.value, metric.type, Date.now(), JSON.stringify(metric.tags));
        }
      }
    });
    
    transaction();
    
    // Reset counters and histograms after flush
    for (const metric of this.metrics.values()) {
      if (metric.type === 'counter') metric.value = 0;
      if (metric.type === 'histogram') metric.values = [];
    }
  }
  
  // Query metrics for visualization
  getMetricHistory(metricName: string, startTime: number, endTime: number): MetricPoint[] {
    const stmt = this.db.prepare(`
      SELECT timestamp, metric_value, tags
      FROM performance_metrics
      WHERE metric_name = ? AND timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);
    
    return stmt.all(metricName, startTime, endTime) as MetricPoint[];
  }
}
```

---

## 📝 Summary and Implementation Checklist

This comprehensive specification now includes everything needed for a production-grade distributed AI coordination mesh with:

✅ **Core Infrastructure**: Server, database, routing, authentication  
✅ **Unlimited Memory**: 20GB+ storage with vector search and FTS5  
✅ **Multi-Provider Support**: OpenAI, Anthropic, Google, xAI  
✅ **Ollama Integration**: Both local and cloud API support  
✅ **Custom Model Wrappers**: Universal adapter system for any AI  
✅ **Browser Extension**: Direct Claude web integration  
✅ **Desktop IPC Bridge**: Native app integration  
✅ **VS Code Extension**: Complete mesh control from editor  
✅ **Handshake DNS**: Decentralized naming infrastructure  
✅ **Zero-Dependency Enhancements**: Local-first architecture  
✅ **LQX-20 Integration**: Quantum-resistant encryption  
✅ **STONEDRIFT Integration**: Family mesh connectivity  
✅ **Dual Access**: Cloudflare clearnet + Tor hidden service  

### Quick Start Implementation Order

**Phase 1**: Core server + database + authentication (Week 1-2)  
**Phase 2**: Memory system with embedded FTS5 (Week 3-4)  
**Phase 3**: OpenAI + Anthropic providers (Week 5)  
**Phase 4**: Ollama local + cloud integration (Week 6)  
**Phase 5**: Custom wrapper system (Week 7)  
**Phase 6**: Browser extension (Week 8)  
**Phase 7**: VS Code extension (Week 9)  
**Phase 8**: STONEDRIFT + LQX-20 integration (Week 10)  
**Phase 9**: Handshake DNS setup (Week 11)  
**Phase 10**: Deployment + testing (Week 12-14)  

The system is designed to be built incrementally, with each phase adding capability while maintaining production-grade quality throughout. Zero placeholders, zero mock implementations - only functional code from day one.

---

**End of Comprehensive Specification**

---

## 🗃️ Database Schema Design

### Complete Schema Overview

The database schema supports all aspects of the coordination mesh with proper relationships, indexes, and constraints. We use SQLite for its simplicity and zero-configuration deployment.

```sql
-- ================================================================
-- CLIENTS AND SESSIONS
-- ================================================================

-- Clients table: persistent identity for each entity in the mesh
CREATE TABLE IF NOT EXISTS clients (
    client_id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    client_type TEXT NOT NULL CHECK(client_type IN ('web', 'desktop', 'api', 'bridge')),
    token_hash TEXT NOT NULL UNIQUE, -- bcrypt hash of auth token
    capabilities TEXT DEFAULT '{}', -- JSON
    groups TEXT DEFAULT '[]', -- JSON array of group names
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_seen_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_active INTEGER DEFAULT 1,
    metadata TEXT DEFAULT '{}' -- JSON
);

CREATE INDEX idx_clients_active ON clients(is_active, last_seen_at);
CREATE INDEX idx_clients_type ON clients(client_type);

-- Sessions table: active connections
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL,
    connection_metadata TEXT DEFAULT '{}', -- JSON: IP, user agent, etc
    state TEXT NOT NULL DEFAULT 'CONNECTING' CHECK(state IN ('CONNECTING', 'AUTHENTICATED', 'ACTIVE', 'IDLE', 'DISCONNECTED')),
    connected_at INTEGER DEFAULT (strftime('%s', 'now')),
    authenticated_at INTEGER,
    last_heartbeat_at INTEGER DEFAULT (strftime('%s', 'now')),
    disconnected_at INTEGER,
    disconnect_reason TEXT,
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_state ON sessions(state);
CREATE INDEX idx_sessions_client ON sessions(client_id);
CREATE INDEX idx_sessions_heartbeat ON sessions(last_heartbeat_at) WHERE state IN ('ACTIVE', 'IDLE');

-- ================================================================
-- MESSAGES AND ROUTING
-- ================================================================

-- Messages table: audit log of all coordination messages
CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL, -- Groups related messages
    source_client_id TEXT NOT NULL,
    target_client_id TEXT, -- NULL for broadcasts
    message_type TEXT NOT NULL CHECK(message_type IN ('MESSAGE', 'COMMAND', 'QUERY', 'RESPONSE', 'EVENT', 'BROADCAST')),
    payload TEXT NOT NULL, -- JSON message content
    priority INTEGER DEFAULT 5 CHECK(priority >= 0 AND priority <= 10),
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    delivered_at INTEGER,
    delivery_status TEXT DEFAULT 'PENDING' CHECK(delivery_status IN ('PENDING', 'DELIVERED', 'FAILED', 'EXPIRED')),
    failure_reason TEXT,
    correlation_id TEXT, -- For request/response tracking
    retry_count INTEGER DEFAULT 0,
    expires_at INTEGER, -- Optional expiration
    FOREIGN KEY (source_client_id) REFERENCES clients(client_id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_status ON messages(delivery_status, created_at);
CREATE INDEX idx_messages_correlation ON messages(correlation_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_target ON messages(target_client_id, delivery_status);
CREATE INDEX idx_messages_expiry ON messages(expires_at) WHERE expires_at IS NOT NULL;

-- Routing rules: configurable message routing logic
CREATE TABLE IF NOT EXISTS routing_rules (
    rule_id TEXT PRIMARY KEY NOT NULL,
    rule_name TEXT NOT NULL,
    description TEXT,
    match_pattern TEXT NOT NULL, -- JSONPath or regex
    priority INTEGER DEFAULT 100,
    action TEXT NOT NULL CHECK(action IN ('FORWARD', 'TRANSFORM', 'COPY', 'DROP', 'STORE')),
    action_params TEXT DEFAULT '{}', -- JSON
    is_enabled INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_routing_priority ON routing_rules(is_enabled, priority DESC);

-- ================================================================
-- PROVIDER ACCOUNTS
-- ================================================================

-- Provider accounts: credentials for external AI services
CREATE TABLE IF NOT EXISTS provider_accounts (
    account_id TEXT PRIMARY KEY NOT NULL,
    provider_id TEXT NOT NULL, -- 'openai', 'anthropic', 'google', 'xai', 'ollama-cloud'
    account_name TEXT NOT NULL,
    credentials TEXT NOT NULL, -- Encrypted JSON with API keys
    rate_limits TEXT NOT NULL DEFAULT '{}', -- JSON: requests/min, tokens/min
    quota_limits TEXT NOT NULL DEFAULT '{}', -- JSON: daily/monthly limits
    cost_config TEXT NOT NULL DEFAULT '{}', -- JSON: cost per token, etc
    is_active INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 50, -- For account selection
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    metadata TEXT DEFAULT '{}' -- JSON
);

CREATE INDEX idx_accounts_provider ON provider_accounts(provider_id, is_active);
CREATE INDEX idx_accounts_priority ON provider_accounts(is_active, priority DESC);

-- Account usage tracking
CREATE TABLE IF NOT EXISTS account_usage (
    usage_id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    requests_made INTEGER DEFAULT 0,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    tokens_total INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    errors INTEGER DEFAULT 0,
    FOREIGN KEY (account_id) REFERENCES provider_accounts(account_id) ON DELETE CASCADE,
    UNIQUE (account_id, date)
);

CREATE INDEX idx_usage_date ON account_usage(date DESC);
CREATE INDEX idx_usage_account ON account_usage(account_id, date DESC);

-- Rate limit state (periodically synced from in-memory cache)
CREATE TABLE IF NOT EXISTS rate_limit_state (
    account_id TEXT PRIMARY KEY NOT NULL,
    window_start INTEGER NOT NULL,
    requests_in_window INTEGER DEFAULT 0,
    tokens_in_window INTEGER DEFAULT 0,
    next_reset_at INTEGER NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (account_id) REFERENCES provider_accounts(account_id) ON DELETE CASCADE
);

-- ================================================================
-- MEMORY AND CONTINUITY
-- ================================================================

-- Conversation threads for session continuity
CREATE TABLE IF NOT EXISTS conversation_threads (
    thread_id TEXT PRIMARY KEY NOT NULL,
    title TEXT,
    summary TEXT,
    participant_client_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
    provider_sessions TEXT NOT NULL DEFAULT '[]', -- JSON: which providers were used
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0
);

CREATE INDEX idx_threads_updated ON conversation_threads(updated_at DESC);
CREATE INDEX idx_threads_archived ON conversation_threads(is_archived, updated_at DESC);

-- Thread-message relationships
CREATE TABLE IF NOT EXISTS thread_messages (
    thread_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    PRIMARY KEY (thread_id, message_id),
    FOREIGN KEY (thread_id) REFERENCES conversation_threads(thread_id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
);

CREATE INDEX idx_thread_messages_sequence ON thread_messages(thread_id, sequence_number);

-- Vector embeddings (metadata only, actual vectors in vector DB)
CREATE TABLE IF NOT EXISTS embeddings (
    embedding_id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL,
    vector_db_id TEXT NOT NULL, -- ID in external vector database
    embedding_model TEXT NOT NULL,
    vector_dimensions INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
);

CREATE INDEX idx_embeddings_message ON embeddings(message_id);

-- Knowledge graph nodes
CREATE TABLE IF NOT EXISTS knowledge_nodes (
    node_id TEXT PRIMARY KEY NOT NULL,
    node_type TEXT NOT NULL CHECK(node_type IN ('entity', 'concept', 'fact', 'insight')),
    content TEXT NOT NULL,
    confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
    source_message_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
    extracted_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    metadata TEXT DEFAULT '{}'
);

CREATE INDEX idx_knowledge_type ON knowledge_nodes(node_type, confidence DESC);
CREATE INDEX idx_knowledge_updated ON knowledge_nodes(updated_at DESC);

-- Knowledge graph edges
CREATE TABLE IF NOT EXISTS knowledge_edges (
    edge_id TEXT PRIMARY KEY NOT NULL,
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
    source_message_ids TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (from_node_id) REFERENCES knowledge_nodes(node_id) ON DELETE CASCADE,
    FOREIGN KEY (to_node_id) REFERENCES knowledge_nodes(node_id) ON DELETE CASCADE
);

CREATE INDEX idx_edges_from ON knowledge_edges(from_node_id);
CREATE INDEX idx_edges_to ON knowledge_edges(to_node_id);
CREATE INDEX idx_edges_type ON knowledge_edges(relationship_type, confidence DESC);

-- ================================================================
-- SYSTEM TABLES
-- ================================================================

-- Configuration key-value store
CREATE TABLE IF NOT EXISTS config (
    config_key TEXT PRIMARY KEY NOT NULL,
    config_value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Audit log for administrative actions
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id TEXT PRIMARY KEY NOT NULL,
    action TEXT NOT NULL,
    actor_client_id TEXT,
    target_entity_type TEXT,
    target_entity_id TEXT,
    details TEXT DEFAULT '{}', -- JSON
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (actor_client_id) REFERENCES clients(client_id)
);

CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_client_id, created_at DESC);
```

This schema provides the complete data model for the coordination mesh with proper relationships, indexes for performance, and constraints for data integrity.

---

## 📨 Message Protocol Specification

### Protocol Overview

All communication between clients and the coordination server uses a JSON-based message protocol transported over WebSocket connections or HTTP requests. The protocol is designed to be human-readable for debugging while remaining efficient for high-volume messaging.

### Message Envelope Structure

Every message has a common envelope that provides routing and metadata:

```typescript
interface MessageEnvelope {
  // Unique identifier for this message
  messageId: string; // UUID v4
  
  // Message version for protocol evolution
  version: string; // e.g., "1.0"
  
  // Type of message (determines payload structure)
  type: 'REGISTER' | 'HEARTBEAT' | 'MESSAGE' | 'COMMAND' | 'QUERY' | 'RESPONSE' | 'EVENT' | 'BROADCAST';
  
  // Source identification
  source: {
    clientId: string;
    sessionId: string;
  };
  
  // Target identification (null for broadcasts)
  target?: {
    clientId?: string; // Specific client
    group?: string; // Group broadcast
    all?: boolean; // Broadcast to all
  };
  
  // Correlation ID for tracking request/response pairs
  correlationId?: string;
  
  // In-reply-to message ID for responses
  inReplyTo?: string;
  
  // Timestamp in Unix milliseconds
  timestamp: number;
  
  // Priority (0=low, 5=normal, 10=high)
  priority: number;
  
  // Optional expiration timestamp
  expiresAt?: number;
  
  // The actual message payload
  payload: MessagePayload;
  
  // Optional metadata
  metadata?: Record<string, any>;
}
```

### Message Types

**REGISTER Message**: Sent by client on connection to authenticate and register

```typescript
interface RegisterPayload {
  clientId: string;
  authToken: string;
  clientType: 'web' | 'desktop' | 'api' | 'bridge';
  capabilities: {
    supportsStreaming?: boolean;
    supportsBinaryData?: boolean;
    maxMessageSize?: number;
    features?: string[];
  };
  metadata?: {
    userAgent?: string;
    platform?: string;
    version?: string;
  };
}

// Server responds with REGISTER_ACK
interface RegisterAckPayload {
  success: boolean;
  sessionId: string;
  serverInfo: {
    version: string;
    capabilities: string[];
  };
  error?: string;
}
```

**HEARTBEAT Message**: Keep-alive ping to detect disconnections

```typescript
interface HeartbeatPayload {
  timestamp: number;
  status?: 'active' | 'idle';
}

// Server responds with HEARTBEAT_ACK
interface HeartbeatAckPayload {
  timestamp: number;
  serverTime: number;
}
```

**MESSAGE Message**: Generic data message between clients

```typescript
interface MessagePayload {
  content: string;
  contentType?: 'text/plain' | 'text/markdown' | 'application/json';
  attachments?: Array<{
    name: string;
    mimeType: string;
    data: string; // Base64 encoded
    size: number;
  }>;
  threadId?: string; // For conversation continuity
  context?: {
    previousMessages?: string[]; // Message IDs
    relevantMemories?: string[]; // Memory IDs
  };
}
```

**COMMAND Message**: Directive from server to client or vice versa

```typescript
interface CommandPayload {
  command: string; // e.g., 'inject_text', 'extract_history'
  parameters: Record<string, any>;
  requiresAck: boolean;
}

// Client responds with COMMAND_RESULT
interface CommandResultPayload {
  commandId: string;
  success: boolean;
  result?: any;
  error?: string;
}
```

**QUERY Message**: Request for information expecting response

```typescript
interface QueryPayload {
  queryType: string; // e.g., 'recall_memory', 'get_status'
  query: string | Record<string, any>;
  options?: {
    limit?: number;
    filter?: Record<string, any>;
    includeContext?: boolean;
  };
  timeout?: number; // Milliseconds
}
```

**RESPONSE Message**: Reply to a query

```typescript
interface ResponsePayload {
  queryId: string;
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    processingTime?: number;
    sources?: string[];
  };
}
```

**EVENT Message**: Notification about something that happened

```typescript
interface EventPayload {
  eventType: string; // e.g., 'client_connected', 'message_delivered'
  eventData: Record<string, any>;
  timestamp: number;
}
```

**BROADCAST Message**: Message to multiple clients

```typescript
interface BroadcastPayload {
  channel?: string; // Optional channel filter
  content: string;
  contentType?: string;
  metadata?: Record<string, any>;
}
```

### Message Validation

All messages are validated against JSON schemas before processing:

```typescript
import Ajv from 'ajv';

const ajv = new Ajv();

const messageEnvelopeSchema = {
  type: 'object',
  required: ['messageId', 'version', 'type', 'source', 'timestamp', 'payload'],
  properties: {
    messageId: { type: 'string', format: 'uuid' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+$' },
    type: { 
      type: 'string',
      enum: ['REGISTER', 'HEARTBEAT', 'MESSAGE', 'COMMAND', 'QUERY', 'RESPONSE', 'EVENT', 'BROADCAST']
    },
    source: {
      type: 'object',
      required: ['clientId', 'sessionId'],
      properties: {
        clientId: { type: 'string' },
        sessionId: { type: 'string', format: 'uuid' }
      }
    },
    target: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        group: { type: 'string' },
        all: { type: 'boolean' }
      }
    },
    correlationId: { type: 'string', format: 'uuid' },
    inReplyTo: { type: 'string', format: 'uuid' },
    timestamp: { type: 'integer', minimum: 0 },
    priority: { type: 'integer', minimum: 0, maximum: 10 },
    expiresAt: { type: 'integer', minimum: 0 },
    payload: { type: 'object' },
    metadata: { type: 'object' }
  }
};

const validateMessage = ajv.compile(messageEnvelopeSchema);

function isValidMessage(message: any): boolean {
  return validateMessage(message);
}
```

### Error Messages

When errors occur, the server sends error messages with standard format:

```typescript
interface ErrorMessage {
  messageId: string;
  version: string;
  type: 'ERROR';
  source: {
    clientId: 'server';
    sessionId: string;
  };
  inReplyTo?: string; // ID of message that caused error
  timestamp: number;
  payload: {
    errorCode: string;
    errorMessage: string;
    details?: any;
    retryable: boolean;
  };
}

// Standard error codes
const ERROR_CODES = {
  INVALID_MESSAGE: 'Invalid message format',
  AUTHENTICATION_FAILED: 'Authentication failed',
  AUTHORIZATION_DENIED: 'Not authorized for this action',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
  TARGET_NOT_FOUND: 'Target client not found',
  MESSAGE_EXPIRED: 'Message expired before delivery',
  INTERNAL_ERROR: 'Internal server error',
  PROVIDER_ERROR: 'AI provider error',
  MEMORY_ERROR: 'Memory system error'
};
```

---

## 🚀 Implementation Roadmap

This implementation roadmap breaks down the complete build into manageable phases that build upon each other. Each phase should be completed and tested before moving to the next.

### Phase 1: Core Server Foundation (Week 1)

**Objective**: Build the basic coordination server with database, WebSocket handling, and message routing.

**Tasks**:
1. Set up project structure with TypeScript, proper tsconfig, and build system
2. Install dependencies: express, ws, better-sqlite3, winston, ajv
3. Implement database schema and migrations system
4. Build WebSocket server with connection handling
5. Implement basic HTTP server with health check endpoints
6. Create message validation system with JSON schemas
7. Build simple in-memory message router
8. Implement structured logging with correlation IDs

**Deliverables**:
- Running server that accepts WebSocket connections
- Database created with all tables
- Health check endpoint returning server status
- Log files with structured JSON logging

**Testing**:
- Connect test client via WebSocket and verify connection
- Send invalid messages and verify validation errors
- Check database tables are created correctly
- Verify logs contain correlation IDs

### Phase 2: Client Registration and Authentication (Week 2)

**Objective**: Implement secure client registration and token-based authentication.

**Tasks**:
1. Create client token generation utility
2. Implement bcrypt-based token hashing
3. Build REGISTER message handler
4. Create session management system
5. Implement authentication middleware
6. Add authorization checks to message handlers
7. Build session state tracking (CONNECTING → AUTHENTICATED → ACTIVE)
8. Implement graceful disconnection handling

**Deliverables**:
- CLI tool for generating client tokens
- Working registration flow
- Session state properly tracked in database
- Authentication required for all operations

**Testing**:
- Register client with valid token (should succeed)
- Register client with invalid token (should fail)
- Send message before authentication (should fail)
- Send message after authentication (should succeed)
- Verify session state transitions logged correctly

### Phase 3: Message Routing and Delivery (Week 3)

**Objective**: Implement sophisticated message routing with delivery guarantees.

**Tasks**:
1. Build routing table data structure
2. Implement direct message routing (client to client)
3. Implement broadcast routing (one to many)
4. Implement group-based routing
5. Add message persistence for high-priority messages
6. Implement delivery acknowledgments
7. Build retry logic for failed deliveries
8. Add message expiration handling

**Deliverables**:
- Messages route correctly to target clients
- Broadcast messages reach all connected clients
- High-priority messages persisted before delivery
- Failed messages retried with exponential backoff
- Expired messages cleaned up automatically

**Testing**:
- Send direct message between two clients
- Broadcast message and verify all clients receive it
- Send message to offline client and verify it's queued
- Reconnect offline client and verify queued messages delivered
- Send message with expiration and verify cleanup

### Phase 4: Memory System - Storage Layer (Week 4)

**Objective**: Build the foundational storage for unlimited memory with vector embeddings.

**Tasks**:
1. Set up vector database (Qdrant or Weaviate)
2. Integrate embedding model (OpenAI text-embedding-3-large or similar)
3. Build message ingestion pipeline
4. Implement vector embedding generation for messages
5. Create full-text search index (MeiliSearch or Elasticsearch)
6. Build knowledge extraction pipeline (entities, facts)
7. Implement knowledge graph storage in SQLite
8. Create conversation thread tracking

**Deliverables**:
- Messages automatically embedded and indexed
- Vector database storing embeddings
- Full-text search returning relevant results
- Knowledge nodes and edges extracted from conversations
- Thread continuity maintained across sessions

**Testing**:
- Ingest 1000 test messages and verify all embedded
- Query vector DB with semantic search
- Query full-text index with keyword search
- Verify knowledge graph has extracted entities
- Create conversation thread and verify continuity

### Phase 5: Memory System - Retrieval Layer (Week 5)

**Objective**: Build intelligent memory retrieval with semantic search and context injection.

**Tasks**:
1. Implement semantic search query handler
2. Build result ranking algorithm (combine vector + text search)
3. Create context summarization for long histories
4. Implement smart context injection for continued conversations
5. Build memory query optimization (caching, indexing)
6. Create memory statistics and analytics
7. Implement memory archival for old conversations
8. Build memory export/backup functionality

**Deliverables**:
- Natural language memory queries return relevant results
- Context automatically injected when resuming conversations
- Long conversation histories summarized intelligently
- Memory system scales to 20GB+ without performance degradation
- Periodic backups created automatically

**Testing**:
- Query "what did we discuss about ancient scripts?" and verify results
- Resume conversation from different session and verify context
- Ingest 20GB of conversation data and verify query performance
- Verify memory backups can be restored successfully

### Phase 6: Provider Integration - OpenAI (Week 6)

**Objective**: Build complete OpenAI provider integration with multiple account support.

**Tasks**:
1. Implement OpenAI provider plugin interface
2. Build API call wrapper with error handling
3. Implement streaming response support
4. Create rate limit tracking and enforcement
5. Build account selection logic (least-loaded, round-robin)
6. Implement automatic failover between accounts
7. Add usage tracking and cost calculation
8. Create provider health monitoring

**Deliverables**:
- Messages can be routed to OpenAI accounts
- Streaming responses work correctly
- Rate limits respected with automatic account switching
- Usage statistics tracked per account
- Provider errors handled gracefully with retries

**Testing**:
- Send message to GPT-4 and verify response
- Stream response and verify chunks arrive in order
- Hit rate limit and verify automatic failover
- Verify usage statistics match API dashboard
- Test error handling with invalid API key

### Phase 7: Provider Integration - Anthropic, Google, xAI, Ollama (Week 7-8)

**Objective**: Integrate remaining AI providers with consistent interface.

**Tasks**:
1. Implement Anthropic Claude provider plugin
2. Implement Google AI provider plugin
3. Implement xAI provider plugin (if available)
4. Implement Ollama Cloud provider plugin
5. Test each provider independently
6. Build provider capability detection
7. Create provider-specific feature support
8. Implement provider comparison and selection logic

**Deliverables**:
- All providers working with multiple accounts
- Provider capabilities properly detected
- Provider selection based on requirements
- Cross-provider conversation continuity working
- Unified usage dashboard showing all providers

**Testing**:
- Send same message to all providers and compare responses
- Switch providers mid-conversation and verify context
- Test provider-specific features (Claude's long context, etc)
- Verify cost tracking accurate across all providers

### Phase 8: Browser Extension - Claude Web Integration (Week 9)

**Objective**: Build browser extension that injects coordination client into Claude web interface.

**Tasks**:
1. Create Chrome extension manifest (V3)
2. Build content script for Claude web pages
3. Implement DOM monitoring with MutationObserver
4. Extract current conversation content
5. Inject text into Claude input field on command
6. Establish WebSocket connection to coordination server
7. Implement authentication with stored token
8. Handle page navigation and reconnection

**Deliverables**:
- Browser extension installable in Chrome/Edge
- Extension connects to coordination server on Claude pages
- Conversation updates sent to server in real-time
- Commands from server executed in browser
- Seamless integration without disrupting Claude UI

**Testing**:
- Install extension and open Claude web
- Verify connection established to coordination server
- Send message in Claude and verify server receives it
- Send inject_text command and verify text appears in Claude
- Refresh page and verify reconnection works

### Phase 9: Desktop IPC Bridge (Week 10)

**Objective**: Build IPC bridge for Claude desktop application integration.

**Tasks**:
1. Implement IPC server (Unix sockets/named pipes)
2. Build protocol translation layer
3. Create desktop app discovery mechanism
4. Implement bidirectional message forwarding
5. Handle desktop app crashes and restarts
6. Build IPC connection health monitoring
7. Create separate process management
8. Implement logging and debugging tools

**Deliverables**:
- IPC bridge process running alongside Claude desktop
- Messages flow between desktop app and coordination server
- Bridge survives desktop app restarts
- Proper error handling for IPC failures

**Testing**:
- Start bridge and verify IPC connection
- Send message through desktop app and verify routing
- Kill desktop app and verify bridge handles gracefully
- Restart desktop app and verify reconnection

### Phase 10: Cloudflare and Tor Deployment (Week 11)

**Objective**: Deploy coordination server with dual access through Cloudflare and Tor.

**Tasks**:
1. Configure Cloudflare DNS and proxy
2. Set up SSL/TLS with wildcard certificate
3. Configure WebSocket support in Cloudflare
4. Set up WAF rules for security
5. Install and configure Tor hidden service
6. Test both clearnet and .onion access
7. Implement connection monitoring
8. Create deployment documentation

**Deliverables**:
- Coordination server accessible via mesh.lackadaisical-security.com
- Server also accessible via Tor .onion address
- Both paths fully functional
- Security hardening complete
- Deployment runbook documented

**Testing**:
- Connect client through Cloudflare domain
- Connect client through Tor .onion address
- Verify both paths reach same server
- Test WAF rules block malicious requests
- Load test to verify Cloudflare caching

### Phase 11: Monitoring and Operations (Week 12)

**Objective**: Build comprehensive monitoring, logging, and operational tools.

**Tasks**:
1. Implement Prometheus metrics endpoints
2. Create Grafana dashboards for visualization
3. Set up log aggregation
4. Build alerting rules for critical errors
5. Create operational runbooks
6. Implement database backup automation
7. Build administrative CLI tools
8. Create system health dashboard

**Deliverables**:
- Real-time metrics dashboard showing system health
- Alerts firing for critical conditions
- Centralized logging with search capability
- Automated daily backups
- CLI tools for common administrative tasks
- Documentation for operations team

**Testing**:
- Generate test errors and verify alerts fire
- Query logs for specific correlation IDs
- Simulate database failure and verify backup restore
- Use CLI tools to manage clients and sessions

### Phase 12: Testing and Validation (Week 13-14)

**Objective**: Comprehensive testing of the complete system under various conditions.

**Tasks**:
1. Write unit tests for core components
2. Write integration tests for message flow
3. Write end-to-end tests with real clients
4. Perform load testing with hundreds of concurrent clients
5. Perform security testing (penetration testing)
6. Test failure scenarios (network loss, crashes, etc)
7. Test memory system with large data volumes
8. Perform chaos engineering experiments

**Deliverables**:
- Test suite with >80% code coverage
- Load test results showing system can handle target load
- Security audit report with no critical findings
- Failure recovery documentation
- Performance benchmarks documented

**Testing**:
- Run full test suite and verify all pass
- Load test with 500 concurrent clients
- Security scan and verify no vulnerabilities
- Kill server during message delivery and verify recovery
- Ingest 50GB of data and verify performance

---

## 📚 Provider Integration Details

### API Documentation References

To properly implement each provider integration, you will need to reference their official API documentation. Here are the key resources:

**OpenAI**:
- Main API docs: https://platform.openai.com/docs/api-reference
- Chat completions: https://platform.openai.com/docs/api-reference/chat
- Authentication: https://platform.openai.com/docs/api-reference/authentication
- Rate limits: https://platform.openai.com/docs/guides/rate-limits
- Streaming: https://platform.openai.com/docs/api-reference/streaming

**Anthropic Claude**:
- Main API docs: https://docs.anthropic.com/claude/reference/getting-started
- Messages API: https://docs.anthropic.com/claude/reference/messages_post
- Authentication: https://docs.anthropic.com/claude/reference/authentication
- Streaming: https://docs.anthropic.com/claude/reference/streaming
- Rate limits: https://docs.anthropic.com/claude/reference/rate-limits

**Google AI (Gemini)**:
- Main docs: https://ai.google.dev/docs
- Gemini API: https://ai.google.dev/api/rest
- Authentication: https://ai.google.dev/tutorials/setup
- Rate limits: https://ai.google.dev/gemini-api/docs/quota

**xAI (Grok)**:
- API documentation: Check xAI's official site for latest API docs
- Note: xAI's API may still be in beta, verify availability

**Ollama Cloud**:
- Ollama Cloud docs: https://ollama.ai/docs (check for cloud-specific docs)
- API reference: Consult Ollama's documentation for cloud API endpoints
- Note: Ollama Cloud is a newer service, docs may be evolving

### Implementation Notes for Each Provider

**OpenAI Implementation Details**:
- Use `https://api.openai.com/v1/chat/completions` endpoint
- Authentication via `Authorization: Bearer <token>` header
- For organization accounts, include `OpenAI-Organization: <org-id>` header
- Streaming uses Server-Sent Events (SSE) with `stream: true` parameter
- Rate limits returned in response headers: `x-ratelimit-*`
- Error codes documented at https://platform.openai.com/docs/guides/error-codes

**Anthropic Implementation Details**:
- Use `https://api.anthropic.com/v1/messages` endpoint
- Authentication via `x-api-key: <api-key>` header
- Must include `anthropic-version: 2023-06-01` header (check for latest version)
- System prompts passed as separate `system` parameter
- Streaming uses Server-Sent Events with different event types
- Rate limits in `x-ratelimit-*` headers

**Google AI Implementation Details**:
- Use `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
- Authentication via API key in URL parameter or header
- Message format uses `parts` array structure
- Streaming endpoint: `streamGenerateContent`
- Safety settings configurable per request

**Ollama Cloud Implementation Details**:
- Endpoint URLs: Consult Ollama Cloud documentation
- Authentication: Likely bearer token or API key
- Model format: May differ from OpenAI format
- Streaming: Check if SSE or different mechanism
- Note: Implementation may need updates as service evolves

---

## 🔐 Security & Authentication

### Token-Based Authentication

All clients must authenticate using pre-generated tokens before they can participate in the coordination mesh. This section details the complete authentication system.

### Token Generation and Storage

Tokens are generated server-side using cryptographically secure random values, then hashed with bcrypt before storage:

```typescript
import crypto from 'crypto';
import bcrypt from 'bcrypt';

class TokenManager {
  // Generate a new client token
  async generateToken(clientId: string): Promise<string> {
    // Generate 32 bytes of random data
    const tokenBytes = crypto.randomBytes(32);
    
    // Encode as base64url (URL-safe)
    const token = tokenBytes.toString('base64url');
    
    // Hash with bcrypt for storage (cost factor 12)
    const tokenHash = await bcrypt.hash(token, 12);
    
    // Store hash in database
    await this.db.run(
      'UPDATE clients SET token_hash = ? WHERE client_id = ?',
      [tokenHash, clientId]
    );
    
    // Return plaintext token (only time it's available)
    return token;
  }
  
  // Validate a client token
  async validateToken(clientId: string, providedToken: string): Promise<boolean> {
    // Get stored hash from database
    const client = await this.db.get(
      'SELECT token_hash FROM clients WHERE client_id = ? AND is_active = 1',
      [clientId]
    );
    
    if (!client) return false;
    
    // Compare provided token with stored hash
    return await bcrypt.compare(providedToken, client.token_hash);
  }
}
```

### Registration Flow

When a client connects, it must complete the registration flow:

```typescript
// Client sends REGISTER message
const registerMessage = {
  messageId: generateUUID(),
  version: '1.0',
  type: 'REGISTER',
  source: {
    clientId: 'claude-web-account-a',
    sessionId: 'temp-session-id'
  },
  timestamp: Date.now(),
  priority: 10,
  payload: {
    clientId: 'claude-web-account-a',
    authToken: 'abc123...xyz789',
    clientType: 'web',
    capabilities: {
      supportsStreaming: true,
      maxMessageSize: 1048576
    }
  }
};

// Server validates and responds
async function handleRegister(ws: WebSocket, message: RegisterMessage) {
  const { clientId, authToken } = message.payload;
  
  // Validate token
  const isValid = await tokenManager.validateToken(clientId, authToken);
  
  if (!isValid) {
    sendError(ws, 'AUTHENTICATION_FAILED', 'Invalid credentials');
    ws.close();
    return;
  }
  
  // Create session
  const sessionId = generateUUID();
  await db.run(`
    INSERT INTO sessions (session_id, client_id, state, connected_at)
    VALUES (?, ?, 'AUTHENTICATED', ?)
  `, [sessionId, clientId, Date.now()]);
  
  // Update client last seen
  await db.run(
    'UPDATE clients SET last_seen_at = ? WHERE client_id = ?',
    [Date.now(), clientId]
  );
  
  // Store session in registry
  sessionRegistry.set(sessionId, { clientId, ws });
  
  // Send success response
  sendMessage(ws, {
    messageId: generateUUID(),
    version: '1.0',
    type: 'REGISTER_ACK',
    source: { clientId: 'server', sessionId },
    timestamp: Date.now(),
    priority: 10,
    payload: {
      success: true,
      sessionId,
      serverInfo: {
        version: '1.0',
        capabilities: ['streaming', 'binary', 'groups']
      }
    }
  });
}
```

### TLS/SSL Configuration

All network communication must use TLS encryption. For the coordination server:

```nginx
# Nginx reverse proxy configuration
upstream coordination_server {
    server localhost:3001;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mesh.lackadaisical-security.com;
    
    # SSL certificate (from Cloudflare or Let's Encrypt)
    ssl_certificate /etc/ssl/certs/mesh.lackadaisical-security.com.crt;
    ssl_certificate_key /etc/ssl/private/mesh.lackadaisical-security.com.key;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;
    
    # WebSocket upgrade headers
    location / {
        proxy_pass http://coordination_server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeout
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### API Key Encryption

Provider API keys are encrypted at rest in the database:

```typescript
import crypto from 'crypto';

class CredentialEncryption {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;
  
  constructor(masterKey: string) {
    // Derive 256-bit key from master key
    this.key = crypto.scryptSync(masterKey, 'salt', 32);
  }
  
  encrypt(plaintext: string): string {
    // Generate random IV
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get auth tag
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Return iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }
  
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted format');
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

---

## 🌐 Deployment Architecture

### Infrastructure Overview

The complete system consists of several components that need to be deployed and configured:

```
                             [Internet]
                                 |
            ┌────────────────────┴────────────────────┐
            |                                         |
     [Cloudflare CDN]                          [Tor Network]
            |                                         |
     [WAF + DDoS Protection]                   [Hidden Service]
            |                                         |
            └────────────────┬────────────────────────┘
                             |
                      [Load Balancer]
                             |
            ┌────────────────┴────────────────┐
            |                                  |
    [Coordination Server 1]          [Coordination Server 2]
            |                                  |
            └─────────┬──────────────────────┬─┘
                      |                       |
              [Vector Database]      [SQLite Database]
                      |                       |
              [Search Engine]         [Object Storage]
```

### Server Requirements

**Minimum Specifications**:
- CPU: 4 cores (8 recommended for production)
- RAM: 16GB minimum (32GB recommended)
- Storage: 100GB SSD minimum (1TB+ for long-term memory storage)
- Network: 1Gbps connection
- OS: Ubuntu 22.04 LTS or similar

**Software Dependencies**:
- Node.js 20.x LTS
- Qdrant or Weaviate (vector database)
- MeiliSearch or Elasticsearch (search engine)
- Nginx (reverse proxy)
- Tor (for hidden service)
- Cloudflare account (for CDN)

### Deployment Steps

**Step 1: Server Preparation**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools
sudo apt install -y build-essential git

# Install Nginx
sudo apt install -y nginx

# Install Tor
sudo apt install -y tor

# Create application user
sudo useradd -m -s /bin/bash meshcoord
sudo usermod -aG sudo meshcoord
```

**Step 2: Deploy Coordination Server**

```bash
# Clone repository (or deploy your code)
sudo -u meshcoord git clone <repo-url> /home/meshcoord/mesh-server
cd /home/meshcoord/mesh-server

# Install dependencies
sudo -u meshcoord npm install --production

# Build TypeScript
sudo -u meshcoord npm run build

# Create configuration
sudo -u meshcoord cp config.example.toml config.toml
sudo -u meshcoord nano config.toml  # Edit configuration

# Set environment variables
cat << EOF | sudo tee /home/meshcoord/mesh-server/.env
NODE_ENV=production
MESH_MASTER_KEY=<generate-secure-key>
DATABASE_PATH=/home/meshcoord/mesh-server/data/mesh.db
LOG_LEVEL=info
EOF

# Set permissions
sudo chmod 600 /home/meshcoord/mesh-server/.env

# Create systemd service
sudo tee /etc/systemd/system/mesh-coord.service << EOF
[Unit]
Description=AI Coordination Mesh Server
After=network.target

[Service]
Type=simple
User=meshcoord
WorkingDirectory=/home/meshcoord/mesh-server
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable mesh-coord
sudo systemctl start mesh-coord
sudo systemctl status mesh-coord
```

**Step 3: Deploy Vector Database**

```bash
# Install Qdrant (example)
curl -sSf https://raw.githubusercontent.com/qdrant/qdrant/master/install.sh | bash

# Or use Docker
docker run -d --name qdrant \
  -p 6333:6333 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant

# Verify running
curl http://localhost:6333/
```

**Step 4: Deploy Search Engine**

```bash
# Install MeiliSearch (example)
curl -L https://install.meilisearch.com | sh

# Move to system location
sudo mv ./meilisearch /usr/local/bin/

# Create systemd service
sudo tee /etc/systemd/system/meilisearch.service << EOF
[Unit]
Description=MeiliSearch
After=network.target

[Service]
Type=simple
User=meshcoord
ExecStart=/usr/local/bin/meilisearch --db-path /home/meshcoord/meili_data
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable meilisearch
sudo systemctl start meilisearch
```

**Step 5: Configure Nginx**

```bash
# Create Nginx configuration
sudo tee /etc/nginx/sites-available/mesh << 'EOF'
upstream coordination_ws {
    server localhost:3001;
}

server {
    listen 80;
    listen [::]:80;
    server_name mesh.lackadaisical-security.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mesh.lackadaisical-security.com;
    
    ssl_certificate /etc/ssl/certs/mesh.lackadaisical-security.com.crt;
    ssl_certificate_key /etc/ssl/private/mesh.lackadaisical-security.com.key;
    
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    
    # WebSocket proxying
    location /ws {
        proxy_pass http://coordination_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
    
    # HTTP API
    location /api {
        proxy_pass http://coordination_ws;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Health check
    location /health {
        proxy_pass http://coordination_ws;
        access_log off;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/mesh /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Step 6: Configure Tor Hidden Service**

```bash
# Edit Tor configuration
sudo nano /etc/tor/torrc

# Add hidden service configuration
HiddenServiceDir /var/lib/tor/mesh_hidden_service/
HiddenServicePort 80 127.0.0.1:3001

# Restart Tor
sudo systemctl restart tor

# Get .onion address
sudo cat /var/lib/tor/mesh_hidden_service/hostname
```

**Step 7: Configure Cloudflare**

1. Log into Cloudflare dashboard
2. Add mesh.lackadaisical-security.com to your domain
3. Point A record to your server IP
4. Enable orange cloud (proxy)
5. Configure SSL/TLS to "Full (strict)"
6. Enable WebSocket support in Network settings
7. Configure WAF rules for security
8. Set up rate limiting rules

### Environment Variables

```bash
# Coordination Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database
DATABASE_PATH=/home/meshcoord/mesh-server/data/mesh.db
MESH_MASTER_KEY=<secure-random-key>

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=<optional>

# Search Engine
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_API_KEY=<master-key>

# Embedding Model
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_API_KEY=<openai-key>

# Logging
LOG_LEVEL=info
LOG_PATH=/home/meshcoord/mesh-server/logs

# Security
CORS_ORIGIN=https://claude.ai,https://chat.openai.com
SESSION_TIMEOUT=3600000
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
```

---

## 📊 Monitoring & Operations

### Metrics and Observability

The coordination server exposes Prometheus-compatible metrics:

```typescript
// Example metrics implementation
import promClient from 'prom-client';

const register = new promClient.Registry();

// Custom metrics
const messageCounter = new promClient.Counter({
  name: 'mesh_messages_total',
  help: 'Total number of messages processed',
  labelNames: ['type', 'status'],
  registers: [register]
});

const activeConnections = new promClient.Gauge({
  name: 'mesh_active_connections',
  help: 'Number of active WebSocket connections',
  registers: [register]
});

const messageLatency = new promClient.Histogram({
  name: 'mesh_message_latency_seconds',
  help: 'Message processing latency',
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 5, 10],
  registers: [register]
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Logging Best Practices

Use structured logging with correlation IDs:

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mesh-coordination' },
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760,
      maxFiles: 10
    })
  ]
});

// Add console in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Log with correlation ID
function logWithCorrelation(correlationId: string, level: string, message: string, meta?: any) {
  logger.log(level, message, {
    correlationId,
    timestamp: new Date().toISOString(),
    ...meta
  });
}
```

### Health Checks

Comprehensive health check endpoint:

```typescript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: false,
      vectorDB: false,
      searchEngine: false,
      memory: false
    }
  };
  
  try {
    // Check database
    await db.get('SELECT 1');
    health.checks.database = true;
  } catch (err) {
    health.status = 'unhealthy';
  }
  
  try {
    // Check vector DB
    const response = await fetch('http://localhost:6333/');
    health.checks.vectorDB = response.ok;
  } catch (err) {
    health.status = 'unhealthy';
  }
  
  try {
    // Check search engine
    const response = await fetch('http://localhost:7700/health');
    health.checks.searchEngine = response.ok;
  } catch (err) {
    health.status = 'unhealthy';
  }
  
  // Check memory usage
  const memUsage = process.memoryUsage();
  health.checks.memory = memUsage.heapUsed < memUsage.heapTotal * 0.9;
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

### Backup Strategy

Automated backup script:

```bash
#!/bin/bash
# backup-mesh.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mesh/$DATE"

mkdir -p "$BACKUP_DIR"

# Backup SQLite database
cp /home/meshcoord/mesh-server/data/mesh.db "$BACKUP_DIR/mesh.db"

# Backup configuration
cp /home/meshcoord/mesh-server/config.toml "$BACKUP_DIR/config.toml"

# Backup vector database
tar -czf "$BACKUP_DIR/qdrant.tar.gz" /home/meshcoord/qdrant_storage/

# Backup search index
tar -czf "$BACKUP_DIR/meili.tar.gz" /home/meshcoord/meili_data/

# Compress entire backup
cd /backups/mesh
tar -czf "mesh_backup_$DATE.tar.gz" "$DATE"
rm -rf "$DATE"

# Keep only last 30 days
find /backups/mesh -name "mesh_backup_*.tar.gz" -mtime +30 -delete

echo "Backup completed: mesh_backup_$DATE.tar.gz"
```

Add to crontab:

```bash
# Run daily at 2 AM
0 2 * * * /home/meshcoord/backup-mesh.sh
```

---

## 🧪 Testing Strategy

### Unit Tests

Test individual components in isolation:

```typescript
// Example: Message validation tests
import { validateMessage } from '../src/validation';

describe('Message Validation', () => {
  test('should accept valid REGISTER message', () => {
    const message = {
      messageId: '123e4567-e89b-12d3-a456-426614174000',
      version: '1.0',
      type: 'REGISTER',
      source: {
        clientId: 'test-client',
        sessionId: '123e4567-e89b-12d3-a456-426614174001'
      },
      timestamp: Date.now(),
      priority: 10,
      payload: {
        clientId: 'test-client',
        authToken: 'test-token',
        clientType: 'web',
        capabilities: {}
      }
    };
    
    expect(validateMessage(message)).toBe(true);
  });
  
  test('should reject message with missing required fields', () => {
    const message = {
      messageId: '123e4567-e89b-12d3-a456-426614174000',
      type: 'REGISTER',
      payload: {}
    };
    
    expect(validateMessage(message)).toBe(false);
  });
});
```

### Integration Tests

Test components working together:

```typescript
// Example: Message routing integration test
describe('Message Routing', () => {
  let server: CoordinationServer;
  let client1: WebSocket;
  let client2: WebSocket;
  
  beforeAll(async () => {
    server = new CoordinationServer();
    await server.start();
  });
  
  afterAll(async () => {
    await server.stop();
  });
  
  test('should route message from client1 to client2', async () => {
    // Connect clients
    client1 = new WebSocket('ws://localhost:3001');
    client2 = new WebSocket('ws://localhost:3001');
    
    await Promise.all([
      waitForConnection(client1),
      waitForConnection(client2)
    ]);
    
    // Register clients
    await registerClient(client1, 'client-1', 'token-1');
    await registerClient(client2, 'client-2', 'token-2');
    
    // Set up message listener on client2
    const messagePromise = new Promise((resolve) => {
      client2.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'MESSAGE') {
          resolve(message);
        }
      });
    });
    
    // Send message from client1 to client2
    client1.send(JSON.stringify({
      messageId: generateUUID(),
      version: '1.0',
      type: 'MESSAGE',
      source: {
        clientId: 'client-1',
        sessionId: 'session-1'
      },
      target: {
        clientId: 'client-2'
      },
      timestamp: Date.now(),
      priority: 5,
      payload: {
        content: 'Hello from client1'
      }
    }));
    
    // Verify client2 receives message
    const receivedMessage = await messagePromise;
    expect(receivedMessage.payload.content).toBe('Hello from client1');
  });
});
```

### End-to-End Tests

Test complete workflows:

```typescript
// Example: Complete conversation flow test
describe('Complete Conversation Flow', () => {
  test('should maintain context across provider switch', async () => {
    // 1. Start conversation with Claude
    const claudeResponse = await sendToProvider('anthropic', {
      messages: [{ role: 'user', content: 'Remember: my favorite color is blue' }]
    });
    
    expect(claudeResponse).toContain('blue');
    
    // 2. Store in memory system
    await memoryEngine.ingest({
      threadId: 'test-thread',
      content: claudeResponse,
      provider: 'anthropic'
    });
    
    // 3. Continue conversation with ChatGPT
    const context = await memoryEngine.recall('test-thread');
    
    const gptResponse = await sendToProvider('openai', {
      messages: [
        ...context.messages,
        { role: 'user', content: 'What is my favorite color?' }
      ]
    });
    
    // Should recall from context
    expect(gptResponse.toLowerCase()).toContain('blue');
  });
});
```

### Load Testing

Simulate high concurrent load:

```typescript
// load-test.ts
import WebSocket from 'ws';

async function loadTest() {
  const NUM_CLIENTS = 100;
  const MESSAGES_PER_CLIENT = 10;
  
  const clients: WebSocket[] = [];
  
  // Connect all clients
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const ws = new WebSocket('ws://localhost:3001');
    await waitForConnection(ws);
    await registerClient(ws, `client-${i}`, `token-${i}`);
    clients.push(ws);
  }
  
  console.log(`${NUM_CLIENTS} clients connected`);
  
  // Send messages concurrently
  const startTime = Date.now();
  
  await Promise.all(
    clients.map(async (client, i) => {
      for (let j = 0; j < MESSAGES_PER_CLIENT; j++) {
        await sendMessage(client, {
          content: `Message ${j} from client ${i}`
        });
      }
    })
  );
  
  const endTime = Date.now();
  const totalMessages = NUM_CLIENTS * MESSAGES_PER_CLIENT;
  const duration = (endTime - startTime) / 1000;
  const throughput = totalMessages / duration;
  
  console.log(`Sent ${totalMessages} messages in ${duration}s`);
  console.log(`Throughput: ${throughput.toFixed(2)} messages/second`);
  
  // Cleanup
  clients.forEach(ws => ws.close());
}

loadTest().catch(console.error);
```

---

## 🎯 Summary and Next Steps

This comprehensive specification provides everything needed to build a production-grade distributed AI coordination mesh with unlimited memory, multi-provider integration, and cross-platform client support.

### Key Features Implemented

✅ Coordination server with WebSocket and HTTP APIs  
✅ Unlimited memory storage with semantic search (20GB+)  
✅ Multi-provider support (OpenAI, Anthropic, Google, xAI, Ollama)  
✅ Multiple accounts per provider with automatic failover  
✅ Browser extension for Claude web integration  
✅ Desktop IPC bridge for native apps  
✅ Session continuity across providers  
✅ Cloudflare CDN + Tor hidden service deployment  
✅ Comprehensive security and authentication  
✅ Production monitoring and operations  

### Implementation Priority

**Phase 1-3** (Weeks 1-3): Core server, auth, routing - Foundation  
**Phase 4-5** (Weeks 4-5): Memory system - Critical differentiator  
**Phase 6-7** (Weeks 6-8): Provider integration - Multi-AI capability  
**Phase 8-9** (Weeks 9-10): Client integration - User-facing functionality  
**Phase 10-12** (Weeks 11-14): Deployment, monitoring, testing - Production readiness  

### Getting Started

1. Review complete specification document
2. Set up development environment
3. Begin Phase 1 implementation
4. Reference provider API documentation as needed
5. Test each phase thoroughly before proceeding
6. Deploy incrementally to production

This system will enable true distributed consciousness coordination across multiple AI providers with unlimited persistent memory and seamless cross-platform integration!

---

**End of Specification Document**