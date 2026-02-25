/**
 * LLM Service - Real implementation supporting GLM-4, OpenAI, and compatible APIs
 */

import { EventEmitter } from 'events';
import OpenAI from 'openai';
import type { LLMConfig, LLMResponse, LLMMessage } from '../../shared/types';

// Try to import keytar, fallback to memory storage if not available
// Define a minimal interface for keytar to avoid type issues
interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<void>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

let keytar: Keytar | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  keytar = require('keytar');
} catch (error) {
  console.warn('keytar not available, falling back to memory storage (not recommended for production)');
}

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

    // Check if running in development mode
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

    this.client = new OpenAI({
      apiKey,
      baseURL,
      // Only allow browser in development mode for safety
      // Note: In Electron main process, this flag has minimal effect
      // but we keep it disabled in production for security best practices
      dangerouslyAllowBrowser: isDev
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

/**
 * Service name for keytar (must be consistent across the app)
 */
const KEYTAR_SERVICE = 'com.desktop-mate.app';

/**
 * API Key Manager with secure storage using keytar
 * Falls back to in-memory storage if keytar is not available
 */
export class APIKeyManager {
  private static readonly fallbackStore: Map<string, string> = new Map();
  private static usingSecureStorage: boolean = false;

  /**
   * Check if secure storage is available
   */
  static isSecureStorageAvailable(): boolean {
    return keytar !== null;
  }

  /**
   * Store an API key securely
   */
  static async storeKey(provider: string, key: string): Promise<void> {
    const account = `llm_${provider}`;

    if (keytar) {
      try {
        await keytar.setPassword(KEYTAR_SERVICE, account, key);
        APIKeyManager.usingSecureStorage = true;
        console.log(`API key stored securely for provider: ${provider}`);
      } catch (error) {
        console.warn(`Failed to store key in keytar, falling back to memory: ${error}`);
        APIKeyManager.fallbackStore.set(account, key);
        APIKeyManager.usingSecureStorage = false;
      }
    } else {
      APIKeyManager.fallbackStore.set(account, key);
      APIKeyManager.usingSecureStorage = false;
    }
  }

  /**
   * Retrieve an API key
   */
  static async getKey(provider: string): Promise<string | null> {
    const account = `llm_${provider}`;

    if (keytar) {
      try {
        const key = await keytar.getPassword(KEYTAR_SERVICE, account);
        if (key !== null) {
          return key;
        }
      } catch (error) {
        console.warn(`Failed to retrieve key from keytar: ${error}`);
      }
    }

    // Fallback to memory store
    return APIKeyManager.fallbackStore.get(account) || null;
  }

  /**
   * Delete an API key
   */
  static async deleteKey(provider: string): Promise<boolean> {
    const account = `llm_${provider}`;

    if (keytar) {
      try {
        await keytar.deletePassword(KEYTAR_SERVICE, account);
      } catch (error) {
        console.warn(`Failed to delete key from keytar: ${error}`);
      }
    }

    // Always remove from fallback store
    APIKeyManager.fallbackStore.delete(account);
    return true;
  }

  /**
   * List all providers that have stored keys
   */
  static async listProviders(): Promise<string[]> {
    const providers = new Set<string>();

    // Check keytar if available
    if (keytar) {
      try {
        const credentials = await keytar.findCredentials(KEYTAR_SERVICE);
        for (const cred of credentials) {
          if (cred.account.startsWith('llm_')) {
            providers.add(cred.account.substring(4)); // Remove 'llm_' prefix
          }
        }
      } catch (error) {
        console.warn(`Failed to list credentials from keytar: ${error}`);
      }
    }

    // Add providers from fallback store
    for (const account of APIKeyManager.fallbackStore.keys()) {
      if (account.startsWith('llm_')) {
        providers.add(account.substring(4));
      }
    }

    return Array.from(providers);
  }

  /**
   * Clear all stored API keys
   */
  static async clearAll(): Promise<void> {
    const providers = await APIKeyManager.listProviders();

    for (const provider of providers) {
      await APIKeyManager.deleteKey(provider);
    }
  }

  /**
   * Get storage status information
   */
  static getStorageInfo(): { secure: boolean; providers: string[] } {
    return {
      secure: APIKeyManager.usingSecureStorage,
      providers: Array.from(APIKeyManager.fallbackStore.keys())
        .filter(k => k.startsWith('llm_'))
        .map(k => k.substring(4))
    };
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
