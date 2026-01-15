/**
 * LSDAMM - OpenAI Service
 * Integration with OpenAI Chat Completions and Responses API
 */

import OpenAI from 'openai';
import { getConfig } from '../util/config_parser.js';
import { logger } from '../util/logging.js';

export interface MessageRequest {
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
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

let openaiClient: OpenAI | null = null;

/**
 * Get or create OpenAI client
 */
function getClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const config = getConfig();
  const providerConfig = config.providers.openai;

  if (!providerConfig.api_key) {
    throw new Error('OpenAI API key not configured');
  }

  openaiClient = new OpenAI({
    apiKey: providerConfig.api_key,
    organization: providerConfig.organization_id || undefined,
  });

  return openaiClient;
}

/**
 * Check if OpenAI provider is enabled
 */
export function isEnabled(): boolean {
  const config = getConfig();
  return config.providers.openai.enabled && !!config.providers.openai.api_key;
}

/**
 * Get available models
 */
export async function getModels(): Promise<string[]> {
  if (!isEnabled()) {
    return [];
  }

  try {
    const client = getClient();
    const response = await client.models.list();
    
    // Filter to chat models
    return response.data
      .filter(m => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3'))
      .map(m => m.id);
  } catch (error) {
    logger.error('Failed to fetch OpenAI models', { error });
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }
}

/**
 * Send a message using Chat Completions API
 */
export async function sendMessage(request: MessageRequest): Promise<MessageResponse> {
  const client = getClient();
  const config = getConfig();
  const model = request.model ?? config.providers.openai.default_model;

  const startTime = Date.now();

  try {
    const messages = [...request.messages];
    
    // Add system prompt if provided
    if (request.systemPrompt && !messages.some(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: request.systemPrompt });
    }

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: false,
    });

    const latency = Date.now() - startTime;
    const choice = response.choices[0];

    logger.debug('OpenAI request completed', {
      model,
      latency,
      tokens: response.usage?.total_tokens
    });

    return {
      messageId: response.id,
      content: choice.message.content ?? '',
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: choice.finish_reason ?? 'stop',
      metadata: {
        provider: 'openai',
        latencyMs: latency,
      }
    };
  } catch (error) {
    logger.error('OpenAI request failed', { error, model });
    throw error;
  }
}

/**
 * Stream a message using Chat Completions API
 */
export async function* streamMessage(request: MessageRequest): AsyncGenerator<StreamChunk> {
  const client = getClient();
  const config = getConfig();
  const model = request.model ?? config.providers.openai.default_model;

  const messages = [...request.messages];
  
  if (request.systemPrompt && !messages.some(m => m.role === 'system')) {
    messages.unshift({ role: 'system', content: request.systemPrompt });
  }

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        yield {
          type: 'content',
          content: delta.content
        };
      }

      if (chunk.choices[0]?.finish_reason) {
        yield {
          type: 'metadata',
          metadata: {
            finishReason: chunk.choices[0].finish_reason,
            model: chunk.model,
          }
        };
      }
    }
  } catch (error) {
    logger.error('OpenAI streaming failed', { error, model });
    yield {
      type: 'error',
      error: (error as Error).message
    };
  }
}

/**
 * Send a message using the new Responses API (stateful)
 * Note: This uses the newer responses endpoint for agentic workflows
 */
export async function sendResponsesMessage(
  input: string,
  options?: {
    previousResponseId?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<MessageResponse> {
  const client = getClient();
  const config = getConfig();
  const model = options?.model ?? config.providers.openai.default_model;

  const startTime = Date.now();

  try {
    // Use the responses API for stateful conversations
    // Note: The Responses API may require the beta client
    const response = await (client as unknown as {
      responses: {
        create: (params: unknown) => Promise<{
          id: string;
          output_text?: string;
          output?: Array<{ text?: string }>;
          model: string;
          usage?: { input_tokens?: number; output_tokens?: number };
          status?: string;
        }>;
      };
    }).responses.create({
      model,
      input,
      previous_response_id: options?.previousResponseId,
      temperature: options?.temperature ?? 0.7,
      max_output_tokens: options?.maxTokens,
    });

    const latency = Date.now() - startTime;

    return {
      messageId: response.id,
      content: response.output_text ?? response.output?.[0]?.text ?? '',
      model: response.model,
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      },
      finishReason: response.status ?? 'completed',
      metadata: {
        provider: 'openai-responses',
        latencyMs: latency,
        responseId: response.id, // Can be used for follow-up messages
      }
    };
  } catch (error) {
    // Fall back to chat completions if responses API not available
    logger.warn('Responses API failed, falling back to chat completions', { error });
    return sendMessage({
      messages: [{ role: 'user', content: input }],
      model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
  }
}

/**
 * Generate embeddings
 */
export async function generateEmbedding(
  text: string,
  model: string = 'text-embedding-3-large'
): Promise<number[]> {
  const client = getClient();

  try {
    const response = await client.embeddings.create({
      model,
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    logger.error('OpenAI embedding generation failed', { error, model });
    throw error;
  }
}

/**
 * Get rate limit status (from response headers)
 */
export interface RateLimitStatus {
  requestsRemaining: number;
  requestsLimit: number;
  tokensRemaining: number;
  tokensLimit: number;
  resetAt: Date;
}

// Rate limit tracking (updated from response headers)
const lastRateLimitStatus: RateLimitStatus | null = null;

export function getRateLimitStatus(): RateLimitStatus | null {
  return lastRateLimitStatus;
}
