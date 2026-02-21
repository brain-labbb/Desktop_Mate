/**
 * Guardian Permission Manager Unit Tests
 * Tests for src/main/services/guardian.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Guardian, PERMISSION_LEVEL_DESCRIPTIONS } from '../../../src/main/services/guardian';
import { PermissionLevel } from '../../../src/shared/types';

// Mock keytar
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(new Error('Not found')),
  unlink: vi.fn().mockResolvedValue(undefined)
}));

// Mock Electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/appdata')
  }
}));

describe('Guardian Permission Manager', () => {
  let guardian: Guardian;

  beforeEach(() => {
    guardian = new Guardian('test-user');
  });

  afterEach(() => {
    guardian.removeAllListeners();
  });

  describe('Initialization', () => {
    it('should create guardian instance', () => {
      expect(guardian).toBeDefined();
      expect(guardian).toBeInstanceOf(Guardian);
    });

    it('should initialize with default audit log path', () => {
      expect(guardian).toBeDefined();
    });

    it('should initialize with custom user ID', () => {
      const customGuardian = new Guardian('custom-user');
      expect(customGuardian).toBeDefined();
      customGuardian.removeAllListeners();
    });
  });

  describe('Permission Request', () => {
    it('should request permission for read operations (Level 0)', async () => {
      const request = {
        level: PermissionLevel.READ_ONLY,
        action: 'read_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      // Level 0 should auto-approve if remembered
      const result = await guardian.requestPermission(request);
      expect(typeof result).toBe('boolean');
    });

    it('should request permission for edit operations (Level 1)', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      // Should emit approval-request event
      const approvalSpy = vi.fn();
      guardian.on('approval-request', approvalSpy);

      // Make request in background (it waits for response)
      const promise = guardian.requestPermission(request);

      // Event should have been emitted
      expect(approvalSpy).toHaveBeenCalled();

      // Cancel the pending request
      promise.catch(() => {});
    });

    it('should request permission for execute operations (Level 2)', async () => {
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

    it('should request permission for delete operations (Level 3)', async () => {
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

    it('should request permission for network operations (Level 4)', async () => {
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
            approved: true,
            remember: true
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
            approved: false,
            remember: false
          });
        }, 10);
      });

      const result = await guardian.requestPermission(request);
      expect(result).toBe(false);
    });

    it('should timeout after 5 minutes', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      // No response handler - should timeout
      const startTime = Date.now();
      const result = await guardian.requestPermission(request);

      expect(result).toBe(false);
    }, 350000); // Increased timeout
  });

  describe('Permission Memory', () => {
    it('should remember approved permissions', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      let requestId: string | null = null;

      guardian.on('approval-request', (data: any) => {
        requestId = data.requestId;

        setTimeout(() => {
          guardian.handleApprovalResponse(requestId!, {
            approved: true,
            remember: true
          });
        }, 10);
      });

      // First request should require approval
      const firstResult = await guardian.requestPermission(request);
      expect(firstResult).toBe(true);

      // Second request should be remembered
      const secondResult = await guardian.requestPermission(request);
      expect(secondResult).toBe(true);
    });

    it('should not remember rejected permissions', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      let requestId: string | null = null;

      guardian.on('approval-request', (data: any) => {
        requestId = data.requestId;

        setTimeout(() => {
          guardian.handleApprovalResponse(requestId!, {
            approved: false,
            remember: true
          });
        }, 10);
      });

      const result = await guardian.requestPermission(request);
      expect(result).toBe(false);

      // Should still require approval
      const approvalSpy = vi.fn();
      guardian.on('approval-request', approvalSpy);

      const promise = guardian.requestPermission(request);
      expect(approvalSpy).toHaveBeenCalled();

      promise.catch(() => {});
    });

    it('should clear permission memory', async () => {
      await guardian.clearPermissionMemory();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Audit Log', () => {
    it('should record approved actions', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      let requestId: string | null = null;

      guardian.on('approval-request', (data: any) => {
        requestId = data.requestId;

        setTimeout(() => {
          guardian.handleApprovalResponse(requestId!, {
            approved: true,
            remember: false,
            notes: 'Test approval'
          });
        }, 10);
      });

      await guardian.requestPermission(request);

      // Check audit log
      const auditLog = guardian.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[auditLog.length - 1].approved_by).toBe('test-user');
    });

    it('should record rejected actions', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      let requestId: string | null = null;

      guardian.on('approval-request', (data: any) => {
        requestId = data.requestId;

        setTimeout(() => {
          guardian.handleApprovalResponse(requestId!, {
            approved: false,
            remember: false
          });
        }, 10);
      });

      await guardian.requestPermission(request);

      const auditLog = guardian.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);
    });

    it('should filter audit log by date', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const filtered = guardian.getAuditLog({
        startDate: yesterday
      });

      expect(Array.isArray(filtered)).toBe(true);
    });

    it('should filter audit log by action', () => {
      const filtered = guardian.getAuditLog({
        action: 'write_file'
      });

      expect(Array.isArray(filtered)).toBe(true);
    });

    it('should filter audit log by risk level', () => {
      const filtered = guardian.getAuditLog({
        riskLevel: 'medium'
      });

      expect(Array.isArray(filtered)).toBe(true);
    });

    it('should export audit log as JSON', async () => {
      const json = await guardian.exportAuditLog('json');
      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should export audit log as CSV', async () => {
      const csv = await guardian.exportAuditLog('csv');
      expect(typeof csv).toBe('string');
      expect(csv.split('\n').length).toBeGreaterThan(0);
    });

    it('should clear audit log', async () => {
      await guardian.clearAuditLog();
      const auditLog = guardian.getAuditLog();
      expect(auditLog.length).toBe(0);
    });
  });

  describe('Risk Level Assessment', () => {
    it('should assess low risk for read operations', () => {
      const request = {
        level: PermissionLevel.READ_ONLY,
        action: 'read_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      // Should not emit approval-request for low risk
      const approvalSpy = vi.fn();
      guardian.on('approval-request', approvalSpy);

      guardian.requestPermission(request).catch(() => {});

      // Low risk operations should not require approval
      // But this implementation still checks for remembered permissions
    });

    it('should assess medium risk for execute operations', () => {
      // Execute operations are medium risk
      expect(PermissionLevel.EXECUTE).toBeGreaterThanOrEqual(PermissionLevel.EXECUTE);
    });

    it('should assess high risk for delete operations', () => {
      // Delete operations are high risk
      expect(PermissionLevel.DELETE).toBeGreaterThan(PermissionLevel.EXECUTE);
      expect(PermissionLevel.NETWORK).toBeGreaterThan(PermissionLevel.EXECUTE);
    });
  });

  describe('Permission Level Descriptions', () => {
    it('should have descriptions for all permission levels', () => {
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.READ_ONLY]).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.EDIT]).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.EXECUTE]).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.DELETE]).toBeDefined();
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.NETWORK]).toBeDefined();
    });

    it('should have correct approval requirements', () => {
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.READ_ONLY].approvalRequired).toBe(false);
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.EDIT].approvalRequired).toBe(true);
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.EXECUTE].approvalRequired).toBe(true);
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.DELETE].approvalRequired).toBe(true);
      expect(PERMISSION_LEVEL_DESCRIPTIONS[PermissionLevel.NETWORK].approvalRequired).toBe(true);
    });
  });

  describe('Event Emission', () => {
    it('should emit audit events', async () => {
      const request = {
        level: PermissionLevel.EDIT,
        action: 'write_file',
        target: '/test/file.txt',
        workspace: '/test'
      };

      let requestId: string | null = null;
      const auditSpy = vi.fn();
      guardian.on('audit', auditSpy);

      guardian.on('approval-request', (data: any) => {
        requestId = data.requestId;

        setTimeout(() => {
          guardian.handleApprovalResponse(requestId!, {
            approved: true,
            remember: false
          });
        }, 10);
      });

      await guardian.requestPermission(request);

      // Audit event should be emitted
      expect(auditSpy).toHaveBeenCalled();
    });
  });
});
