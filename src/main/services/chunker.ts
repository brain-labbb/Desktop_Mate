/**
 * Document Chunker Service
 * Splits documents into chunks for embedding and retrieval
 */

/**
 * Document chunk
 */
export interface Chunk {
  /** Unique chunk ID */
  id: string;
  /** Document identifier */
  documentId: string;
  /** Chunk content */
  content: string;
  /** Chunk index in document */
  index: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Chunker options
 */
export interface ChunkOptions {
  /** Maximum chunk size in characters (default: 1000) */
  maxChunkSize?: number;
  /** Overlap between chunks in characters (default: 200) */
  chunkOverlap?: number;
  /** Separator to split text (default: '\n\n') */
  separator?: string;
  /** Whether to preserve structure like headings (default: false) */
  preserveStructure?: boolean;
}

/**
 * Document Chunker
 */
export class DocumentChunker {
  private maxChunkSize: number;
  private chunkOverlap: number;
  private separator: string;
  private preserveStructure: boolean;

  constructor(options: ChunkOptions = {}) {
    this.maxChunkSize = options.maxChunkSize ?? 1000;
    this.chunkOverlap = options.chunkOverlap ?? 200;
    this.separator = options.separator ?? '\n\n';
    this.preserveStructure = options.preserveStructure ?? false;
  }

  /**
   * Split a document into chunks
   */
  chunk(documentId: string, text: string, metadata?: Record<string, unknown>): Chunk[] {
    // Normalize line endings
    const normalizedText = text.replace(/\r\n/g, '\n');

    if (this.preserveStructure) {
      return this.chunkWithStructure(documentId, normalizedText, metadata);
    }

    return this.chunkBySize(documentId, normalizedText, metadata);
  }

  /**
   * Chunk by separator and size (simple approach)
   */
  private chunkBySize(documentId: string, text: string, metadata?: Record<string, unknown>): Chunk[] {
    const chunks: Chunk[] = [];

    if (text.length <= this.maxChunkSize) {
      // Text fits in one chunk
      chunks.push(this.createChunk(documentId, text, 0, metadata));
      return chunks;
    }

    // Split by separator
    const parts = text.split(this.separator);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const part of parts) {
      const testChunk = currentChunk + (currentChunk ? this.separator : '') + part;

      if (testChunk.length > this.maxChunkSize && currentChunk) {
        // Current chunk is full, save it
        chunks.push(this.createChunk(documentId, currentChunk, chunkIndex++, metadata));

        // Keep overlap
        const overlapSize = Math.min(this.chunkOverlap, currentChunk.length);
        currentChunk = currentChunk.slice(-overlapSize);
      }

      currentChunk += (currentChunk ? this.separator : '') + part;
    }

    // Add remaining content
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(documentId, currentChunk, chunkIndex, metadata));
    }

    return chunks;
  }

  /**
   * Chunk while preserving document structure (headings, paragraphs)
   */
  private chunkWithStructure(documentId: string, text: string, metadata?: Record<string, unknown>): Chunk[] {
    const chunks: Chunk[] = [];
    const lines = text.split('\n');
    let currentChunk = '';
    let currentHeading = '';
    let chunkIndex = 0;

    for (const line of lines) {
      // Detect markdown headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        // Save current chunk if non-empty
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(
            documentId,
            currentChunk,
            chunkIndex++,
            { ...metadata, heading: currentHeading || undefined }
          ));
        }

        currentHeading = headingMatch[2];
        currentChunk = line + '\n';
      } else {
        const testLine = currentChunk + '\n' + line;

        if (testLine.length > this.maxChunkSize && currentChunk.trim()) {
          chunks.push(this.createChunk(
            documentId,
            currentChunk,
            chunkIndex++,
            { ...metadata, heading: currentHeading || undefined }
          ));

          // Keep overlap
          const overlapLines = currentChunk.split('\n').slice(-3);
          currentChunk = overlapLines.join('\n') + '\n' + line;
        } else {
          currentChunk = testLine;
        }
      }
    }

    // Add remaining content
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        documentId,
        currentChunk,
        chunkIndex,
        { ...metadata, heading: currentHeading || undefined }
      ));
    }

    return chunks;
  }

  /**
   * Create a chunk object
   */
  private createChunk(
    documentId: string,
    content: string,
    index: number,
    metadata?: Record<string, unknown>
  ): Chunk {
    return {
      id: `${documentId}-${index}`,
      documentId,
      content: content.trim(),
      index,
      metadata
    };
  }

  /**
   * Estimate token count for text (rough approximation: ~4 chars per token)
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get max tokens for a chunk based on current settings
   */
  getMaxChunkTokens(): number {
    return Math.ceil(this.maxChunkSize / 4);
  }
}

/**
 * Create a document chunker instance
 */
export function createDocumentChunker(options?: ChunkOptions): DocumentChunker {
  return new DocumentChunker(options);
}
