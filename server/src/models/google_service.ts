/**
 * LSDAMM - Google Gemini Service
 * Integration with Google AI (Gemini) API
 */

import { getConfig } from '../util/config_parser.js';
import { logger } from '../util/logging.js';

export interface MessageRequest {
  model?: string;
  messages: Array<{ role: 'user' | 'model'; content: string }>;
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

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Check if Google Gemini provider is enabled
 */
export function isEnabled(): boolean {
  const config = getConfig();
  return config.providers.google.enabled && !!config.providers.google.api_key;
}

/**
 * Get available models
 */
export function getModels(): string[] {
  return [
    'gemini-3-pro',
    'gemini-3-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ];
}

/**
 * Convert messages to Gemini format
 */
function convertMessages(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string
): { contents: Array<{ role: string; parts: Array<{ text: string }> }>; systemInstruction?: { parts: Array<{ text: string }> } } {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : m.role,
    parts: [{ text: m.content }]
  }));

  const result: { 
    contents: typeof contents; 
    systemInstruction?: { parts: Array<{ text: string }> } 
  } = { contents };

  if (systemPrompt) {
    result.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  return result;
}

/**
 * Send a message using Gemini API
 */
export async function sendMessage(request: MessageRequest): Promise<MessageResponse> {
  const config = getConfig();
  const apiKey = config.providers.google.api_key;
  const model = request.model ?? config.providers.google.default_model;

  const startTime = Date.now();

  try {
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      ...convertMessages(request.messages, request.systemPrompt),
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 4096,
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }

    const data = await response.json() as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
        finishReason: string;
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const latency = Date.now() - startTime;
    const candidate = data.candidates[0];

    logger.debug('Gemini request completed', {
      model,
      latency,
      tokens: data.usageMetadata?.totalTokenCount
    });

    return {
      messageId: crypto.randomUUID(),
      content: candidate.content.parts.map(p => p.text).join(''),
      model,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
      finishReason: candidate.finishReason ?? 'STOP',
      metadata: {
        provider: 'google',
        latencyMs: latency,
      }
    };
  } catch (error) {
    logger.error('Gemini request failed', { error, model });
    throw error;
  }
}

/**
 * Stream a message using Gemini API
 */
export async function* streamMessage(request: MessageRequest): AsyncGenerator<StreamChunk> {
  const config = getConfig();
  const apiKey = config.providers.google.api_key;
  const model = request.model ?? config.providers.google.default_model;

  try {
    const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const body = {
      ...convertMessages(request.messages, request.systemPrompt),
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 4096,
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Gemini API error: ${response.statusText}`);
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
            metadata: { finishReason: 'STOP', model }
          };
          continue;
        }

        try {
          const data = JSON.parse(jsonStr) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
              finishReason?: string;
            }>;
          };

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield {
              type: 'content',
              content: text
            };
          }

          if (data.candidates?.[0]?.finishReason) {
            yield {
              type: 'metadata',
              metadata: {
                finishReason: data.candidates[0].finishReason,
                model
              }
            };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } catch (error) {
    logger.error('Gemini streaming failed', { error, model });
    yield {
      type: 'error',
      error: (error as Error).message
    };
  }
}

/**
 * Use OpenAI-compatible endpoint (for easier migration)
 */
export async function sendOpenAICompatible(request: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
}): Promise<MessageResponse> {
  const config = getConfig();
  const apiKey = config.providers.google.api_key;

  const startTime = Date.now();

  try {
    const url = `${GEMINI_API_BASE}/openai/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Gemini OpenAI-compatible API error: ${response.statusText}`);
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
        provider: 'google-openai-compat',
        latencyMs: latency,
      }
    };
  } catch (error) {
    logger.error('Gemini OpenAI-compatible request failed', { error });
    throw error;
  }
}
