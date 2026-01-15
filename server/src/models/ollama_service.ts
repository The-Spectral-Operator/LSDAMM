/**
 * LSDAMM - Ollama Service
 * Integration with Ollama local and cloud APIs
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

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
}

/**
 * Check if Ollama local is enabled
 */
export function isLocalEnabled(): boolean {
  const config = getConfig();
  return config.providers.ollama_local.enabled;
}

/**
 * Check if Ollama cloud is enabled
 */
export function isCloudEnabled(): boolean {
  const config = getConfig();
  return config.providers.ollama_cloud.enabled && !!config.providers.ollama_cloud.api_key;
}

/**
 * Get available local models
 */
export async function getLocalModels(): Promise<OllamaModel[]> {
  const config = getConfig();
  const baseUrl = config.providers.ollama_local.base_url;

  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    
    if (!response.ok) {
      throw new Error(`Ollama local API error: ${response.statusText}`);
    }

    const data = await response.json() as { models: Array<{
      name: string;
      size: number;
      digest: string;
      modified_at: string;
    }> };

    return data.models.map(m => ({
      name: m.name,
      size: m.size,
      digest: m.digest,
      modifiedAt: m.modified_at,
    }));
  } catch (error) {
    logger.warn('Failed to fetch Ollama local models', { error });
    return [];
  }
}

/**
 * Check Ollama local health
 */
export async function checkLocalHealth(): Promise<boolean> {
  const config = getConfig();
  const baseUrl = config.providers.ollama_local.base_url;

  try {
    const response = await fetch(`${baseUrl}/api/version`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Send a message to Ollama local
 */
export async function sendLocalMessage(request: MessageRequest): Promise<MessageResponse> {
  const config = getConfig();
  const baseUrl = config.providers.ollama_local.base_url;
  const model = request.model ?? config.providers.ollama_local.default_model;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? -1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama local error: ${response.statusText}`);
    }

    const data = await response.json() as {
      message: { content: string };
      model: string;
      done: boolean;
      prompt_eval_count?: number;
      eval_count?: number;
      total_duration?: number;
      load_duration?: number;
      eval_duration?: number;
    };

    const latency = Date.now() - startTime;

    return {
      messageId: crypto.randomUUID(),
      content: data.message.content,
      model: data.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: data.done ? 'stop' : 'length',
      metadata: {
        provider: 'ollama-local',
        latencyMs: latency,
        totalDuration: data.total_duration,
        loadDuration: data.load_duration,
        evalDuration: data.eval_duration,
      }
    };
  } catch (error) {
    logger.error('Ollama local request failed', { error, model });
    throw error;
  }
}

/**
 * Stream a message from Ollama local
 */
export async function* streamLocalMessage(request: MessageRequest): AsyncGenerator<StreamChunk> {
  const config = getConfig();
  const baseUrl = config.providers.ollama_local.base_url;
  const model = request.model ?? config.providers.ollama_local.default_model;

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: request.messages,
        stream: true,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? -1,
        },
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama local error: ${response.statusText}`);
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
        if (!line.trim()) continue;

        const data = JSON.parse(line) as {
          message?: { content: string };
          done: boolean;
          total_duration?: number;
          prompt_eval_count?: number;
          eval_count?: number;
        };

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
              finishReason: 'stop',
              totalDuration: data.total_duration,
              promptEvalCount: data.prompt_eval_count,
              evalCount: data.eval_count,
            }
          };
        }
      }
    }
  } catch (error) {
    logger.error('Ollama local streaming failed', { error, model });
    yield {
      type: 'error',
      error: (error as Error).message
    };
  }
}

/**
 * Send a message to Ollama Cloud
 */
export async function sendCloudMessage(request: MessageRequest): Promise<MessageResponse> {
  const config = getConfig();
  const baseUrl = config.providers.ollama_cloud.base_url;
  const apiKey = config.providers.ollama_cloud.api_key;
  const model = request.model ?? config.providers.ollama_cloud.default_model;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? -1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama cloud error: ${response.statusText}`);
    }

    const data = await response.json() as {
      message: { content: string };
      model: string;
      done: boolean;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const latency = Date.now() - startTime;

    return {
      messageId: crypto.randomUUID(),
      content: data.message.content,
      model: data.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: data.done ? 'stop' : 'length',
      metadata: {
        provider: 'ollama-cloud',
        latencyMs: latency,
      }
    };
  } catch (error) {
    logger.error('Ollama cloud request failed', { error, model });
    throw error;
  }
}

/**
 * Unified send message (chooses local or cloud)
 */
export async function sendMessage(
  request: MessageRequest,
  preferLocal: boolean = true
): Promise<MessageResponse> {
  // If preferring local and local is available
  if (preferLocal && isLocalEnabled()) {
    try {
      const isHealthy = await checkLocalHealth();
      if (isHealthy) {
        return await sendLocalMessage(request);
      }
    } catch {
      logger.debug('Ollama local unavailable, falling back to cloud');
    }
  }

  // Try cloud
  if (isCloudEnabled()) {
    return await sendCloudMessage(request);
  }

  // Fallback to local if enabled
  if (isLocalEnabled()) {
    return await sendLocalMessage(request);
  }

  throw new Error('No Ollama provider available');
}
