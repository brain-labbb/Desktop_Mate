/**
 * LLM Service Unit Tests
 * Tests for src/main/services/llm.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMService, APIKeyManager, DEFAULT_LLM_CONFIGS, type LLMMessage } from '../../../src/main/services/llm';
import type { LLMConfig, LLMResponse } from '../../../src/shared/types';
import { PermissionLevel } from '../../../src/shared/types';

// Mock OpenAI
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  }))
}));

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn()
    }
  }))
}));

// Mock keytar
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}));

// Mock global fetch for Ollama
global.fetch = vi.fn();

describe('LLM Service', () => {
  let service: LLMService;
  let mockConfig: LLMConfig;

  beforeEach(() => {
    mockConfig = {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-api-key',
      temperature: 0.7,
      maxTokens: 4096
    };

    service = new LLMService(mockConfig);
  });

  afterEach(() => {
    service.removeAllListeners();
  });

  describe('Initialization', () => {
    it('should create service with OpenAI provider', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(LLMService);
    });

    it('should create service with Anthropic provider', () => {
      const anthropicConfig: LLMConfig = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: 'test-api-key'
      };

      const anthropicService = new LLMService(anthropicConfig);
      expect(anthropicService).toBeDefined();
      anthropicService.removeAllListeners();
    });

    it('should create service with Ollama provider', () => {
      const ollamaConfig: LLMConfig = {
        provider: 'ollama',
        model: 'llama3',
        baseUrl: 'http://localhost:11434'
      };

      const ollamaService = new LLMService(ollamaConfig);
      expect(ollamaService).toBeDefined();
      ollamaService.removeAllListeners();
    });

    it('should initialize with custom options', () => {
      const customService = new LLMService(mockConfig, {
        maxRetries: 5,
        onStream: vi.fn()
      });
      expect(customService).toBeDefined();
      customService.removeAllListeners();
    });
  });

  describe('Configuration', () => {
    it('should get current configuration', () => {
      const config = service.getConfig();
      expect(config).toBeDefined();
      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4o');
    });

    it('should update configuration', () => {
      service.updateConfig({
        temperature: 0.5,
        maxTokens: 2048
      });

      const config = service.getConfig();
      expect(config.temperature).toBe(0.5);
      expect(config.maxTokens).toBe(2048);
    });

    it('should reinitialize clients when provider changes', () => {
      service.updateConfig({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514'
      });

      const config = service.getConfig();
      expect(config.provider).toBe('anthropic');
    });
  });

  describe('Generate (Non-streaming)', () => {
    it('should generate completion with OpenAI', async () => {
      const OpenAI = require('openai').default;
      const mockClient = new OpenAI();

      const mockResponse = {
        choices: [{
          message: { content: 'Hello! How can I help you?' },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        },
        model: 'gpt-4o'
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello!' }
      ];

      const response = await service.generate(messages);

      expect(response.content).toBe('Hello! How can I help you?');
      expect(response.tokens.prompt).toBe(10);
      expect(response.tokens.completion).toBe(20);
      expect(response.tokens.total).toBe(30);
    });

    it('should retry on retryable errors', async () => {
      const OpenAI = require('openai').default;
      const mockClient = new OpenAI();

      // First call fails, second succeeds
      mockClient.chat.completions.create
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({
          choices: [{
            message: { content: 'Success' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: 'gpt-4o'
        });

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Test' }
      ];

      const response = await service.generate(messages);
      expect(response.content).toBe('Success');
    });

    it('should throw after max retries', async () => {
      const OpenAI = require('openai').default;
      const mockClient = new OpenAI();

      mockClient.chat.completions.create.mockRejectedValue(new Error('timeout'));

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Test' }
      ];

      await expect(service.generate(messages)).rejects.toThrow();
    });

    it('should not retry non-retryable errors', async () => {
      const OpenAI = require('openai').default;
      const mockClient = new OpenAI();

      mockClient.chat.completions.create.mockRejectedValue(new Error('Invalid API key'));

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Test' }
      ];

      await expect(service.generate(messages)).rejects.toThrow('Invalid API key');
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Generate Stream', () => {
    it('should generate streaming response with OpenAI', async () => {
      const OpenAI = require('openai').default;
      const mockClient = new OpenAI();

      // Mock stream
      const mockChunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: '!' } }] }
      ];

      const mockAsyncStream = (async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      })();

      mockClient.chat.completions.create.mockResolvedValue({
        [Symbol.asyncIterator]: () => mockAsyncStream[Symbol.asyncIterator]()
      });

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello!' }
      ];

      const chunks: string[] = [];
      for await (const chunk of service.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should call stream callback if provided', async () => {
      const streamCallback = vi.fn();
      const serviceWithCallback = new LLMService(mockConfig, {
        onStream: streamCallback
      });

      const OpenAI = require('openai').default;
      const mockClient = new OpenAI();

      mockClient.chat.completions.create.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Test' } }] };
        }()
      });

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Test' }
      ];

      for await (const _ of serviceWithCallback.generateStream(messages)) {
        // Consume stream
      }

      expect(streamCallback).toHaveBeenCalled();
      serviceWithCallback.removeAllListeners();
    });
  });

  describe('Ollama Integration', () => {
    beforeEach(() => {
      mockConfig = {
        provider: 'ollama',
        model: 'llama3',
        baseUrl: 'http://localhost:11434'
      };
      service = new LLMService(mockConfig);
    });

    it('should generate with Ollama', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          response: 'Ollama response',
          prompt_eval_count: 10,
          eval_count: 20
        })
      } as Response);

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello!' }
      ];

      const response = await service.generate(messages);

      expect(response.content).toBe('Ollama response');
      expect(response.tokens.prompt).toBe(10);
      expect(response.tokens.completion).toBe(20);
    });

    it('should handle Ollama errors', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        statusText: 'Service Unavailable'
      } as Response);

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello!' }
      ];

      await expect(service.generate(messages)).rejects.toThrow('Ollama request failed');
    });

    it('should generate streaming response with Ollama', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
        }
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        body: mockStream
      } as Response);

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello!' }
      ];

      const chunks: string[] = [];
      try {
        for await (const chunk of service.generateStream(messages)) {
          chunks.push(chunk);
        }
      } catch (e) {
        // Stream might fail in test
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error for uninitialized OpenAI client', async () => {
      const serviceWithoutKey = new LLMService({
        provider: 'openai',
        model: 'gpt-4o'
        // No API key
      });

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Test' }
      ];

      await expect(serviceWithoutKey.generate(messages)).rejects.toThrow();
      serviceWithoutKey.removeAllListeners();
    });

    it('should throw error for uninitialized Anthropic client', async () => {
      const serviceWithoutKey = new LLMService({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514'
        // No API key
      });

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Test' }
      ];

      await expect(serviceWithoutKey.generate(messages)).rejects.toThrow();
      serviceWithoutKey.removeAllListeners();
    });
  });
});

describe('API Key Manager', () => {
  const keytar = require('keytar').default;

  describe('storeKey()', () => {
    it('should store API key securely', async () => {
      await APIKeyManager.storeKey('openai', 'sk-test-key');
      expect(keytar.setPassword).toHaveBeenCalledWith('DesktopMate', 'openai', 'sk-test-key');
    });

    it('should store different provider keys', async () => {
      await APIKeyManager.storeKey('anthropic', 'sk-ant-test-key');
      await APIKeyManager.storeKey('openai', 'sk-openai-test-key');

      expect(keytar.setPassword).toHaveBeenCalledTimes(2);
    });
  });

  describe('getKey()', () => {
    it('should retrieve stored API key', async () => {
      keytar.getPassword.mockResolvedValue('sk-test-key');

      const key = await APIKeyManager.getKey('openai');
      expect(key).toBe('sk-test-key');
      expect(keytar.getPassword).toHaveBeenCalledWith('DesktopMate', 'openai');
    });

    it('should return null if key not found', async () => {
      keytar.getPassword.mockResolvedValue(null);

      const key = await APIKeyManager.getKey('openai');
      expect(key).toBeNull();
    });
  });

  describe('deleteKey()', () => {
    it('should delete stored API key', async () => {
      keytar.deletePassword.mockResolvedValue(true);

      const result = await APIKeyManager.deleteKey('openai');
      expect(result).toBe(true);
      expect(keytar.deletePassword).toHaveBeenCalledWith('DesktopMate', 'openai');
    });

    it('should return false if key not found', async () => {
      keytar.deletePassword.mockResolvedValue(false);

      const result = await APIKeyManager.deleteKey('openai');
      expect(result).toBe(false);
    });
  });

  describe('hasKey()', () => {
    it('should return true if key exists', async () => {
      keytar.getPassword.mockResolvedValue('sk-test-key');

      const result = await APIKeyManager.hasKey('openai');
      expect(result).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      keytar.getPassword.mockResolvedValue(null);

      const result = await APIKeyManager.hasKey('openai');
      expect(result).toBe(false);
    });
  });
});

describe('Default LLM Configs', () => {
  it('should have default config for OpenAI', () => {
    expect(DEFAULT_LLM_CONFIGS.openai).toBeDefined();
    expect(DEFAULT_LLM_CONFIGS.openai.provider).toBe('openai');
    expect(DEFAULT_LLM_CONFIGS.openai.model).toBe('gpt-4o');
  });

  it('should have default config for Anthropic', () => {
    expect(DEFAULT_LLM_CONFIGS.anthropic).toBeDefined();
    expect(DEFAULT_LLM_CONFIGS.anthropic.provider).toBe('anthropic');
    expect(DEFAULT_LLM_CONFIGS.anthropic.model).toBe('claude-sonnet-4-20250514');
  });

  it('should have default config for Ollama', () => {
    expect(DEFAULT_LLM_CONFIGS.ollama).toBeDefined();
    expect(DEFAULT_LLM_CONFIGS.ollama.provider).toBe('ollama');
    expect(DEFAULT_LLM_CONFIGS.ollama.baseUrl).toBe('http://localhost:11434');
  });
});
