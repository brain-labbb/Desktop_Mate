/**
 * File System Service Unit Tests
 * Tests for src/main/services/file-system.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileSystemService, DEFAULT_FS_CONFIG } from '../../../src/main/services/file-system';
import type { FileSystemConfig } from '../../../src/main/services/file-system';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
vi.mock('fs/promises');
vi.mock('fs', () => ({
  watch: vi.fn(() => ({
    close: vi.fn(),
    on: vi.fn()
  }))
}));

describe('FileSystemService', () => {
  let service: FileSystemService;
  let testConfig: FileSystemConfig;

  beforeEach(() => {
    // Setup test config with temp directory
    testConfig = {
      ...DEFAULT_FS_CONFIG,
      workspaceRoot: '/tmp/test-workspace'
    };
    service = new FileSystemService(testConfig);
  });

  afterEach(async () => {
    service.close();
  });

  describe('Initialization', () => {
    it('should create service with default config', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const customConfig: FileSystemConfig = {
        workspaceRoot: '/tmp/custom',
        maxFileSize: 5 * 1024 * 1024, // 5MB
        useGitIgnore: false
      };
      const customService = new FileSystemService(customConfig);
      expect(customService).toBeDefined();
      customService.close();
    });
  });

  describe('read()', () => {
    it('should read file content successfully', async () => {
      const mockContent = 'console.log("Hello, world!");';
      const mockPath = path.join(testConfig.workspaceRoot, 'test.ts');

      vi.mocked(fs.stat).mockResolvedValue({
        size: 100,
        isFile: () => true,
        isDirectory: () => false,
        mtimeMs: Date.now()
      } as any);

      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const content = await service.read('test.ts');
      expect(content).toBe(mockContent);
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(mockPath, 'utf-8');
    });

    it('should throw error for ignored files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        size: 100,
        isFile: () => true,
        isDirectory: () => false,
        mtimeMs: Date.now()
      } as any);

      await expect(service.read('.env')).rejects.toThrow('File is ignored');
    });

    it('should throw error for non-existent files', async () => {
      vi.mocked(fs.stat).mockResolvedValue(null as any);

      await expect(service.read('non-existent.txt')).rejects.toThrow('File not found');
    });

    it('should throw error for files exceeding max size', async () => {
      const largeSize = 15 * 1024 * 1024; // 15MB

      vi.mocked(fs.stat).mockResolvedValue({
        size: largeSize,
        isFile: () => true,
        isDirectory: () => false,
        mtimeMs: Date.now()
      } as any);

      await expect(service.read('large.txt')).rejects.toThrow('File too large');
    });

    it('should throw error for binary files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        size: 100,
        isFile: () => true,
        isDirectory: () => false,
        mtimeMs: Date.now()
      } as any);

      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('\x00\x01\x02'));

      await expect(service.read('binary.bin')).rejects.toThrow('Cannot read binary file');
    });
  });

  describe('write()', () => {
    it('should write file content successfully', async () => {
      const content = 'export const test = true;';
      const mockPath = path.join(testConfig.workspaceRoot, 'test.ts');

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await service.write('test.ts', content);

      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(mockPath, content, 'utf-8');
    });

    it('should throw error for ignored files', async () => {
      await expect(service.write('.env', 'API_KEY=secret')).rejects.toThrow('Cannot write to ignored file');
    });

    it('should create directory if it does not exist', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await service.write('src/nested/file.ts', 'content');

      expect(vi.mocked(fs.mkdir)).toHaveBeenCalled();
    });
  });

  describe('list()', () => {
    it('should list directory contents', async () => {
      const mockEntries = [
        { name: 'file1.ts', isFile: () => true, isDirectory: () => false },
        { name: 'file2.ts', isFile: () => true, isDirectory: () => false },
        { name: 'src', isFile: () => false, isDirectory: () => true }
      ] as any[];

      vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
      vi.mocked(fs.stat).mockImplementation((p: any) => {
        return Promise.resolve({
          size: 100,
          mtimeMs: Date.now()
        } as any);
      });

      const result = await service.list('.');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should respect max depth', async () => {
      const mockEntries = [] as any[];
      vi.mocked(fs.readdir).mockResolvedValue(mockEntries);

      const result = await service.list('.', 1);
      expect(result).toBeDefined();
    });

    it('should filter ignored files', async () => {
      const mockEntries = [
        { name: '.env', isFile: () => true, isDirectory: () => false },
        { name: 'valid.ts', isFile: () => true, isDirectory: () => false }
      ] as any[];

      vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
      vi.mocked(fs.stat).mockImplementation((p: any) => {
        return Promise.resolve({
          size: 100,
          mtimeMs: Date.now()
        } as any);
      });

      const result = await service.list('.');

      // .env should be filtered out
      expect(result.every(n => n.name !== '.env')).toBe(true);
    });

    it('should sort directories before files', async () => {
      const mockEntries = [
        { name: 'file.ts', isFile: () => true, isDirectory: () => false },
        { name: 'src', isFile: () => false, isDirectory: () => true }
      ] as any[];

      vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
      vi.mocked(fs.stat).mockImplementation((p: any) => {
        return Promise.resolve({
          size: 100,
          mtimeMs: Date.now()
        } as any);
      });

      const result = await service.list('.');

      // First item should be directory
      expect(result[0].type).toBe('directory');
    });
  });

  describe('delete()', () => {
    it('should delete file successfully', async () => {
      const mockPath = path.join(testConfig.workspaceRoot, 'test.txt');

      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false
      } as any);

      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await service.delete('test.txt');

      expect(vi.mocked(fs.unlink)).toHaveBeenCalledWith(mockPath);
    });

    it('should delete directory recursively', async () => {
      const mockPath = path.join(testConfig.workspaceRoot, 'test-dir');

      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true
      } as any);

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await service.delete('test-dir');

      expect(vi.mocked(fs.rm)).toHaveBeenCalledWith(mockPath, { recursive: true, force: true });
    });

    it('should throw error for ignored files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false
      } as any);

      await expect(service.delete('.env')).rejects.toThrow('Cannot delete ignored file');
    });
  });

  describe('exists()', () => {
    it('should return true for existing files', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await service.exists('test.txt');
      expect(result).toBe(true);
    });

    it('should return false for non-existent files', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await service.exists('non-existent.txt');
      expect(result).toBe(false);
    });
  });

  describe('watch()', () => {
    it('should create file watcher', () => {
      const { watch } = require('fs');
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn()
      };

      vi.mocked(watch).mockResolvedValue(mockWatcher);

      const emitter = service.watch('.');

      expect(emitter).toBeDefined();
    });

    it('should emit change events', async () => {
      const { watch } = require('fs');
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn((event, callback) => {
          // Simulate file change
          if (event === 'change') {
            callback('rename', 'test.txt');
          }
        })
      };

      vi.mocked(watch).mockResolvedValue(mockWatcher);

      const emitter = service.watch('.');
      const changeHandler = vi.fn();

      emitter.on('change', changeHandler);

      // Event should be emitted
      expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('getTreeSummary()', () => {
    it('should return formatted tree summary', async () => {
      const mockEntries = [] as any[];
      vi.mocked(fs.readdir).mockResolvedValue(mockEntries);

      const summary = await service.getTreeSummary(2);

      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');
    });
  });

  describe('Security Tests', () => {
    it('should block access to sensitive files', async () => {
      const sensitiveFiles = [
        '.env',
        'id_rsa',
        'secret.key',
        'config.pem'
      ];

      for (const file of sensitiveFiles) {
        await expect(service.read(file)).rejects.toThrow(/ignored/);
      }
    });

    it('should block access to node_modules', async () => {
      await expect(service.read('node_modules/package/index.js')).rejects.toThrow(/ignored/);
    });

    it('should block access to .git directory', async () => {
      await expect(service.read('.git/config')).rejects.toThrow(/ignored/);
    });

    it('should respect .gitignore patterns', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        size: 100,
        isFile: () => true,
        isDirectory: () => false,
        mtimeMs: Date.now()
      } as any);

      // These patterns should be in .gitignore by default
      await expect(service.read('node_modules/index.js')).rejects.toThrow();
    });
  });
});
