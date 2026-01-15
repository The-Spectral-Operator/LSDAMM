/**
 * LSDAMM - xAI Grok Service
 * Integration with xAI (Grok) API
 */

import { getConfig } from '../util/config_parser.js';
import { logger } from '../util/logging.js';

export interface MessageRequest {
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface MessageResponse {
  messageId: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  metadata?: Record<string, unknown>;
}

export interface StreamChunk {
  type: 'content' | 'metadata' | 'error';
  content?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

const XAI_API_BASE = 'https://api.x.ai/v1';

/**
 * Check if xAI provider is enabled
 */
export function isEnabled(): boolean {
  const config = getConfig();
  return config.providers.xai.enabled && !!config.providers.xai.api_key;
}

/**
 * Get available models
 */
export function getModels(): string[] {
  return [
    'grok-4-1-fast-reasoning',
    'grok-4-1-fast-non-reasoning',
    'grok-code-fast-1',
    'grok-3-beta',
    'grok-3-mini',
    'grok-2-image-1212',
  ];
}

/**
 * Send a message using xAI Chat Completions API
 */
export async function sendMessage(request: MessageRequest): Promise<MessageResponse> {
  const config = getConfig();
  const apiKey = config.providers.xai.api_key;
  const model = request.model ?? config.providers.xai.default_model;

  const startTime = Date.now();

  try {
    const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`xAI API error: ${error}`);
    }

    const data = await response.json() as {
      id: string;
      choices: Array<{
        message: { content: string };
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model: string;
    };

    const latency = Date.now() - startTime;

    logger.debug('xAI request completed', {
      model,
      latency,
      tokens: data.usage.total_tokens
    });

    return {
      messageId: data.id,
      content: data.choices[0].message.content,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      finishReason: data.choices[0].finish_reason,
      metadata: {
        provider: 'xai',
        latencyMs: latency,
      }
    };
  } catch (error) {
    logger.error('xAI request failed', { error, model });
    throw error;
  }
}

/**
 * Stream a message using xAI Chat Completions API
 */
export async function* streamMessage(request: MessageRequest): AsyncGenerator<StreamChunk> {
  const config = getConfig();
  const apiKey = config.providers.xai.api_key;
  const model = request.model ?? config.providers.xai.default_model;

  try {
    const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`xAI API error: ${response.statusText}`);
    }

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
        if (!line.trim() || !line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6);
        if (jsonStr === '[DONE]') {
          yield {
            type: 'metadata',
            metadata: { finishReason: 'stop', model }
          };
          continue;
        }

        try {
          const data = JSON.parse(jsonStr) as {
            choices: Array<{
              delta?: { content?: string };
              finish_reason?: string;
            }>;
            model?: string;
          };

          const content = data.choices[0]?.delta?.content;
          if (content) {
            yield {
              type: 'content',
              content
            };
          }

          if (data.choices[0]?.finish_reason) {
            yield {
              type: 'metadata',
              metadata: {
                finishReason: data.choices[0].finish_reason,
                model: data.model
              }
            };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } catch (error) {
    logger.error('xAI streaming failed', { error, model });
    yield {
      type: 'error',
      error: (error as Error).message
    };
  }
}

/**
 * Generate embeddings using xAI
 */
export async function generateEmbedding(
  text: string,
  model: string = 'grok-embedding-1'
): Promise<number[]> {
  const config = getConfig();
  const apiKey = config.providers.xai.api_key;

  try {
    const response = await fetch(`${XAI_API_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI embedding error: ${response.statusText}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data[0].embedding;
  } catch (error) {
    logger.error('xAI embedding generation failed', { error, model });
    throw error;
  }
}
