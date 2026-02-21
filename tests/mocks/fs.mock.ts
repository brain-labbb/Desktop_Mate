/**
 * File System Mock Data and Utilities
 */

import { vi } from 'vitest';
import type { FileNode } from '../src/shared/types';

/** Mock file system structure */
export const mockFileSystem = new Map<string, {
  content: string;
  isDirectory: boolean;
  mtime: number;
}>();

/** Initialize mock file system */
export function initMockFileSystem(): void {
  mockFileSystem.clear();

  // Root directory
  mockFileSystem.set('.', {
    content: '',
    isDirectory: true,
    mtime: Date.now()
  });

  // Common files
  mockFileSystem.set('package.json', {
    content: JSON.stringify({
      name: 'test-project',
      version: '1.0.0'
    }, null, 2),
    isDirectory: false,
    mtime: Date.now()
  });

  mockFileSystem.set('README.md', {
    content: '# Test Project\n\nThis is a test project.',
    isDirectory: false,
    mtime: Date.now()
  });

  // src directory
  mockFileSystem.set('src', {
    content: '',
    isDirectory: true,
    mtime: Date.now()
  });

  mockFileSystem.set('src/index.ts', {
    content: 'console.log("Hello, world!");',
    isDirectory: false,
    mtime: Date.now()
  });

  // .gitignore
  mockFileSystem.set('.gitignore', {
    content: 'node_modules/\n.env\n*.log\n',
    isDirectory: false,
    mtime: Date.now()
  });

  // Binary file (for testing)
  mockFileSystem.set('test.bin', {
    content: '\x00\x01\x02\x03',
    isDirectory: false,
    mtime: Date.now()
  });

  // Large file (>10MB)
  mockFileSystem.set('large.txt', {
    content: 'x'.repeat(11 * 1024 * 1024), // 11MB
    isDirectory: false,
    mtime: Date.now()
  });

  // Sensitive files
  mockFileSystem.set('.env', {
    content: 'API_KEY=secret123',
    isDirectory: false,
    mtime: Date.now()
  });

  mockFileSystem.set('id_rsa', {
    content: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
    isDirectory: false,
    mtime: Date.now()
  });
}

/** Mock FileNode tree */
export const mockFileTree: FileNode[] = [
  {
    id: '1',
    name: 'src',
    path: 'src',
    type: 'directory',
    mtime: Date.now(),
    children: [
      {
        id: '2',
        name: 'index.ts',
        path: 'src/index.ts',
        type: 'file',
        size: 100,
        mtime: Date.now()
      }
    ]
  },
  {
    id: '3',
    name: 'package.json',
    path: 'package.json',
    type: 'file',
    size: 500,
    mtime: Date.now()
  },
  {
    id: '4',
    name: 'README.md',
    path: 'README.md',
    type: 'file',
    size: 200,
    mtime: Date.now()
  }
];

/** Mock file watcher emitter */
export const mockFileWatcher = {
  on: vi.fn(),
  emit: vi.fn(),
  close: vi.fn()
};

/** Get mock file content */
export function getMockFileContent(path: string): string {
  const file = mockFileSystem.get(path);
  if (!file || file.isDirectory) {
    throw new Error(`File not found: ${path}`);
  }
  return file.content;
}

/** Set mock file content */
export function setMockFileContent(path: string, content: string): void {
  const existing = mockFileSystem.get(path);
  if (existing) {
    existing.content = content;
    existing.mtime = Date.now();
  } else {
    mockFileSystem.set(path, {
      content,
      isDirectory: false,
      mtime: Date.now()
    });
  }
}
