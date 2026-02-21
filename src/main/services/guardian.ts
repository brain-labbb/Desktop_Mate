/**
 * Guardian - Permission Management Service
 * F-17: Human-in-the-loop approval system
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { PermissionLevel } from '../../shared/types';
import type { PermissionRequest, AuditLogEntry } from '../../shared/types';

export class Guardian extends EventEmitter {
  private currentUserId: string;
  private auditLog: AuditLogEntry[] = [];
  private auditLogPath: string;
  private permissionMemory: Map<string, boolean> = new Map();

  constructor(userId: string, auditLogPath?: string) {
    super();
    this.currentUserId = userId || 'default_user';
    this.auditLogPath = auditLogPath || '';
  }

  async requestPermission(request: PermissionRequest): Promise<boolean> {
    const requestId = uuidv4();

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.removeListener(`approval:${requestId}`, handler);
        this.recordAudit(request, false, 'timeout');
        resolve(false);
      }, 300000);

      const handler = (response: any) => {
        clearTimeout(timeout);
        this.removeListener(`approval:${requestId}`, handler);
        this.recordAudit(request, response.approved, response.notes);
        resolve(response.approved);
      };

      this.once(`approval:${requestId}`, handler);
      this.emit('approval-request', { requestId, request });
    });
  }

  handleApprovalResponse(requestId: string, response: any): void {
    this.emit(`approval:${requestId}`, response);
  }

  private recordAudit(request: PermissionRequest, approved: boolean, notes?: string): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      user_id: this.currentUserId,
      workspace: request.workspace || 'unknown',
      action: request.action,
      target: request.target,
      approved_by: approved ? this.currentUserId : 'system',
      risk_level: this.getRiskLevel(request.level)
    };
    this.auditLog.push(entry);
    this.emit('audit', entry);
  }

  private getRiskLevel(level: PermissionLevel): 'low' | 'medium' | 'high' {
    if (level <= 0) return 'low';
    if (level <= 2) return 'medium';
    return 'high';
  }

  getAuditLog(filters?: { limit?: number }): AuditLogEntry[] {
    let log = [...this.auditLog];
    if (filters?.limit) {
      log = log.slice(-filters.limit);
    }
    return log;
  }

  async exportAuditLog(format: 'json' | 'csv'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify(this.auditLog, null, 2);
    } else {
      // CSV format
      const headers = Object.keys(this.auditLog[0] || {}).join(',');
      const rows = this.auditLog.map(entry => Object.values(entry).join(','));
      return [headers, ...rows].join('\n');
    }
  }

  async clearPermissionMemory(): Promise<void> {
    // Clear permissions
    this.permissionMemory.clear();
  }
}

export const PERMISSION_LEVEL_DESCRIPTIONS = {
  0: { name: '只读', description: '读取文件、搜索代码' },
  1: { name: '编辑', description: '创建/修改文件' },
  2: { name: '执行', description: '运行脚本、调用工具' },
  3: { name: '删除', description: '删除文件、清空目录' },
  4: { name: '联网', description: '发送HTTP请求、Git Push' }
};
