import React from 'react';
import './PermissionDialog.css';

export interface PermissionRequestData {
  requestId: string;
  operation: string;
  target: string;
  level: 'read' | 'edit' | 'execute' | 'delete' | 'network';
  reason?: string;
}

interface PermissionDialogProps {
  request: PermissionRequestData;
  onApprove: () => void;
  onDeny: () => void;
}

const levelLabels: Record<string, string> = {
  read: '读取',
  edit: '编辑',
  execute: '执行',
  delete: '删除',
  network: '网络'
};

const levelColors: Record<string, string> = {
  read: '#4ec9b0',
  edit: '#569cd6',
  execute: '#dcdcaa',
  delete: '#f14c4c',
  network: '#ce9178'
};

export default function PermissionDialog({ request, onApprove, onDeny }: PermissionDialogProps) {
  return (
    <div className="permission-overlay">
      <div className="permission-dialog">
        <div className="permission-header">
          <h2>权限请求</h2>
          <span className="permission-level" style={{ color: levelColors[request.level] }}>
            {levelLabels[request.level]}
          </span>
        </div>

        <div className="permission-body">
          <div className="permission-info">
            <div className="permission-row">
              <span className="permission-label">操作:</span>
              <span className="permission-value">{request.operation}</span>
            </div>
            <div className="permission-row">
              <span className="permission-label">目标:</span>
              <span className="permission-value permission-target">{request.target}</span>
            </div>
            {request.reason && (
              <div className="permission-row">
                <span className="permission-label">原因:</span>
                <span className="permission-value">{request.reason}</span>
              </div>
            )}
          </div>

          <p className="permission-warning">
            请仔细检查此请求。只批准你信任的操作。
          </p>
        </div>

        <div className="permission-footer">
          <button className="permission-btn deny-btn" onClick={onDeny}>
            拒绝
          </button>
          <button className="permission-btn approve-btn" onClick={onApprove}>
            批准
          </button>
        </div>
      </div>
    </div>
  );
}
