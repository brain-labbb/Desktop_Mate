/**
 * Vector Store Service
 * Handles storage and retrieval of document embeddings using SQLite + sqlite-vec
 */

import Database from 'better-sqlite3';
import type { EmbeddingService } from './embeddings';
import type { Chunk } from './chunker';

/**
 * Vector search result
 */
export interface VectorSearchResult {
  /** Chunk ID */
  chunkId: string;
  /** Document ID */
  documentId: string;
  /** Chunk content */
  content: string;
  /** Similarity score (0-1, higher is better) */
  similarity: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Vector store options
 */
export interface VectorStoreOptions {
  /** Path to SQLite database */
  dbPath: string;
  /** Embedding dimensions (default: 1536 for text-embedding-3-small) */
  dimensions?: number;
  /** Whether to enable WAL mode for better concurrency */
  enableWAL?: boolean;
}

/**
 * Vector Store
 */
export class VectorStore {
  private db: Database.Database;
  private embeddingService: EmbeddingService;
  private dimensions: number;
  private initialized: boolean = false;

  constructor(
    embeddingService: EmbeddingService,
    options: VectorStoreOptions
  ) {
    this.embeddingService = embeddingService;
    this.dimensions = options.dimensions ?? 1536;

    // Open database
    this.db = new Database(options.dbPath);

    // Configure database
    if (options.enableWAL !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    this.initialize();
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    // Create chunks table with full-text search
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_chunks (
        chunk_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_doc_chunks_document ON doc_chunks(document_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS doc_chunks_fts USING fts5(content, content_rowid=doc_chunks);
    `);

    this.initialized = true;
  }

  /**
   * Create or update the vector table for a specific embedding dimension
   */
  private ensureVectorTable(): void {
    // Check if vec0 table exists
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_embeddings'
    `).get();

    if (!tableExists) {
      // Create vector table using sqlite-vec
      // Note: sqlite-vec requires special handling for vector columns
      this.db.exec(`
        CREATE TABLE chunk_embeddings (
          chunk_id TEXT PRIMARY KEY,
          embedding BLOB NOT NULL,
          FOREIGN KEY (chunk_id) REFERENCES doc_chunks(chunk_id) ON DELETE CASCADE
        );
      `);
    }
  }

  /**
   * Add chunks to the vector store
   */
  async addChunks(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    this.ensureVectorTable();

    const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO doc_chunks (chunk_id, document_id, content, metadata)
      VALUES (?, ?, ?, ?)
    `);

    const insertEmbedding = this.db.prepare(`
      INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding)
      VALUES (?, ?)
    `);

    // Generate embeddings in batch
    const texts = chunks.map(c => c.content);
    const embeddings = await this.embeddingService.embedBatch(texts);

    // Use transaction for better performance
    const insertMany = this.db.transaction((chunks: Chunk[], embeddings: number[][]) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        // Insert chunk metadata
        insertChunk.run(
          chunk.id,
          chunk.documentId,
          chunk.content,
          JSON.stringify(chunk.metadata || {})
        );

        // Convert embedding to Float32Array and then to buffer
        const float32Array = new Float32Array(embedding);
        const buffer = Buffer.from(float32Array.buffer);
        insertEmbedding.run(chunk.id, buffer);
      }
    });

    insertMany(chunks, embeddings);
  }

  /**
   * Search for similar chunks using vector similarity
   */
  async search(query: string, limit: number = 5, documentId?: string): Promise<VectorSearchResult[]> {
    this.ensureVectorTable();

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embed(query);
    const queryFloat32 = new Float32Array(queryEmbedding);
    const queryBuffer = Buffer.from(queryFloat32.buffer);

    // Get all embeddings and compute similarities manually
    // (This is a simple implementation - for production, consider using sqlite-vec properly)
    const rows = this.db.prepare(`
      SELECT c.chunk_id, c.document_id, c.content, c.metadata, e.embedding
      FROM doc_chunks c
      JOIN chunk_embeddings e ON c.chunk_id = e.chunk_id
      ${documentId ? 'WHERE c.document_id = ?' : ''}
    `).all(...(documentId ? [documentId] : [])) as Array<{
      chunk_id: string;
      document_id: string;
      content: string;
      metadata: string;
      embedding: Buffer;
    }>;

    // Calculate similarities
    const results: VectorSearchResult[] = rows.map(row => {
      const storedEmbedding = new Float32Array(row.embedding.buffer);
      const similarity = this.cosineSimilarity(queryEmbedding, Array.from(storedEmbedding));

      return {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        content: row.content,
        similarity,
        metadata: JSON.parse(row.metadata || '{}')
      };
    });

    // Sort by similarity (descending) and limit
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Delete all chunks for a document
   */
  deleteDocument(documentId: string): void {
    this.db.prepare('DELETE FROM doc_chunks WHERE document_id = ?').run(documentId);
  }

  /**
   * Delete a specific chunk
   */
  deleteChunk(chunkId: string): void {
    this.db.prepare('DELETE FROM doc_chunks WHERE chunk_id = ?').run(chunkId);
  }

  /**
   * Get chunk by ID
   */
  getChunk(chunkId: string): VectorSearchResult | null {
    const row = this.db.prepare(`
      SELECT c.chunk_id, c.document_id, c.content, c.metadata
      FROM doc_chunks c
      WHERE c.chunk_id = ?
    `).get(chunkId) as {
      chunk_id: string;
      document_id: string;
      content: string;
      metadata: string;
    } | undefined;

    if (!row) {
      return null;
    }

    return {
      chunkId: row.chunk_id,
      documentId: row.document_id,
      content: row.content,
      similarity: 1.0,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  /**
   * List all document IDs
   */
  listDocuments(): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT document_id FROM doc_chunks ORDER BY document_id
    `).all() as Array<{ document_id: string }>;

    return rows.map(r => r.document_id);
  }

  /**
   * Get document statistics
   */
  getDocumentStats(documentId: string): { chunkCount: number; totalChars: number } {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as chunk_count,
        SUM(LENGTH(content)) as total_chars
      FROM doc_chunks
      WHERE document_id = ?
    `).get(documentId) as {
      chunk_count: number;
      total_chars: number;
    } | undefined;

    return {
      chunkCount: row?.chunk_count ?? 0,
      totalChars: row?.total_chars ?? 0
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.db.exec('DELETE FROM doc_chunks');
    this.db.exec('DELETE FROM chunk_embeddings');
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Check if the store is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Create a vector store instance
 */
export function createVectorStore(
  embeddingService: EmbeddingService,
  options: VectorStoreOptions
): VectorStore {
  return new VectorStore(embeddingService, options);
}
