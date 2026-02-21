/**
 * LLM Service Mock Data and Utilities
 */

import { vi } from 'vitest';
import type { LLMResponse, LLMMessage } from '../src/shared/types';

/** Mock LLM responses */
export const mockLLMResponses: Record<string, string> = {
  'hello': 'Hello! How can I help you today?',
  'code': 'Here is the code you requested:\n\n```typescript\nconsole.log("Hello, world!");\n```',
  'error': 'I apologize, but I encountered an error. Please try again.',
  'stream': 'This is a streaming response that comes in chunks.'
};

/** Mock LLM response with token count */
export function mockLLMResponse(content: string, tokens = { prompt: 100, completion: 50, total: 150 }): LLMResponse {
  return {
    content,
    tokens,
    model: 'gpt-4o',
    finishReason: 'stop'
  };
}

/** Mock streaming response chunks */
export function mockStreamChunks(content: string): string[] {
  const chunks: string[] = [];
  const words = content.split(' ');

  for (const word of words) {
    chunks.push(word + ' ');
  }

  return chunks;
}

/** Mock LLM messages */
export const mockLLMMessages: LLMMessage[] = [
  {
    role: 'system',
    content: 'You are a helpful AI assistant.'
  },
  {
    role: 'user',
    content: 'Hello, how are you?'
  }
];

/** Mock API keys */
export const mockAPIKeys = {
  openai: 'sk-test-openai-key-12345',
  anthropic: 'sk-ant-test-anthropic-key-67890',
  ollama: '' // Ollama doesn't need an API key
};

/** Mock LLM service */
export const mockLLMService = {
  generate: vi.fn(),
  generateStream: vi.fn(),
  updateConfig: vi.fn(),
  getConfig: vi.fn(),
  on: vi.fn(),
  emit: vi.fn()
};

/** Mock stream generator */
export async function* mockStreamGenerator(content: string): AsyncGenerator<string, LLMResponse> {
  const chunks = mockStreamChunks(content);

  for (const chunk of chunks) {
    yield chunk;
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  return mockLLMResponse(content);
}

/** Mock API key manager */
export const mockAPIKeyManager = {
  storeKey: vi.fn(),
  getKey: vi.fn().mockImplementation(async (provider: string) => {
    return mockAPIKeys[provider as keyof typeof mockAPIKeys] || null;
  }),
  deleteKey: vi.fn(),
  hasKey: vi.fn().mockImplementation(async (provider: string) => {
    return !!mockAPIKeys[provider as keyof typeof mockAPIKeys];
  })
};

/** Mock error responses */
export const mockLLMErrors = {
  rateLimit: new Error('Rate limit exceeded. Please try again later.'),
  invalidKey: new Error('Invalid API key.'),
  network: new Error('Network error. Please check your connection.'),
  timeout: new Error('Request timeout. Please try again.')
};

/** Mock streaming error */
export async function* mockStreamError(error: Error): AsyncGenerator<string, never> {
  await new Promise(resolve => setTimeout(resolve, 100));
  throw error;
}
