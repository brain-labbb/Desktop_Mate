/**
 * LLM Service Unit Tests
 * Tests for src/main/services/llm.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMService, APIKeyManager, DEFAULT_LLM_CONFIGS } from '../../../src/main/services/llm';
import type { LLMConfig, LLMMessage } from '../../../src/shared/types';

// Mock OpenAI
vi.mock('openai', () => ({
  default: class MockOpenAI {
    constructor(config: any) {
      this.apiKey = config.apiKey;
      this.baseURL = config.baseURL;
    }

    async chat() {
      return {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: { content: 'Test response' },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15
            },
            model: 'gpt-4o'
          })
        }
      };
    }
  }
}));

describe('LLMService', () => {
  let service: LLMService;
  let testConfig: LLMConfig;

  beforeEach(() => {
    testConfig = {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
      temperature: 0.7,
      maxTokens: 4096
    };
    service = new LLMService(testConfig);
  });

  describe('Initialization', () => {
    it('should create service with config', () => {
      expect(service).toBeDefined();
    });

    it('should have default configs available', () => {
      expect(DEFAULT_LLM_CONFIGS).toBeDefined();
      expect(DEFAULT_LLM_CONFIGS.openai).toBeDefined();
      expect(DEFAULT_LLM_CONFIGS.anthropic).toBeDefined();
      expect(DEFAULT_LLM_CONFIGS.ollama).toBeDefined();
      expect(DEFAULT_LLM_CONFIGS.glm).toBeDefined();
      expect(DEFAULT_LLM_CONFIGS.zhipu).toBeDefined();
    });
  });

  describe('Config Management', () => {
    it('should get current config', () => {
      const config = service.getConfig();
      expect(config).toBeDefined();
      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4o');
    });

    it('should update config', () => {
      service.updateConfig({ temperature: 0.5 });
      const config = service.getConfig();
      expect(config.temperature).toBe(0.5);
    });

    it('should check if configured', () => {
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('APIKeyManager', () => {
    it('should store API key', async () => {
      await APIKeyManager.storeKey('openai', 'sk-test');
      const key = await APIKeyManager.getKey('openai');
      expect(key).toBe('sk-test');
    });

    it('should return null for non-existent key', async () => {
      const key = await APIKeyManager.getKey('nonexistent');
      expect(key).toBeNull();
    });

    it('should delete API key', async () => {
      await APIKeyManager.storeKey('openai', 'sk-test');
      const deleted = await APIKeyManager.deleteKey('openai');
      expect(deleted).toBe(true);
      const key = await APIKeyManager.getKey('openai');
      expect(key).toBeNull();
    });
  });

  describe('Default Configs', () => {
    it('should have correct OpenAI config', () => {
      expect(DEFAULT_LLM_CONFIGS.openai.provider).toBe('openai');
      expect(DEFAULT_LLM_CONFIGS.openai.model).toBe('gpt-4o');
    });

    it('should have correct Anthropic config', () => {
      expect(DEFAULT_LLM_CONFIGS.anthropic.provider).toBe('anthropic');
      expect(DEFAULT_LLM_CONFIGS.anthropic.model).toBe('claude-sonnet-4');
    });

    it('should have correct Ollama config', () => {
      expect(DEFAULT_LLM_CONFIGS.ollama.provider).toBe('ollama');
      expect(DEFAULT_LLM_CONFIGS.ollama.model).toBe('llama3');
    });

    it('should have correct GLM config', () => {
      expect(DEFAULT_LLM_CONFIGS.glm.provider).toBe('glm');
      expect(DEFAULT_LLM_CONFIGS.glm.model).toBe('glm-4');
    });

    it('should have correct Zhipu config', () => {
      expect(DEFAULT_LLM_CONFIGS.zhipu.provider).toBe('zhipu');
      expect(DEFAULT_LLM_CONFIGS.zhipu.model).toBe('glm-4');
    });
  });
});
