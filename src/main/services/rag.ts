/**
 * RAG (Retrieval-Augmented Generation) Service
 * Orchestrates document chunking, embedding, and retrieval for enhanced LLM context
 */

import * as path from 'path';
import { app } from 'electron';
import { DocumentChunker, type Chunk, type ChunkOptions } from './chunker';
import { EmbeddingService, type EmbeddingServiceOptions } from './embeddings';
import { VectorStore, type VectorStoreOptions, type VectorSearchResult } from './vector-store';

/**
 * RAG retrieval options
 */
export interface RAGRetrievalOptions {
  /** Maximum number of chunks to retrieve (default: 3) */
  maxResults?: number;
  /** Minimum similarity threshold (default: 0.0, no filter) */
  minSimilarity?: number;
  /** Document ID to limit search to (optional) */
  documentId?: string;
  /** Whether to include similarity scores in output (default: true) */
  showScores?: boolean;
}

/**
 * RAG service options
 */
export interface RAGServiceOptions {
  /** Embedding service configuration */
  embedding: EmbeddingServiceOptions;
  /** Path to vector database (default: userData/vectors.db) */
  dbPath?: string;
  /** Chunker options */
  chunker?: ChunkOptions;
  /** Whether to auto-initialize (default: true) */
  autoInit?: boolean;
}

/**
 * RAG retrieval result
 */
export interface RAGResult {
  /** Retrieved context as formatted string */
  context: string;
  /** Number of chunks retrieved */
  chunkCount: number;
  /** Individual results with details */
  results: Array<{
    chunkId: string;
    documentId: string;
    content: string;
    similarity: number;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * RAG Service
 */
export class RAGService {
  private chunker: DocumentChunker;
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  private initialized: boolean = false;

  constructor(options: RAGServiceOptions) {
    // Initialize embedding service
    this.embeddingService = new EmbeddingService(options.embedding);

    // Initialize chunker
    this.chunker = new DocumentChunker(options.chunker);

    // Initialize vector store
    const dbPath = options.dbPath ?? path.join(app.getPath('userData'), 'vectors.db');
    this.vectorStore = new VectorStore(this.embeddingService, {
      dbPath,
      dimensions: this.embeddingService.getDimensions(),
      enableWAL: true
    });

    this.initialized = true;
  }

  /**
   * Index a document for retrieval
   */
  async indexDocument(documentId: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    this.ensureInitialized();

    // Delete existing chunks for this document
    this.vectorStore.deleteDocument(documentId);

    // Chunk the document
    const chunks = this.chunker.chunk(documentId, content, metadata);

    // Add chunks to vector store
    await this.vectorStore.addChunks(chunks);
  }

  /**
   * Retrieve relevant context for a query
   */
  async retrieve(query: string, options: RAGRetrievalOptions = {}): Promise<RAGResult> {
    this.ensureInitialized();

    const maxResults = options.maxResults ?? 3;
    const minSimilarity = options.minSimilarity ?? 0.0;
    const showScores = options.showScores ?? true;

    // Search vector store
    let results = await this.vectorStore.search(
      query,
      maxResults * 2, // Get more results, then filter
      options.documentId
    );

    // Filter by similarity threshold
    results = results.filter(r => r.similarity >= minSimilarity);

    // Limit results
    results = results.slice(0, maxResults);

    // Format context
    const contextParts: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const scoreText = showScores ? ` (similarity: ${result.similarity.toFixed(3)})` : '';
      contextParts.push(`[Source ${i + 1}${scoreText}]`);
      contextParts.push(result.content);

      if (result.metadata?.heading) {
        contextParts.push(`(from section: ${result.metadata.heading})`);
      }

      contextParts.push('');
    }

    const context = contextParts.join('\n');

    return {
      context,
      chunkCount: results.length,
      results: results.map(r => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        content: r.content,
        similarity: r.similarity,
        metadata: r.metadata
      }))
    };
  }

  /**
   * Delete a document from the index
   */
  deleteDocument(documentId: string): void {
    this.vectorStore.deleteDocument(documentId);
  }

  /**
   * List all indexed documents
   */
  listDocuments(): string[] {
    return this.vectorStore.listDocuments();
  }

  /**
   * Get statistics for a document
   */
  getDocumentStats(documentId: string): { chunkCount: number; totalChars: number } {
    return this.vectorStore.getDocumentStats(documentId);
  }

  /**
   * Get a specific chunk
   */
  getChunk(chunkId: string): VectorSearchResult | null {
    return this.vectorStore.getChunk(chunkId);
  }

  /**
   * Clear all indexed documents
   */
  clear(): void {
    this.vectorStore.clear();
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the embedding dimensions
   */
  getDimensions(): number {
    return this.embeddingService.getDimensions();
  }

  /**
   * Ensure the service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('RAG service is not initialized');
    }
  }

  /**
   * Close the service and release resources
   */
  close(): void {
    this.vectorStore.close();
    this.initialized = false;
  }
}

/**
 * Create a RAG service instance
 */
export function createRAGService(options: RAGServiceOptions): RAGService {
  return new RAGService(options);
}
