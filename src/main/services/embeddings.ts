/**
 * Embedding Service
 * Generates vector embeddings for text using OpenAI-compatible API
 */

import OpenAI from 'openai';

/**
 * Embedding result
 */
export interface EmbeddingResult {
  /** Vector embedding */
  embedding: number[];
  /** Model used */
  model: string;
  /** Dimensions of the embedding */
  dimensions: number;
}

/**
 * Embedding service options
 */
export interface EmbeddingServiceOptions {
  /** OpenAI API key */
  apiKey: string;
  /** Base URL (for custom endpoints) */
  baseURL?: string;
  /** Model to use (default: text-embedding-3-small) */
  model?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Embedding Service
 */
export class EmbeddingService {
  private openai: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(options: EmbeddingServiceOptions) {
    this.openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL
    });
    this.model = options.model || 'text-embedding-3-small';

    // Dimensions based on model
    if (this.model.includes('text-embedding-3-large')) {
      this.dimensions = 3072;
    } else if (this.model.includes('text-embedding-3-small')) {
      this.dimensions = 1536;
    } else if (this.model.includes('text-embedding-ada-002')) {
      this.dimensions = 1536;
    } else {
      this.dimensions = 1536; // Default
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text
      });

      return response.data[0].embedding;
    } catch (error) {
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      // OpenAI supports batch embedding
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts
      });

      // Sort results by index to match input order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map(item => item.embedding);
    } catch (error) {
      throw new Error(`Batch embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embedding dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get the embedding dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Get the model name
   */
  getModel(): string {
    return this.model;
  }
}

/**
 * Create an embedding service instance
 */
export function createEmbeddingService(options: EmbeddingServiceOptions): EmbeddingService {
  return new EmbeddingService(options);
}
