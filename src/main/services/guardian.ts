/**
 * Guardian - Permission Management Service
 * F-17: Human-in-the-loop approval system
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { PermissionLevel } from '../../shared/types';
import type { PermissionRequest, AuditLogEntry } from '../../shared/types';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export class Guardian extends EventEmitter {
  private currentUserId: string;
  private auditLog: AuditLogEntry[] = [];
  private auditLogPath: string;
  private permissionMemory: Map<string, boolean> = new Map();
  private auditLogInitialized: boolean = false;

  constructor(userId: string, auditLogPath?: string) {
    super();
    this.currentUserId = userId || 'default_user';
    this.auditLogPath = auditLogPath || '';

    // Initialize audit log from file if path is provided
    if (this.auditLogPath) {
      this.loadAuditLog().catch((error) => {
        console.warn('Failed to load audit log:', error);
      });
    }
  }

  /**
   * Load audit log from file
   */
  private async loadAuditLog(): Promise<void> {
    if (!this.auditLogPath || this.auditLogInitialized) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.auditLogPath);
      await fs.mkdir(dir, { recursive: true });

      // Check if file exists
      const exists = await fs.access(this.auditLogPath).then(() => true).catch(() => false);
      if (!exists) {
        this.auditLogInitialized = true;
        return;
      }

      // Read and parse audit log
      const content = await fs.readFile(this.auditLogPath, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (line.trim()) {
          try {
            const entry = JSON.parse(line) as AuditLogEntry;
            this.auditLog.push(entry);
          } catch (error) {
            console.warn('Failed to parse audit log entry:', error);
          }
        }
      }

      this.auditLogInitialized = true;
      console.log(`Loaded ${this.auditLog.length} audit entries from ${this.auditLogPath}`);
    } catch (error) {
      console.warn('Failed to load audit log:', error);
      this.auditLogInitialized = true;
    }
  }

  /**
   * Append audit entry to file (JSONL format - one JSON per line)
   */
  private async appendAuditToFile(entry: AuditLogEntry): Promise<void> {
    if (!this.auditLogPath) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.auditLogPath);
      await fs.mkdir(dir, { recursive: true });

      // Append entry as a new line (JSONL format for better performance)
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.auditLogPath, line, 'utf-8');
    } catch (error) {
      console.error('Failed to write audit log entry:', error);
    }
  }

  /**
   * Ensure audit log is loaded before operations
   */
  private async ensureAuditLogLoaded(): Promise<void> {
    if (!this.auditLogInitialized) {
      await this.loadAuditLog();
    }
  }

  async requestPermission(request: PermissionRequest): Promise<boolean> {
    await this.ensureAuditLogLoaded();

    const requestId = uuidv4();

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.removeListener(`approval:${requestId}`, handler);
        void this.recordAudit(request, false, 'timeout');
        resolve(false);
      }, 300000);

      const handler = (response: any) => {
        clearTimeout(timeout);
        this.removeListener(`approval:${requestId}`, handler);
        void this.recordAudit(request, response.approved, response.notes);
        resolve(response.approved);
      };

      this.once(`approval:${requestId}`, handler);
      this.emit('approval-request', { requestId, request });
    });
  }

  handleApprovalResponse(requestId: string, response: any): void {
    this.emit(`approval:${requestId}`, response);
  }

  private async recordAudit(request: PermissionRequest, approved: boolean, notes?: string): Promise<void> {
    await this.ensureAuditLogLoaded();

    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      user_id: this.currentUserId,
      workspace: request.workspace || 'unknown',
      action: request.action,
      target: request.target,
      approved_by: approved ? this.currentUserId : 'system',
      risk_level: this.getRiskLevel(request.level)
    };

    // Add to in-memory log
    this.auditLog.push(entry);

    // Persist to file
    await this.appendAuditToFile(entry);

    // Emit event
    this.emit('audit', entry);
  }

  private getRiskLevel(level: PermissionLevel): 'low' | 'medium' | 'high' {
    if (level <= 0) return 'low';
    if (level <= 2) return 'medium';
    return 'high';
  }

  async getAuditLog(filters?: { limit?: number }): Promise<AuditLogEntry[]> {
    await this.ensureAuditLogLoaded();

    let log = [...this.auditLog];
    if (filters?.limit) {
      log = log.slice(-filters.limit);
    }
    return log;
  }

  /**
   * Clear audit log (both memory and file)
   */
  async clearAuditLog(): Promise<void> {
    this.auditLog = [];

    if (this.auditLogPath) {
      try {
        await fs.unlink(this.auditLogPath);
      } catch (error) {
        // File might not exist, ignore
      }
    }
  }

  async exportAuditLog(format: 'json' | 'csv'): Promise<string> {
    await this.ensureAuditLogLoaded();

    if (format === 'json') {
      return JSON.stringify(this.auditLog, null, 2);
    } else {
      // CSV format - proper escaping
      if (this.auditLog.length === 0) {
        return '';
      }

      const headers = Object.keys(this.auditLog[0]);
      const headerRow = headers.join(',');

      const rows = this.auditLog.map(entry => {
        return headers.map(header => {
          const value = (entry as any)[header];
          // Escape quotes and wrap in quotes if contains comma
          const stringValue = String(value ?? '');
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',');
      });

      return [headerRow, ...rows].join('\n');
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
