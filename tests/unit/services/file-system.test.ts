/**
 * File System Service Unit Tests
 * Tests for src/main/services/file-system.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileSystemService, DEFAULT_FS_CONFIG } from '../../../src/main/services/file-system';
import type { FileSystemConfig } from '../../../src/main/services/file-system';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

// Mock fs/promises
vi.mock('node:fs/promises');
vi.mock('node:fs', () => ({
  watch: vi.fn(() => ({
    close: vi.fn(),
    on: vi.fn()
  }))
}));

describe('FileSystemService', () => {
  let service: FileSystemService;
  let testConfig: FileSystemConfig;

  beforeEach(() => {
    // Setup test config
    testConfig = {
      workspaceRoot: '/tmp/test-workspace',
      maxFileSize: 10 * 1024 * 1024,
      useGitIgnore: false
    };
    service = new FileSystemService(testConfig);
  });

  afterEach(() => {
    service.close();
  });

  describe('Initialization', () => {
    it('should create service with config', () => {
      expect(service).toBeDefined();
    });

    it('should have default config available', () => {
      expect(DEFAULT_FS_CONFIG).toBeDefined();
      expect(DEFAULT_FS_CONFIG.maxFileSize).toBe(10 * 1024 * 1024);
    });
  });

  describe('read()', () => {
    it('should throw error for ignored files', async () => {
      await expect(service.read('.env')).rejects.toThrow();
    });

    it('should throw error for non-existent files', async () => {
      vi.mocked(fs.stat).mockResolvedValue(null as any);
      await expect(service.read('non-existent.txt')).rejects.toThrow();
    });

    it('should throw error for large files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        size: 15 * 1024 * 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);

      await expect(service.read('large.txt')).rejects.toThrow();
    });

    it('should throw error for binary files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        size: 100,
        isFile: () => true,
        isDirectory: () => false
      } as any);

      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('\x00\x01\x02'));

      await expect(service.read('binary.bin')).rejects.toThrow();
    });
  });

  describe('write()', () => {
    it('should throw error for ignored files', async () => {
      await expect(service.write('.env', 'API_KEY=secret')).rejects.toThrow();
    });

    it('should throw error for node_modules', async () => {
      await expect(service.write('node_modules/test.js', 'test')).rejects.toThrow();
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
      vi.mocked(fs.stat).mockImplementation(() => {
        return Promise.resolve({
          size: 100,
          isFile: () => true,
          isDirectory: () => false
        } as any);
      });

      const result = await service.list('.');
      expect(result).toBeDefined();
    });

    it('should filter ignored files', async () => {
      const mockEntries = [
        { name: '.env', isFile: () => true, isDirectory: () => false },
        { name: 'valid.ts', isFile: () => true, isDirectory: () => false }
      ] as any[];

      vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
      vi.mocked(fs.stat).mockImplementation(() => {
        return Promise.resolve({
          size: 100,
          isFile: () => true,
          isDirectory: () => false
        } as any);
      });

      const result = await service.list('.');
      // .env should be filtered out
      expect(result.every(n => n.name !== '.env')).toBe(true);
    });
  });

  describe('delete()', () => {
    it('should throw error for ignored files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false
      } as any);

      await expect(service.delete('.env')).rejects.toThrow();
    });

    it('should throw error for node_modules', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false
      } as any);

      await expect(service.delete('node_modules/file')).rejects.toThrow();
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

  describe('Security Tests', () => {
    it('should block access to sensitive files', async () => {
      const sensitiveFiles = [
        '.env',
        'id_rsa',
        'secret.key',
        'config.pem',
        'node_modules/index.js',
        '.git/config'
      ];

      for (const file of sensitiveFiles) {
        await expect(service.read(file)).rejects.toThrow();
      }
    });

    it('should block writing to sensitive files', async () => {
      const sensitiveFiles = [
        '.env',
        'id_rsa',
        '.git/config'
      ];

      for (const file of sensitiveFiles) {
        await expect(service.write(file, 'test')).rejects.toThrow();
      }
    });

    it('should block deleting sensitive files', async () => {
      const sensitiveFiles = [
        '.env',
        '.git',
        'node_modules'
      ];

      for (const file of sensitiveFiles) {
        vi.mocked(fs.stat).mockResolvedValue({
          isDirectory: () => false
        } as any);
        await expect(service.delete(file)).rejects.toThrow();
      }
    });
  });
});
