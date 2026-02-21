/**
 * Test setup file
 * Runs before each test suite
 */

import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Electron API
global.window.electronAPI = {
  fs: {
    read: vi.fn(),
    write: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    watch: vi.fn()
  },
  guardian: {
    requestPermission: vi.fn(),
    getAuditLog: vi.fn(),
    exportAuditLog: vi.fn(),
    clearPermissionMemory: vi.fn(),
    clearAuditLog: vi.fn()
  },
  llm: {
    generate: vi.fn(),
    generateStream: vi.fn(),
    updateConfig: vi.fn(),
    getConfig: vi.fn(),
    storeKey: vi.fn(),
    getKey: vi.fn(),
    deleteKey: vi.fn(),
    hasKey: vi.fn()
  },
  workspace: {
    mount: vi.fn(),
    unmount: vi.fn(),
    getCurrent: vi.fn(),
    listRecent: vi.fn()
  }
};

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

global.localStorage = localStorageMock as any;
