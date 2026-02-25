/**
 * File System Service
 * F-01: Workspace mounting and file operations
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import ignore from 'ignore';
import { v4 as uuidv4 } from 'uuid';
import type { FileNode, FileAPI } from '../../shared/types';

export interface FileSystemConfig {
  workspaceRoot: string;
  maxFileSize: number;
  useGitIgnore: boolean;
  ignorePatterns?: string[];
}

export interface LargeFileWarning {
  path: string;
  size: number;
  sizeFormatted: string;
}

export class FileSystemService implements FileAPI {
  private config: FileSystemConfig;
  private ignoreInstance: ignore.Ignore;
  private watchers: Map<string, fsSync.FSWatcher> = new Map();
  private initialized: boolean = false;

  constructor(config: FileSystemConfig) {
    this.config = config;
    this.ignoreInstance = ignore();
    this.initializeIgnore();
  }

  /**
   * Initialize .gitignore patterns (synchronous)
   */
  private initializeIgnore(): void {
    // Add additional ignore patterns first (these are provided by config)
    if (this.config.ignorePatterns) {
      this.ignoreInstance.add(this.config.ignorePatterns);
    }

    // Always ignore common sensitive files
    this.ignoreInstance.add([
      '.env',
      '*.key',
      '*.pem',
      'id_rsa',
      '*.secret',
      'node_modules/',
      '.git/',
      '__pycache__/',
      '*.pyc',
      '.DS_Store'
    ]);

    // Try to load .gitignore file synchronously
    if (this.config.useGitIgnore) {
      try {
        const gitignorePath = path.join(this.config.workspaceRoot, '.gitignore');
        const gitignoreContent = fsSync.readFileSync(gitignorePath, 'utf-8');
        this.ignoreInstance.add(gitignoreContent);
      } catch (error) {
        // .gitignore not found, continue without it
      }
    }

    this.initialized = true;
  }

  /**
   * Check if a path should be ignored
   */
  private isIgnored(relativePath: string): boolean {
    return this.ignoreInstance.ignores(relativePath);
  }

  /**
   * Check if file is binary
   */
  private async isBinary(filePath: string): Promise<boolean> {
    try {
      const buffer = await fs.readFile(filePath);
      const isBinary = buffer.some((byte) => byte === 0);
      return isBinary;
    } catch {
      return false;
    }
  }

  /**
   * Format bytes to human-readable size
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Read file content with size check
   * @throws Error if file is too large or doesn't exist
   */
  async read(filePath: string): Promise<string> {
    const fullPath = path.resolve(this.config.workspaceRoot, filePath);
    const relativePath = path.relative(this.config.workspaceRoot, fullPath);

    // Check if ignored
    if (this.isIgnored(relativePath)) {
      throw new Error(`File is ignored: ${filePath}`);
    }

    // Check file exists
    const stats = await fs.stat(fullPath).catch(() => null);
    if (!stats) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Check file size
    if (stats.size > this.config.maxFileSize) {
      throw new Error(
        `File too large (${this.formatBytes(stats.size)}). ` +
        `Maximum size is ${this.formatBytes(this.config.maxFileSize)}`
      );
    }

    // Check if binary
    if (await this.isBinary(fullPath)) {
      throw new Error(`Cannot read binary file: ${filePath}`);
    }

    return fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Write content to file
   */
  async write(filePath: string, content: string): Promise<void> {
    const fullPath = path.resolve(this.config.workspaceRoot, filePath);
    const relativePath = path.relative(this.config.workspaceRoot, fullPath);

    // Check if ignored
    if (this.isIgnored(relativePath)) {
      throw new Error(`Cannot write to ignored file: ${filePath}`);
    }

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * List directory contents as file tree
   * @param dirPath - Directory path relative to workspace root
   * @param maxDepth - Maximum depth to traverse (default: 3)
   * @param currentDepth - Current traversal depth (internal)
   */
  async list(
    dirPath: string = '.',
    maxDepth: number = 3,
    currentDepth: number = 0
  ): Promise<FileNode[]> {
    const fullPath = path.resolve(this.config.workspaceRoot, dirPath);
    const relativePath = path.relative(this.config.workspaceRoot, fullPath);

    const nodes: FileNode[] = [];
    const warnings: LargeFileWarning[] = [];

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(fullPath, entry.name);
        const entryRelativePath = path.join(dirPath, entry.name);

        if (this.isIgnored(entryRelativePath)) {
          continue;
        }

        const stats = await fs.stat(entryPath);

        const node: FileNode = {
          id: uuidv4(),
          name: entry.name,
          path: entryRelativePath,
          type: stats.isDirectory() ? 'directory' : 'file',
          mtime: stats.mtimeMs
        };

        if (entry.isFile()) {
          node.size = stats.size;

          // Check for large files
          if (stats.size > this.config.maxFileSize) {
            warnings.push({
              path: entryRelativePath,
              size: stats.size,
              sizeFormatted: this.formatBytes(stats.size)
            });
          }
        }

        nodes.push(node);
      }

      // Sort: directories first, then files alphabetically
      nodes.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });

      if (warnings.length > 0) {
        console.warn(`Large files detected:`, warnings);
      }

      return nodes;
    } catch (error) {
      throw new Error(`Failed to list directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Watch directory for changes
   */
  watch(dirPath: string = '.'): EventEmitter {
    const fullPath = path.resolve(this.config.workspaceRoot, dirPath);
    const emitter = new EventEmitter();

    // Clean up existing watcher
    const existingWatcher = this.watchers.get(fullPath);
    if (existingWatcher) {
      existingWatcher.close();
    }

    // Create new watcher - use fsSync.watch which returns FSWatcher
    const watcher = fsSync.watch(fullPath, { recursive: true }, (eventType, filename) => {
      if (filename) {
        emitter.emit('change', {
          type: eventType as string,
          file: filename,
          path: path.join(dirPath, filename)
        });
      }
    });

    this.watchers.set(fullPath, watcher);

    watcher.on('error', (error) => {
      emitter.emit('error', error);
    });

    return emitter;
  }

  /**
   * Delete file or directory
   */
  async delete(filePath: string): Promise<void> {
    const fullPath = path.resolve(this.config.workspaceRoot, filePath);
    const relativePath = path.relative(this.config.workspaceRoot, fullPath);

    // Check if ignored
    if (this.isIgnored(relativePath)) {
      throw new Error(`Cannot delete ignored file: ${filePath}`);
    }

    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath);
    }
  }

  /**
   * Check if path exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.resolve(this.config.workspaceRoot, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file tree summary (for LLM context)
   */
  async getTreeSummary(maxDepth: number = 2): Promise<string> {
    const nodes = await this.list('.', maxDepth);
    return this.formatTreeSummary(nodes, '');
  }

  /**
   * Format tree summary as text
   */
  private formatTreeSummary(nodes: FileNode[], prefix: string): string {
    let output = '';
    const lastIndex = nodes.length - 1;

    nodes.forEach((node, index) => {
      const isLast = index === lastIndex;
      const connector = isLast ? '└── ' : '├── ';
      const typeIndicator = node.type === 'directory' ? '/' : '';
      const sizeInfo = node.size ? ` (${this.formatBytes(node.size)})` : '';

      output += `${prefix}${connector}${node.name}${typeIndicator}${sizeInfo}\n`;

      if (node.children && node.children.length > 0) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        output += this.formatTreeSummary(node.children, childPrefix);
      }
    });

    return output;
  }

  /**
   * Close all watchers and cleanup
   */
  close(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}

export function createFileSystemService(config: FileSystemConfig): FileAPI {
  return new FileSystemService(config);
}

export const DEFAULT_FS_CONFIG = {
  maxFileSize: 10 * 1024 * 1024,
  useGitIgnore: true,
  ignorePatterns: ['*.log', '*.tmp', '.cache/', 'dist/', 'build/']
};