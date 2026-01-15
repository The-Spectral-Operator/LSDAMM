/**
 * LSDAMM - Anthropic Claude Service
 * Integration with Anthropic Messages API
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../util/config_parser.js';
import { logger } from '../util/logging.js';

export interface MessageRequest {
  model?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  systemPrompt?: string;
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

let anthropicClient: Anthropic | null = null;

/**
 * Get or create Anthropic client
 */
function getClient(): Anthropic {
  if (anthropicClient) {
    return anthropicClient;
  }

  const config = getConfig();
  const providerConfig = config.providers.anthropic;

  if (!providerConfig.api_key) {
    throw new Error('Anthropic API key not configured');
  }

  anthropicClient = new Anthropic({
    apiKey: providerConfig.api_key,
  });

  return anthropicClient;
}

/**
 * Check if Anthropic provider is enabled
 */
export function isEnabled(): boolean {
  const config = getConfig();
  return config.providers.anthropic.enabled && !!config.providers.anthropic.api_key;
}

/**
 * Get available models
 */
export function getModels(): string[] {
  return [
    'claude-opus-4-5-20251101',
    'claude-sonnet-4-5-20251101',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];
}

/**
 * Send a message using Messages API
 */
export async function sendMessage(request: MessageRequest): Promise<MessageResponse> {
  const client = getClient();
  const config = getConfig();
  const model = request.model ?? config.providers.anthropic.default_model;

  const startTime = Date.now();

  try {
    const response = await client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 1.0,
      system: request.systemPrompt,
      messages: request.messages,
    });

    const latency = Date.now() - startTime;

    // Extract text content
    const textContent = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    logger.debug('Anthropic request completed', {
      model,
      latency,
      tokens: response.usage.input_tokens + response.usage.output_tokens
    });

    return {
      messageId: response.id,
      content: textContent,
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason ?? 'end_turn',
      metadata: {
        provider: 'anthropic',
        latencyMs: latency,
      }
    };
  } catch (error) {
    logger.error('Anthropic request failed', { error, model });
    throw error;
  }
}

/**
 * Stream a message using Messages API
 */
export async function* streamMessage(request: MessageRequest): AsyncGenerator<StreamChunk> {
  const client = getClient();
  const config = getConfig();
  const model = request.model ?? config.providers.anthropic.default_model;

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 1.0,
      system: request.systemPrompt,
      messages: request.messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if ('text' in delta) {
          yield {
            type: 'content',
            content: delta.text
          };
        }
      } else if (event.type === 'message_stop') {
        yield {
          type: 'metadata',
          metadata: {
            finishReason: 'end_turn',
            model
          }
        };
      }
    }

    // Get final message for usage stats
    const finalMessage = await stream.finalMessage();
    yield {
      type: 'metadata',
      metadata: {
        usage: {
          promptTokens: finalMessage.usage.input_tokens,
          completionTokens: finalMessage.usage.output_tokens,
          totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
        }
      }
    };
  } catch (error) {
    logger.error('Anthropic streaming failed', { error, model });
    yield {
      type: 'error',
      error: (error as Error).message
    };
  }
}

/**
 * Count tokens for a message (estimate)
 * Claude uses roughly 4 characters per token
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get rate limit status
 */
export interface RateLimitStatus {
  requestsRemaining: number;
  requestsLimit: number;
  tokensRemaining: number;
  tokensLimit: number;
  resetAt: Date;
}

let lastRateLimitStatus: RateLimitStatus | null = null;

export function getRateLimitStatus(): RateLimitStatus | null {
  return lastRateLimitStatus;
}
