/**
 * LLM Service - Real implementation supporting GLM-4, OpenAI, and compatible APIs
 */

import { EventEmitter } from 'events';
import OpenAI from 'openai';
import type { LLMConfig, LLMResponse, LLMMessage } from '../../shared/types';

export interface LLMServiceOptions {
  onStream?: (chunk: string) => void;
  maxRetries?: number;
}

export class LLMService extends EventEmitter {
  private config: LLMConfig;
  private options: LLMServiceOptions;
  private client: OpenAI | null = null;

  constructor(config: LLMConfig, options: LLMServiceOptions = {}) {
    super();
    this.config = config;
    this.options = { maxRetries: 3, ...options };
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = this.config.apiKey || 'dummy-key';

    // Determine base URL based on provider
    let baseURL = this.config.baseUrl;
    if (!baseURL) {
      switch (this.config.provider) {
        case 'glm':
        case 'zhipu':
          // GLM-4 API endpoint (compatible with OpenAI format)
          baseURL = 'https://open.bigmodel.cn/api/paas/v4/';
          break;
        case 'openai':
          baseURL = 'https://api.openai.com/v1';
          break;
        case 'ollama':
          baseURL = 'http://localhost:11434/v1';
          break;
        default:
          baseURL = 'https://api.openai.com/v1';
      }
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
      dangerouslyAllowBrowser: true // For development
    });
  }

  async generate(messages: LLMMessage[]): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('LLM client not initialized');
    }

    const maxRetries = this.options.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.config.model,
          messages: messages as any,
          temperature: this.config.temperature || 0.7,
          max_tokens: this.config.maxTokens || 4096,
        });

        const choice = completion.choices[0];
        return {
          content: choice.message.content || '',
          tokens: {
            prompt: completion.usage?.prompt_tokens || 0,
            completion: completion.usage?.completion_tokens || 0,
            total: completion.usage?.total_tokens || 0
          },
          model: completion.model,
          finishReason: (choice.finish_reason as 'stop' | 'length' | 'content_filter') || 'stop'
        };
      } catch (error) {
        lastError = error as Error;
        console.error(`LLM API call failed (attempt ${attempt + 1}/${maxRetries}):`, error);

        if (attempt < maxRetries - 1) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new Error(`LLM service failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  async *generateStream(messages: LLMMessage[]): AsyncGenerator<string, LLMResponse> {
    if (!this.client) {
      throw new Error('LLM client not initialized');
    }

    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: messages as any,
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4096,
        stream: true,
      });

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullContent += delta;
          yield delta;

          if (this.options.onStream) {
            this.options.onStream(delta);
          }
        }
      }

      return {
        content: fullContent,
        tokens: {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens
        },
        model: this.config.model,
        finishReason: 'stop'
      };
    } catch (error) {
      console.error('LLM stream failed:', error);
      throw error;
    }
  }

  /**
   * Generate with function calling support
   */
  async generateWithTools(
    messages: LLMMessage[],
    tools: Array<{
      type: 'function';
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    }>
  ): Promise<LLMResponse & { toolCalls?: any[] }> {
    if (!this.client) {
      throw new Error('LLM client not initialized');
    }

    try {
      // Transform messages to support multimodal content
      const apiMessages = messages.map(msg => {
        // If content is an array (multimodal), keep it as is
        // The OpenAI SDK supports content arrays with text and image_url
        return {
          role: msg.role,
          content: msg.content
        };
      });

      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: apiMessages as any,
        tools: tools as any,
        tool_choice: 'auto',
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4096,
      });

      const choice = completion.choices[0];
      return {
        content: choice.message.content || '',
        tokens: {
          prompt: completion.usage?.prompt_tokens || 0,
          completion: completion.usage?.completion_tokens || 0,
          total: completion.usage?.total_tokens || 0
        },
        model: completion.model,
        finishReason: (choice.finish_reason as 'stop' | 'length' | 'content_filter') || 'stop',
        toolCalls: choice.message.tool_calls
      };
    } catch (error) {
      console.error('LLM API call with tools failed:', error);
      throw error;
    }
  }

  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
    this.initializeClient();
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.client && !!this.config.apiKey;
  }
}

export class APIKeyManager {
  private static readonly KEY_PREFIX = 'llm_api_key_';
  private static keyStore: Map<string, string> = new Map();

  static async storeKey(provider: string, key: string): Promise<void> {
    // Store in memory for now (in production, use keytar or secure storage)
    APIKeyManager.keyStore.set(`${this.KEY_PREFIX}${provider}`, key);
    // TODO: Implement secure storage with keytar
  }

  static async getKey(provider: string): Promise<string | null> {
    // Read from memory for now (in production, use keytar or secure storage)
    return APIKeyManager.keyStore.get(`${this.KEY_PREFIX}${provider}`) || null;
  }

  static async deleteKey(provider: string): Promise<boolean> {
    APIKeyManager.keyStore.delete(`${this.KEY_PREFIX}${provider}`);
    // TODO: Implement secure storage with keytar
    return true;
  }
}

export async function createLLMService(config: LLMConfig, options?: LLMServiceOptions): Promise<LLMService> {
  return new LLMService(config, options);
}

export const DEFAULT_LLM_CONFIGS: Record<string, LLMConfig> = {
  openai: { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 4096 },
  anthropic: { provider: 'anthropic', model: 'claude-sonnet-4', temperature: 0.7, maxTokens: 8192 },
  ollama: { provider: 'ollama', model: 'llama3', baseUrl: 'http://localhost:11434' },
  glm: { provider: 'glm', model: 'glm-4', temperature: 0.7, maxTokens: 4096 },
  zhipu: { provider: 'zhipu', model: 'glm-4', temperature: 0.7, maxTokens: 4096 }
};
