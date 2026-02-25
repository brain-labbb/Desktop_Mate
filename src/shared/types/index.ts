/**
 * Shared type definitions for Desktop Mate
 */

/**
 * File node representing a file or directory in workspace
 */
export type FileNode = {
  /** Unique identifier */
  id: string;
  /** File/directory name */
  name: string;
  /** Relative path from workspace root */
  path: string;
  /** Node type */
  type: 'file' | 'directory';
  /** File size in bytes (files only) */
  size?: number;
  /** Last modified timestamp */
  mtime: number;
  /** Child nodes (directories only) */
  children?: FileNode[];
};

/**
 * File system API interface
 */
export type FileAPI = {
  /**
   * Read file content
   * @param path - Absolute or relative file path
   * @returns File content as string
   */
  read(path: string): Promise<string>;

  /**
   * Write content to file
   * @param path - Absolute or relative file path
   * @param content - File content to write
   */
  write(path: string, content: string): Promise<void>;

  /**
   * List directory contents
   * @param path - Directory path
   * @returns Array of file nodes
   */
  list(path: string): Promise<FileNode[]>;

  /**
   * Watch directory for changes
   * @param path - Directory path to watch
   * @returns EventEmitter for change events
   */
  watch(path: string): import('events').EventEmitter;

  /**
   * Delete file or directory
   * @param path - Path to delete
   */
  delete(path: string): Promise<void>;

  /**
   * Check if path exists
   * @param path - Path to check
   */
  exists(path: string): Promise<boolean>;

  /**
   * Close the file system and release resources (optional)
   * Some implementations like FileSystemService have this method
   */
  close?(): void;
};

/**
 * File type enumeration
 */
export enum FileType {
  TEXT = 'text',
  IMAGE = 'image',
  PDF = 'pdf',
  OFFICE = 'office',
  CODE = 'code',
  BINARY = 'binary',
  UNKNOWN = 'unknown'
}

/**
 * Attached file metadata
 */
export type AttachedFile = {
  /** Unique identifier */
  id: string;
  /** File name */
  name: string;
  /** File path (absolute path) */
  path: string;
  /** Relative path from workspace root (if inside workspace) */
  relativePath?: string;
  /** File size in bytes */
  size: number;
  /** File type */
  type?: FileType;
  /** MIME type */
  mimeType?: string;
  /** Text content (for small text files) */
  content?: string;
  /** Base64 encoded content (for images) */
  base64?: string;
  /** Whether the file is inside the workspace */
  inWorkspace?: boolean;
};

/**
 * Multimodal content block type
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file_metadata'; file: AttachedFile };

/**
 * LLM message for chat completion (supports multimodal)
 */
export type LLMMessage = {
  /** Message role */
  role: 'system' | 'user' | 'assistant';
  /** Message content (string for text, array for multimodal) */
  content: string | ContentBlock[];
};

/**
 * Permission levels for operations
 */
export enum PermissionLevel {
  /** Read-only operations - no approval needed */
  READ_ONLY = 0,
  /** Create/modify files - one-time authorization */
  EDIT = 1,
  /** Execute scripts/tools - confirmation each time */
  EXECUTE = 2,
  /** Delete files - double confirmation + filename verification */
  DELETE = 3,
  /** Network operations - show target URL */
  NETWORK = 4
}

/**
 * Permission request context
 */
export type PermissionRequest = {
  /** Permission level required */
  level: PermissionLevel;
  /** Action being performed */
  action: string;
  /** Target of action (file path, URL, etc.) */
  target: string;
  /** Workspace context */
  workspace?: string;
};

/**
 * Permission response
 */
export type PermissionResponse = {
  /** Whether permission was granted */
  approved: boolean;
  /** Remember this decision */
  remember?: boolean;
  /** User-provided notes (optional) */
  notes?: string;
};

/**
 * Audit log entry
 */
export type AuditLogEntry = {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** User identifier */
  user_id: string;
  /** Workspace path */
  workspace: string;
  /** Action performed */
  action: string;
  /** Target of action */
  target: string;
  /** SHA256 of file diff (for file operations) */
  diff_sha256?: string;
  /** Who approved this action */
  approved_by: string;
  /** Risk level */
  risk_level: 'low' | 'medium' | 'high';
  /** LLM model used */
  llm_model?: string;
  /** Tokens consumed */
  tokens_used?: number;
};

/**
 * LLM provider types
 */
export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'glm' | 'zhipu';

/**
 * LLM configuration
 */
export type LLMConfig = {
  /** Provider type */
  provider: LLMProvider;
  /** Model name */
  model: string;
  /** API key (for cloud providers) */
  apiKey?: string;
  /** Base URL (for custom endpoints) */
  baseUrl?: string;
  /** Temperature for generation */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
};

/**
 * LLM response with streaming support
 */
export type LLMResponse = {
  /** Generated content */
  content: string;
  /** Tokens used */
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Model used */
  model: string;
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'content_filter';
};

/**
 * Task status
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

/**
 * Task in execution plan
 */
export type Task = {
  /** Unique task identifier */
  id: string;
  /** Task type */
  type: 'read_files' | 'write_file' | 'execute_code' | 'call_tool';
  /** Task description */
  description: string;
  /** Task IDs this depends on */
  depends_on: string[];
  /** Can run in parallel with other tasks */
  parallel: boolean;
  /** Requires user approval */
  requires_approval: boolean;
  /** Current status */
  status: TaskStatus;
  /** Progress (0-100) */
  progress: number;
  /** Output/result */
  output?: any;
  /** Error if failed */
  error?: string;
};

/**
 * Execution plan from LLM
 */
export type ExecutionPlan = {
  /** Overall goal */
  goal: string;
  /** Tasks to execute */
  tasks: Task[];
  /** Estimated time in seconds */
  estimated_time: number;
};

/**
 * Checkpoint for rollback
 */
export type Checkpoint = {
  /** Unique identifier */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Description */
  description: string;
  /** File changes at this checkpoint */
  fileChanges: {
    [filePath: string]: {
      before: string;
      after: string;
    };
  };
};

/**
 * File processing configuration
 */
export type FileProcessingConfig = {
  /** Threshold for small text files (in bytes) - default 50KB */
  smallFileThreshold: number;
  /** Threshold for image files (in bytes) - default 5MB */
  imageFileThreshold: number;
  /** Threshold for PDF/Office files (in bytes) - default 1MB */
  documentFileThreshold: number;
  /** Text file extensions */
  textFileExtensions: string[];
  /** Image file extensions */
  imageFileExtensions: string[];
  /** PDF file extensions */
  pdfFileExtensions: string[];
  /** Office file extensions */
  officeFileExtensions: string[];
  /** Code file extensions */
  codeFileExtensions: string[];
};

/**
 * Default file processing configuration
 */
export const DEFAULT_FILE_PROCESSING_CONFIG: FileProcessingConfig = {
  smallFileThreshold: 50 * 1024, // 50KB
  imageFileThreshold: 5 * 1024 * 1024, // 5MB
  documentFileThreshold: 1 * 1024 * 1024, // 1MB
  textFileExtensions: ['.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env', '.log'],
  imageFileExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'],
  pdfFileExtensions: ['.pdf'],
  officeFileExtensions: ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp'],
  codeFileExtensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.rb', '.php', '.cs', '.swift', '.kt', '.scala', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.html', '.css', '.scss', '.less', '.sass', '.vue', '.svelte']
};

/**
 * Agent execution context (extended with attachments support)
 */
export type AgentExecutionContext = {
  /** Workspace path */
  workspacePath?: string;
  /** Additional context */
  additionalContext?: string;
  /** Attached files */
  attachments?: AttachedFile[];
};

/**
 * Document chunk for RAG
 */
export type Chunk = {
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
};

/**
 * Chunker options for RAG
 */
export type ChunkOptions = {
  /** Maximum chunk size in characters (default: 1000) */
  maxChunkSize?: number;
  /** Overlap between chunks in characters (default: 200) */
  chunkOverlap?: number;
  /** Separator to split text (default: '\n\n') */
  separator?: string;
  /** Whether to preserve structure like headings (default: false) */
  preserveStructure?: boolean;
};

/**
 * Vector search result from RAG
 */
export type VectorSearchResult = {
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
};

/**
 * RAG service options
 */
export type RAGOptions = {
  /** Embedding API configuration */
  embedding: {
    /** API key for embedding service */
    apiKey: string;
    /** Base URL (for custom endpoints) */
    baseURL?: string;
    /** Model to use (default: text-embedding-3-small) */
    model?: string;
  };
  /** Path to vector database (optional, defaults to userData/vectors.db) */
  dbPath?: string;
  /** Chunker options */
  chunker?: ChunkOptions;
};

/**
 * RAG retrieval options
 */
export type RAGRetrievalOptions = {
  /** Maximum number of chunks to retrieve (default: 3) */
  maxResults?: number;
  /** Minimum similarity threshold (default: 0.0, no filter) */
  minSimilarity?: number;
  /** Document ID to limit search to (optional) */
  documentId?: string;
  /** Whether to include similarity scores in output (default: true) */
  showScores?: boolean;
};
