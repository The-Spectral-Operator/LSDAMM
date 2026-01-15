# LSDAMM API Documentation

## Overview

The LSDAMM Coordination Server provides a REST API and WebSocket interface for multi-provider AI interactions.

## Base URL

```
Production: https://mesh.lackadaisical-security.com
Development: http://localhost:3001
```

## Authentication

### JWT Authentication

Include the JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### API Key Authentication

Include the API key directly in the Authorization header:

```
Authorization: lsk_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Endpoints

### Health Check

#### GET /api/health

Check server health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "checks": {
    "database": true,
    "memory": true,
    "providers": {
      "openai": true,
      "anthropic": true,
      "google": false,
      "xai": false,
      "ollama_local": true,
      "ollama_cloud": false
    }
  }
}
```

---

### User Management

#### POST /api/users/register

Register a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "displayName": "John Doe"
}
```

**Response:**
```json
{
  "user": {
    "user_id": "uuid",
    "email": "user@example.com",
    "display_name": "John Doe",
    "role": "user",
    "is_active": true,
    "email_verified": false,
    "created_at": 1705315200000
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400
  }
}
```

#### POST /api/users/login

Authenticate user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

#### POST /api/users/refresh

Refresh access token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### GET /api/users/me

Get current user info. Requires authentication.

---

### API Keys

#### GET /api/keys

List all API keys for the current user.

**Response:**
```json
{
  "keys": [
    {
      "keyId": "uuid",
      "name": "Production Key",
      "prefix": "lsk_live_",
      "scopes": ["read", "write"],
      "isActive": true,
      "createdAt": 1705315200000,
      "lastUsedAt": 1705318800000,
      "usageCount": 42
    }
  ]
}
```

#### POST /api/keys

Create a new API key.

**Request:**
```json
{
  "name": "Production Key",
  "description": "Key for production environment",
  "scopes": ["read", "write"],
  "expiresIn": 2592000
}
```

**Response:**
```json
{
  "key": {
    "keyId": "uuid",
    "name": "Production Key",
    "prefix": "lsk_live_",
    "scopes": ["read", "write"]
  },
  "secretKey": "lsk_live_xxxxxxxxxxxxxxxxxxxxxxxx",
  "warning": "Store this key securely. It will not be shown again."
}
```

#### DELETE /api/keys/:keyId

Revoke an API key.

---

### AI Completions

#### POST /api/completions

Send a message to AI.

**Request:**
```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello, world!"}
  ],
  "provider": "anthropic",
  "model": "claude-opus-4-5-20251101",
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": false
}
```

**Response:**
```json
{
  "messageId": "msg_xxx",
  "content": "Hello! How can I assist you today?",
  "model": "claude-opus-4-5-20251101",
  "provider": "anthropic",
  "usage": {
    "promptTokens": 25,
    "completionTokens": 12,
    "totalTokens": 37
  },
  "finishReason": "end_turn",
  "latencyMs": 1234
}
```

**Streaming Response (stream: true):**

Sets `Content-Type: text/event-stream` and returns Server-Sent Events:

```
data: {"type":"content","content":"Hello"}

data: {"type":"content","content":"! How"}

data: {"type":"content","content":" can I help?"}

data: {"type":"metadata","metadata":{"finishReason":"end_turn"}}

data: [DONE]
```

#### GET /api/models

List available AI models.

**Response:**
```json
{
  "providers": ["openai", "anthropic", "ollama"],
  "models": {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    "anthropic": ["claude-opus-4-5-20251101", "claude-sonnet-4-5-20251101"],
    "ollama": ["llama3.1", "mistral"]
  }
}
```

---

### Mesh Management

#### GET /api/mesh/clients

List registered mesh clients.

#### POST /api/mesh/clients

Register a new mesh client.

**Request:**
```json
{
  "clientId": "my-client",
  "clientName": "My Application",
  "clientType": "desktop",
  "capabilities": {
    "supportsStreaming": true
  }
}
```

#### GET /api/mesh/status

Get mesh server status.

**Response:**
```json
{
  "status": "online",
  "connectedClients": 5,
  "authenticatedClients": 4,
  "uptime": 3600,
  "memoryUsage": {
    "rss": 67108864,
    "heapTotal": 33554432,
    "heapUsed": 16777216
  }
}
```

---

## WebSocket Protocol

### Connection

Connect to: `wss://mesh.example.com/ws`

### Message Format

```json
{
  "messageId": "uuid",
  "version": "1.0",
  "type": "MESSAGE_TYPE",
  "source": {
    "clientId": "my-client",
    "sessionId": "session-uuid"
  },
  "target": {
    "clientId": "target-client",
    "group": "channel-name",
    "all": false
  },
  "correlationId": "uuid",
  "inReplyTo": "uuid",
  "timestamp": 1705315200000,
  "priority": 5,
  "expiresAt": 1705401600000,
  "payload": {},
  "metadata": {}
}
```

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| REGISTER | Client → Server | Register client with server |
| REGISTER_ACK | Server → Client | Registration acknowledgment |
| WELCOME | Server → Client | Initial welcome message |
| HEARTBEAT | Client → Server | Keep-alive ping |
| HEARTBEAT_ACK | Server → Client | Keep-alive response |
| MESSAGE | Bidirectional | AI request/response |
| RESPONSE | Server → Client | Response to request |
| STREAM_CHUNK | Server → Client | Streaming content chunk |
| STREAM_END | Server → Client | End of stream |
| QUERY | Client → Server | Query server state |
| SUBSCRIBE | Client → Server | Subscribe to channel |
| SUBSCRIBE_ACK | Server → Client | Subscription confirmed |
| BROADCAST | Server → Client | Broadcast message |
| ERROR | Server → Client | Error response |

### Registration Flow

1. Connect to WebSocket
2. Receive WELCOME message with sessionId
3. Send REGISTER with clientId and authToken
4. Receive REGISTER_ACK with success status
5. Start heartbeat every 30 seconds

---

## Error Codes

| Code | Description |
|------|-------------|
| AUTHENTICATION_REQUIRED | Must authenticate first |
| AUTHENTICATION_FAILED | Invalid credentials |
| INVALID_MESSAGE | Message validation failed |
| RATE_LIMIT_EXCEEDED | Too many requests |
| PROVIDER_ERROR | AI provider error |
| TARGET_NOT_FOUND | Target client not connected |
| INTERNAL_ERROR | Server error |

---

## File Attachments & Vision

### POST /api/attachments/upload

Upload a file attachment for use in conversations.

**Authentication:** Required (JWT or API key)

**Request:**
```json
{
  "filename": "document.pdf",
  "data": "<base64-encoded-file-data>",
  "encoding": "base64"
}
```

**Response:**
```json
{
  "fileId": "uuid",
  "filename": "document.pdf",
  "mimeType": "application/pdf",
  "size": 102400,
  "isImage": false,
  "uploadedAt": 1705315200000
}
```

**Allowed file types:**
- Documents: `.txt`, `.md`, `.json`, `.yaml`, `.xml`, `.csv`, `.pdf`, `.doc`, `.docx`
- Code: `.js`, `.ts`, `.py`, `.java`, `.c`, `.cpp`, `.h`, `.go`, `.rs`
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`

**Limits:**
- Maximum file size: 10MB (configurable via `MAX_UPLOAD_SIZE` env var)
- Rate limit: 100 uploads per minute per user

### GET /api/attachments/:fileId

Download or retrieve a previously uploaded attachment.

**Authentication:** Required

**Query Parameters:**
- `inline` (optional): Set to `true` to display images inline

**Response:** Binary file data with appropriate Content-Type header

### DELETE /api/attachments/:fileId

Delete an attachment.

**Authentication:** Required

**Response:**
```json
{
  "message": "File deleted",
  "fileId": "uuid"
}
```

### POST /api/vision/analyze

Analyze an image using AI vision capabilities (Claude, GPT-4 Vision, Gemini).

**Authentication:** Required

**Request:**
```json
{
  "imageUrl": "https://example.com/image.jpg",
  "prompt": "What objects are visible in this image?",
  "provider": "anthropic",
  "model": "claude-opus-4-5-20251101"
}
```

Or with base64-encoded image:
```json
{
  "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "prompt": "Describe this image in detail",
  "provider": "anthropic"
}
```

**Response:**
```json
{
  "analysis": "The image shows...",
  "provider": "anthropic",
  "model": "claude-opus-4-5-20251101",
  "tokensUsed": 450
}
```

**Supported providers:**
- `anthropic`: Claude Opus/Sonnet (best for detailed analysis)
- `openai`: GPT-4 Vision
- `google`: Gemini Pro Vision

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 100 req/min |
| Auth endpoints | 5 req/min |
| WebSocket messages | 100 msg/min |

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Seconds until reset
