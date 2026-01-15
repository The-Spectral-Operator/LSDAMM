/**
 * LSDAMM - Anthropic Claude Service
 * Integration with Anthropic Messages API
 * Supports extended thinking, vision, and attachments
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../util/config_parser.js';
import { logger } from '../util/logging.js';

export interface MessageRequest {
  model?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  systemPrompt?: string;
  extendedThinking?: boolean;
  budgetTokens?: number;
  vision?: boolean;
  images?: Array<{ mediaType: string; data: string }>;
}

export interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface MessageResponse {
  messageId: string;
  content: string;
  thinking?: string;
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
  type: 'content' | 'thinking' | 'metadata' | 'error';
  content?: string;
  thinking?: string;
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
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];
}

/**
 * Get models that support extended thinking
 */
export function getExtendedThinkingModels(): string[] {
  return [
    'claude-opus-4-5-20251101',
    'claude-sonnet-4-5-20251101',
    'claude-sonnet-4-20250514',
  ];
}

/**
 * Get models that support vision
 */
export function getVisionModels(): string[] {
  return getModels(); // All Claude 3+ models support vision
}

/**
 * Prepare messages with vision content
 */
function prepareMessages(
  request: MessageRequest
): Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }> {
  if (!request.vision || !request.images || request.images.length === 0) {
    return request.messages;
  }

  // Convert the last user message to include images
  const messages = [...request.messages];
  const lastMessage = messages[messages.length - 1];
  
  if (lastMessage && lastMessage.role === 'user') {
    const content: ContentBlock[] = [];
    
    // Add images first
    for (const image of request.images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mediaType,
          data: image.data,
        },
      });
    }
    
    // Add text content
    const textContent = typeof lastMessage.content === 'string' 
      ? lastMessage.content 
      : lastMessage.content.find(b => b.type === 'text')?.text || '';
    
    if (textContent) {
      content.push({
        type: 'text',
        text: textContent,
      });
    }
    
    messages[messages.length - 1] = {
      role: 'user',
      content,
    };
  }
  
  return messages;
}

/**
 * Send a message using Messages API with optional extended thinking
 */
export async function sendMessage(request: MessageRequest): Promise<MessageResponse> {
  const client = getClient();
  const config = getConfig();
  const model = request.model ?? config.providers.anthropic.default_model;

  const startTime = Date.now();
  const supportsThinking = getExtendedThinkingModels().includes(model);
  const useExtendedThinking = request.extendedThinking && supportsThinking;

  try {
    // Prepare request parameters
    // Use 8192 as max for extended thinking (safe for all models)
    const requestParams: Anthropic.MessageCreateParams = {
      model,
      max_tokens: request.maxTokens ?? (useExtendedThinking ? 8192 : 4096),
      messages: prepareMessages(request) as Anthropic.MessageParam[],
    };

    // Add system prompt if provided
    if (request.systemPrompt) {
      requestParams.system = request.systemPrompt;
    }

    // Add temperature (not allowed with extended thinking)
    if (!useExtendedThinking) {
      requestParams.temperature = request.temperature ?? 1.0;
    }

    // Add extended thinking configuration
    // Budget tokens should be between 1024 and model's max output tokens
    // Using 8000 as a safe default that works with most models
    if (useExtendedThinking) {
      const budgetTokens = Math.min(request.budgetTokens ?? 8000, 8000);
      (requestParams as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: budgetTokens,
      };
    }

    const response = await client.messages.create(requestParams);

    const latency = Date.now() - startTime;

    // Extract text and thinking content
    let textContent = '';
    let thinkingContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'thinking') {
        thinkingContent += (block as ThinkingBlock).thinking;
      }
    }

    logger.debug('Anthropic request completed', {
      model,
      latency,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      extendedThinking: useExtendedThinking,
    });

    return {
      messageId: response.id,
      content: textContent,
      thinking: thinkingContent || undefined,
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
        extendedThinking: useExtendedThinking,
        hasThinking: !!thinkingContent,
      },
    };
  } catch (error) {
    logger.error('Anthropic request failed', { error, model });
    throw error;
  }
}

/**
 * Stream a message using Messages API with optional extended thinking
 */
export async function* streamMessage(request: MessageRequest): AsyncGenerator<StreamChunk> {
  const client = getClient();
  const config = getConfig();
  const model = request.model ?? config.providers.anthropic.default_model;
  
  const supportsThinking = getExtendedThinkingModels().includes(model);
  const useExtendedThinking = request.extendedThinking && supportsThinking;

  try {
    // Prepare request parameters
    const requestParams: Anthropic.MessageStreamParams = {
      model,
      max_tokens: request.maxTokens ?? (useExtendedThinking ? 8192 : 4096),
      messages: prepareMessages(request) as Anthropic.MessageParam[],
    };

    // Add system prompt if provided
    if (request.systemPrompt) {
      requestParams.system = request.systemPrompt;
    }

    // Add temperature (not allowed with extended thinking)
    if (!useExtendedThinking) {
      requestParams.temperature = request.temperature ?? 1.0;
    }

    // Add extended thinking configuration
    // Budget tokens should be between 1024 and model's max output tokens
    // Using 8000 as a safe default that works with most models
    if (useExtendedThinking) {
      const budgetTokens = Math.min(request.budgetTokens ?? 8000, 8000);
      (requestParams as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: budgetTokens,
      };
    }

    const stream = client.messages.stream(requestParams);

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if ('text' in delta) {
          yield {
            type: 'content',
            content: delta.text
          };
        } else if ('thinking' in delta) {
          yield {
            type: 'thinking',
            thinking: (delta as { thinking: string }).thinking,
          };
        }
      } else if (event.type === 'message_stop') {
        yield {
          type: 'metadata',
          metadata: {
            finishReason: 'end_turn',
            model,
            extendedThinking: useExtendedThinking,
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

const lastRateLimitStatus: RateLimitStatus | null = null;

export function getRateLimitStatus(): RateLimitStatus | null {
  return lastRateLimitStatus;
}
