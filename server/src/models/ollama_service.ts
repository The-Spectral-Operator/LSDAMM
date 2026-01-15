/**
 * LSDAMM - Ollama Service
 * Integration with Ollama local and cloud APIs
 * Supports Modelfile creation for purpose-specific models
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
 * Modelfile configuration for creating custom models
 */
export interface ModelfileConfig {
  name: string;
  baseModel: string;
  systemPrompt?: string;
  template?: string;
  parameters?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    numPredict?: number;
    repeatPenalty?: number;
    seed?: number;
    numCtx?: number;
    numGpu?: number;
  };
  license?: string;
  purpose?: 'coding' | 'reasoning' | 'creative' | 'analysis' | 'chat' | 'custom';
  description?: string;
}

/**
 * Model creation progress
 */
export interface ModelCreateProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

/**
 * Generate a Modelfile from configuration
 */
export function generateModelfile(config: ModelfileConfig): string {
  const lines: string[] = [];
  
  // Base model
  lines.push(`FROM ${config.baseModel}`);
  lines.push('');
  
  // System prompt based on purpose or custom
  if (config.systemPrompt) {
    lines.push(`SYSTEM """${config.systemPrompt}"""`);
  } else if (config.purpose) {
    const purposePrompts: Record<string, string> = {
      coding: 'You are an expert programmer and software engineer. You write clean, efficient, well-documented code. You follow best practices and design patterns. You explain your code clearly.',
      reasoning: 'You are an expert analyst with strong logical reasoning abilities. You break down complex problems step by step, consider multiple perspectives, and provide well-reasoned conclusions.',
      creative: 'You are a creative writer with a vivid imagination. You craft engaging, original content with rich descriptions and compelling narratives.',
      analysis: 'You are a data analyst and researcher. You analyze information thoroughly, identify patterns, and provide actionable insights backed by evidence.',
      chat: 'You are a helpful, friendly assistant. You engage in natural conversation while being informative and supportive.',
      custom: 'You are a helpful AI assistant.',
    };
    lines.push(`SYSTEM """${purposePrompts[config.purpose]}"""`);
  }
  lines.push('');
  
  // Template (optional)
  if (config.template) {
    lines.push(`TEMPLATE """${config.template}"""`);
    lines.push('');
  }
  
  // Parameters
  if (config.parameters) {
    const params = config.parameters;
    if (params.temperature !== undefined) lines.push(`PARAMETER temperature ${params.temperature}`);
    if (params.topK !== undefined) lines.push(`PARAMETER top_k ${params.topK}`);
    if (params.topP !== undefined) lines.push(`PARAMETER top_p ${params.topP}`);
    if (params.numPredict !== undefined) lines.push(`PARAMETER num_predict ${params.numPredict}`);
    if (params.repeatPenalty !== undefined) lines.push(`PARAMETER repeat_penalty ${params.repeatPenalty}`);
    if (params.seed !== undefined) lines.push(`PARAMETER seed ${params.seed}`);
    if (params.numCtx !== undefined) lines.push(`PARAMETER num_ctx ${params.numCtx}`);
    if (params.numGpu !== undefined) lines.push(`PARAMETER num_gpu ${params.numGpu}`);
    lines.push('');
  }
  
  // License (optional)
  if (config.license) {
    lines.push(`LICENSE """${config.license}"""`);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Create a custom model from Modelfile
 */
export async function createModel(
  config: ModelfileConfig,
  useCloud: boolean = false,
  onProgress?: (progress: ModelCreateProgress) => void
): Promise<{ success: boolean; model: string; error?: string }> {
  const appConfig = getConfig();
  const baseUrl = useCloud 
    ? appConfig.providers.ollama_cloud.base_url 
    : appConfig.providers.ollama_local.base_url;
  
  const modelfile = generateModelfile(config);
  
  logger.info('Creating custom Ollama model', { 
    name: config.name, 
    baseModel: config.baseModel,
    purpose: config.purpose,
    useCloud 
  });
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (useCloud && appConfig.providers.ollama_cloud.api_key) {
      headers['Authorization'] = `Bearer ${appConfig.providers.ollama_cloud.api_key}`;
    }
    
    const response = await fetch(`${baseUrl}/api/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: config.name,
        modelfile,
        stream: true,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Model creation failed: ${errorText}`);
    }
    
    // Stream progress
    if (response.body) {
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
          
          try {
            const progress = JSON.parse(line) as ModelCreateProgress;
            if (onProgress) {
              onProgress(progress);
            }
            logger.debug('Model creation progress', progress);
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
    
    logger.info('Custom model created successfully', { name: config.name });
    
    return {
      success: true,
      model: config.name,
    };
  } catch (error) {
    logger.error('Failed to create custom model', { error, name: config.name });
    return {
      success: false,
      model: config.name,
      error: (error as Error).message,
    };
  }
}

/**
 * Delete a custom model
 */
export async function deleteModel(
  modelName: string,
  useCloud: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const appConfig = getConfig();
  const baseUrl = useCloud 
    ? appConfig.providers.ollama_cloud.base_url 
    : appConfig.providers.ollama_local.base_url;
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (useCloud && appConfig.providers.ollama_cloud.api_key) {
      headers['Authorization'] = `Bearer ${appConfig.providers.ollama_cloud.api_key}`;
    }
    
    const response = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ name: modelName }),
    });
    
    if (!response.ok) {
      throw new Error(`Delete failed: ${response.statusText}`);
    }
    
    logger.info('Model deleted', { name: modelName });
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete model', { error, name: modelName });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Copy a model with a new name
 */
export async function copyModel(
  source: string,
  destination: string,
  useCloud: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const appConfig = getConfig();
  const baseUrl = useCloud 
    ? appConfig.providers.ollama_cloud.base_url 
    : appConfig.providers.ollama_local.base_url;
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (useCloud && appConfig.providers.ollama_cloud.api_key) {
      headers['Authorization'] = `Bearer ${appConfig.providers.ollama_cloud.api_key}`;
    }
    
    const response = await fetch(`${baseUrl}/api/copy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source, destination }),
    });
    
    if (!response.ok) {
      throw new Error(`Copy failed: ${response.statusText}`);
    }
    
    logger.info('Model copied', { source, destination });
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to copy model', { error, source, destination });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Pull a model from Ollama registry
 */
export async function pullModel(
  modelName: string,
  useCloud: boolean = false,
  onProgress?: (progress: ModelCreateProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const appConfig = getConfig();
  const baseUrl = useCloud 
    ? appConfig.providers.ollama_cloud.base_url 
    : appConfig.providers.ollama_local.base_url;
  
  logger.info('Pulling model', { name: modelName, useCloud });
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (useCloud && appConfig.providers.ollama_cloud.api_key) {
      headers['Authorization'] = `Bearer ${appConfig.providers.ollama_cloud.api_key}`;
    }
    
    const response = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: modelName, stream: true }),
    });
    
    if (!response.ok) {
      throw new Error(`Pull failed: ${response.statusText}`);
    }
    
    // Stream progress
    if (response.body) {
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
          
          try {
            const progress = JSON.parse(line) as ModelCreateProgress;
            if (onProgress) {
              onProgress(progress);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
    
    logger.info('Model pulled successfully', { name: modelName });
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to pull model', { error, name: modelName });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get model info/details
 */
export async function getModelInfo(
  modelName: string,
  useCloud: boolean = false
): Promise<{
  modelfile?: string;
  parameters?: string;
  template?: string;
  details?: Record<string, unknown>;
  error?: string;
}> {
  const appConfig = getConfig();
  const baseUrl = useCloud 
    ? appConfig.providers.ollama_cloud.base_url 
    : appConfig.providers.ollama_local.base_url;
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (useCloud && appConfig.providers.ollama_cloud.api_key) {
      headers['Authorization'] = `Bearer ${appConfig.providers.ollama_cloud.api_key}`;
    }
    
    const response = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: modelName }),
    });
    
    if (!response.ok) {
      throw new Error(`Show failed: ${response.statusText}`);
    }
    
    const data = await response.json() as {
      modelfile?: string;
      parameters?: string;
      template?: string;
      details?: Record<string, unknown>;
    };
    
    return data;
  } catch (error) {
    logger.error('Failed to get model info', { error, name: modelName });
    return {
      error: (error as Error).message,
    };
  }
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
