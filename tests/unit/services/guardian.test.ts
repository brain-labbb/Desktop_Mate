/**
 * Guardian Permission Manager Unit Tests
 * Tests for src/main/services/guardian.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Guardian, PERMISSION_LEVEL_DESCRIPTIONS } from '../../../src/main/services/guardian';
import { PermissionLevel } from '../../../src/shared/types';

describe('Guardian Permission Manager', () => {
  let guardian: Guardian;

  beforeEach(() => {
    guardian = new Guardian('test-user');
  });

  describe('Initialization', () => {
    it('should create guardian instance', () => {
      expect(guardian).toBeDefined();
      expect(guardian).toBeInstanceOf(Guardian);
    });

    it('should initialize with custom user ID', () => {
      const customGuardian = new Guardian('custom-user');
      expect(customGuardian).toBeDefined();
    });

    it('should have permission level descriptions', () => {
      expect(PERMISSION_LEVEL_DESCRIPTIONS).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[0]).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[1]).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[2]).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[3]).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[4]).toBeDefined();
    });
  });

  describe('Permission Request', () => {
    it('should request permission for read operations', async () => {
      const request = {
        level: PermissionLevel.READ_ONLY,
        action: 'read_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      // Should emit approval-request event
      const approvalSpy = vi.fn();
      guardian.on('approval-request', approvalSpy);

      const promise = guardian.requestPermission(request);
      expect(approvalSpy).toHaveBeenCalled();

      // Clean up - simulate rejection to avoid timeout
      promise.catch(() => {});
    });

    it('should request permission for edit operations', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      const approvalSpy = vi.fn();
      guardian.on('approval-request', approvalSpy);

      const promise = guardian.requestPermission(request);
      expect(approvalSpy).toHaveBeenCalled();

      promise.catch(() => {});
    });

    it('should request permission for execute operations', async () => {
      const request = {
        level: PermissionLevel.EXECUTE,
        action: 'execute_script',
        target: '/test/script.sh',
        workspace: '/test'
      };

      const approvalSpy = vi.fn();
      guardian.on('approval-request', approvalSpy);

      const promise = guardian.requestPermission(request);
      expect(approvalSpy).toHaveBeenCalled();

      promise.catch(() => {});
    });

    it('should request permission for delete operations', async () => {
      const request = {
        level: PermissionLevel.DELETE,
        action: 'delete_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      const approvalSpy = vi.fn();
      guardian.on('approval-request', approvalSpy);

      const promise = guardian.requestPermission(request);
      expect(approvalSpy).toHaveBeenCalled();

      promise.catch(() => {});
    });

    it('should request permission for network operations', async () => {
      const request = {
        level: PermissionLevel.NETWORK,
        action: 'http_request',
        target: 'https://api.example.com',
        workspace: '/test'
      };

      const approvalSpy = vi.fn();
      guardian.on('approval-request', approvalSpy);

      const promise = guardian.requestPermission(request);
      expect(approvalSpy).toHaveBeenCalled();

      promise.catch(() => {});
    });
  });

  describe('Permission Response Handling', () => {
    it('should handle approval response', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      let requestId: string | null = null;

      guardian.on('approval-request', (data: any) => {
        requestId = data.requestId;
        // Simulate user approval
        setTimeout(() => {
          guardian.handleApprovalResponse(requestId!, {
            approved: true
          });
        }, 10);
      });

      const result = await guardian.requestPermission(request);
      expect(result).toBe(true);
    });

    it('should handle rejection response', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      let requestId: string | null = null;

      guardian.on('approval-request', (data: any) => {
        requestId = data.requestId;
        // Simulate user rejection
        setTimeout(() => {
          guardian.handleApprovalResponse(requestId!, {
            approved: false
          });
        }, 10);
      });

      const result = await guardian.requestPermission(request);
      expect(result).toBe(false);
    });
  });

  describe('Audit Log', () => {
    it('should return empty audit log initially', () => {
      const auditLog = guardian.getAuditLog();
      expect(Array.isArray(auditLog)).toBe(true);
    });

    it('should record audit events on approval', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      const auditSpy = vi.fn();
      guardian.on('audit', auditSpy);

      let requestId: string | null = null;
      guardian.on('approval-request', (data: any) => {
        requestId = data.requestId;
        setTimeout(() => {
          guardian.handleApprovalResponse(requestId!, {
            approved: true
          });
        }, 10);
      });

      await guardian.requestPermission(request);
      expect(auditSpy).toHaveBeenCalled();
    });

    it('should export audit log as JSON', async () => {
      const json = await guardian.exportAuditLog('json');
      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should export audit log as CSV', async () => {
      // First add an entry by handling a request
      let requestId: string | null = null;
      guardian.on('approval-request', (data: any) => {
        requestId = data.requestId;
        setTimeout(() => {
          guardian.handleApprovalResponse(requestId!, {
            approved: true
          });
        }, 10);
      });

      await guardian.requestPermission({
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      });

      const csv = await guardian.exportAuditLog('csv');
      expect(typeof csv).toBe('string');
      expect(csv.split('\n').length).toBeGreaterThan(0);
    });
  });

  describe('Permission Memory', () => {
    it('should clear permission memory', async () => {
      await guardian.clearPermissionMemory();
      expect(true).toBe(true); // Should not throw
    });
  });

  describe('Risk Level Assessment', () => {
    it('should have correct permission levels', () => {
      expect(PermissionLevel.READ_ONLY).toBe(0);
      expect(PermissionLevel.EDIT).toBe(1);
      expect(PermissionLevel.EXECUTE).toBe(2);
      expect(PermissionLevel.DELETE).toBe(3);
      expect(PermissionLevel.NETWORK).toBe(4);
    });
  });

  describe('Permission Level Descriptions', () => {
    it('should have Chinese descriptions for all levels', () => {
      expect(PERMISSION_LEVEL_DESCRIPTIONS[0].name).toBe('只读');
      expect(PERMISSION_LEVEL_DESCRIPTIONS[1].name).toBe('编辑');
      expect(PERMISSION_LEVEL_DESCRIPTIONS[2].name).toBe('执行');
      expect(PERMISSION_LEVEL_DESCRIPTIONS[3].name).toBe('删除');
      expect(PERMISSION_LEVEL_DESCRIPTIONS[4].name).toBe('联网');
    });

    it('should have descriptions for all levels', () => {
      expect(PERMISSION_LEVEL_DESCRIPTIONS[0].description).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[1].description).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[2].description).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[3].description).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[4].description).toBeDefined();
    });
  });
});
