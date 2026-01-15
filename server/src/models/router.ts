/**
 * LSDAMM - AI Model Router
 * Intelligent routing between AI providers
 */

import * as openaiService from './openai_service.js';
import * as anthropicService from './anthropic_service.js';
import * as ollamaService from './ollama_service.js';
import * as googleService from './google_service.js';
import * as xaiService from './xai_service.js';
import { logger } from '../util/logging.js';

export type ProviderId = 'openai' | 'anthropic' | 'ollama' | 'google' | 'xai';

export interface RouteRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  systemPrompt?: string;
  
  // Routing preferences
  preferredProvider?: ProviderId;
  preferredModel?: string;
  capabilities?: ('reasoning' | 'coding' | 'fast' | 'cheap' | 'local' | 'vision')[];
  maxLatencyMs?: number;
  maxCostPerToken?: number;
}

export interface RouteResponse {
  messageId: string;
  content: string;
  model: string;
  provider: ProviderId;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}

export interface StreamChunk {
  type: 'content' | 'thinking' | 'metadata' | 'error';
  content?: string;
  thinking?: string;
  provider?: ProviderId;
  metadata?: Record<string, unknown>;
  error?: string;
}

interface ProviderInfo {
  id: ProviderId;
  isEnabled: () => boolean;
  capabilities: string[];
  priority: number;
  costTier: 'low' | 'medium' | 'high';
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    isEnabled: openaiService.isEnabled,
    capabilities: ['reasoning', 'coding', 'vision', 'fast'],
    priority: 2,
    costTier: 'high',
  },
  {
    id: 'anthropic',
    isEnabled: anthropicService.isEnabled,
    capabilities: ['reasoning', 'coding', 'fast'],
    priority: 3,
    costTier: 'high',
  },
  {
    id: 'google',
    isEnabled: googleService.isEnabled,
    capabilities: ['reasoning', 'vision', 'fast'],
    priority: 2,
    costTier: 'medium',
  },
  {
    id: 'xai',
    isEnabled: xaiService.isEnabled,
    capabilities: ['reasoning', 'fast'],
    priority: 1,
    costTier: 'medium',
  },
  {
    id: 'ollama',
    isEnabled: () => ollamaService.isLocalEnabled() || ollamaService.isCloudEnabled(),
    capabilities: ['local', 'cheap', 'coding'],
    priority: 1,
    costTier: 'low',
  },
];

/**
 * Get available providers
 */
export function getAvailableProviders(): ProviderId[] {
  return PROVIDERS
    .filter(p => p.isEnabled())
    .map(p => p.id);
}

/**
 * Select the best provider based on request requirements
 */
function selectProvider(request: RouteRequest): ProviderId {
  // If preferred provider is specified and available, use it
  if (request.preferredProvider) {
    const provider = PROVIDERS.find(p => p.id === request.preferredProvider);
    if (provider?.isEnabled()) {
      return provider.id;
    }
  }

  // Filter by capabilities if specified
  let candidates = PROVIDERS.filter(p => p.isEnabled());
  
  if (request.capabilities?.length) {
    candidates = candidates.filter(p =>
      request.capabilities!.every(cap => p.capabilities.includes(cap))
    );
  }

  // If local is preferred and Ollama is available
  if (request.capabilities?.includes('local') && ollamaService.isLocalEnabled()) {
    return 'ollama';
  }

  // If cheap is preferred
  if (request.capabilities?.includes('cheap')) {
    const cheapProviders = candidates.filter(p => p.costTier === 'low');
    if (cheapProviders.length > 0) {
      return cheapProviders[0].id;
    }
  }

  // Sort by priority and pick best
  candidates.sort((a, b) => b.priority - a.priority);
  
  if (candidates.length === 0) {
    throw new Error('No suitable AI provider available');
  }

  return candidates[0].id;
}

/**
 * Route and send a message to the best provider
 */
export async function route(request: RouteRequest): Promise<RouteResponse> {
  const provider = selectProvider(request);
  const startTime = Date.now();

  logger.debug('Routing request', { provider, capabilities: request.capabilities });

  try {
    let response: {
      messageId: string;
      content: string;
      model: string;
      usage: { promptTokens: number; completionTokens: number; totalTokens: number };
      finishReason: string;
      metadata?: Record<string, unknown>;
    };

    const normalizedMessages = normalizeMessages(request.messages, provider);

    switch (provider) {
      case 'openai':
        response = await openaiService.sendMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          systemPrompt: request.systemPrompt,
        });
        break;

      case 'anthropic':
        response = await anthropicService.sendMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'user' | 'assistant'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          systemPrompt: request.systemPrompt,
        });
        break;

      case 'google':
        response = await googleService.sendMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'user' | 'model'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          systemPrompt: request.systemPrompt,
        });
        break;

      case 'xai':
        response = await xaiService.sendMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
        break;

      case 'ollama':
        response = await ollamaService.sendMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        }, request.capabilities?.includes('local'));
        break;

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    const latencyMs = Date.now() - startTime;

    return {
      ...response,
      provider,
      latencyMs,
    };
  } catch (error) {
    logger.error('Routing failed', { provider, error });
    
    // Try fallback to another provider
    const fallbackProvider = selectFallbackProvider(provider, request);
    if (fallbackProvider) {
      logger.info('Attempting fallback', { from: provider, to: fallbackProvider });
      return route({
        ...request,
        preferredProvider: fallbackProvider,
      });
    }
    
    throw error;
  }
}

/**
 * Stream a message through the router
 */
export async function* streamRoute(request: RouteRequest): AsyncGenerator<StreamChunk> {
  const provider = selectProvider(request);
  
  logger.debug('Streaming request', { provider });

  const normalizedMessages = normalizeMessages(request.messages, provider);

  try {
    let stream: AsyncGenerator<{
      type: 'content' | 'thinking' | 'metadata' | 'error';
      content?: string;
      thinking?: string;
      metadata?: Record<string, unknown>;
      error?: string;
    }>;

    switch (provider) {
      case 'openai':
        stream = openaiService.streamMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          systemPrompt: request.systemPrompt,
        });
        break;

      case 'anthropic':
        stream = anthropicService.streamMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'user' | 'assistant'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          systemPrompt: request.systemPrompt,
        });
        break;

      case 'google':
        stream = googleService.streamMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'user' | 'model'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          systemPrompt: request.systemPrompt,
        });
        break;

      case 'xai':
        stream = xaiService.streamMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
        break;

      case 'ollama':
        stream = ollamaService.streamLocalMessage({
          model: request.preferredModel,
          messages: normalizedMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
        break;

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    for await (const chunk of stream) {
      yield {
        ...chunk,
        provider,
      };
    }
  } catch (error) {
    logger.error('Streaming failed', { provider, error });
    yield {
      type: 'error',
      provider,
      error: (error as Error).message,
    };
  }
}

/**
 * Normalize messages for specific provider
 */
function normalizeMessages(
  messages: Array<{ role: string; content: string }>,
  provider: ProviderId
): Array<{ role: string; content: string }> {
  return messages.map(m => {
    let role = m.role;
    
    // Anthropic doesn't support 'system' role in messages array
    if (provider === 'anthropic' && role === 'system') {
      role = 'user'; // Will be handled via systemPrompt parameter
    }
    
    // Google uses 'model' instead of 'assistant'
    if (provider === 'google' && role === 'assistant') {
      role = 'model';
    }
    
    return { role, content: m.content };
  });
}

/**
 * Select a fallback provider
 */
function selectFallbackProvider(
  failedProvider: ProviderId,
  request: RouteRequest
): ProviderId | null {
  const available = PROVIDERS
    .filter(p => p.isEnabled() && p.id !== failedProvider)
    .sort((a, b) => b.priority - a.priority);
  
  if (available.length === 0) {
    return null;
  }
  
  // Try to match capabilities if specified
  if (request.capabilities?.length) {
    const matching = available.find(p =>
      request.capabilities!.some(cap => p.capabilities.includes(cap))
    );
    if (matching) {
      return matching.id;
    }
  }
  
  return available[0].id;
}

/**
 * Get all available models across providers
 */
export async function getAllModels(): Promise<Record<ProviderId, string[]>> {
  const result: Record<string, string[]> = {};
  
  if (openaiService.isEnabled()) {
    result.openai = await openaiService.getModels();
  }
  
  if (anthropicService.isEnabled()) {
    result.anthropic = anthropicService.getModels();
  }
  
  if (googleService.isEnabled()) {
    result.google = googleService.getModels();
  }
  
  if (xaiService.isEnabled()) {
    result.xai = xaiService.getModels();
  }
  
  if (ollamaService.isLocalEnabled()) {
    const localModels = await ollamaService.getLocalModels();
    result.ollama = localModels.map(m => m.name);
  }
  
  return result as Record<ProviderId, string[]>;
}
