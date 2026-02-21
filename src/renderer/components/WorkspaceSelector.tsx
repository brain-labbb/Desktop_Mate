import React from 'react';
import './WorkspaceSelector.css';

interface WorkspaceSelectorProps {
  onSelect: (path: string) => void;
  currentWorkspace?: string | null;
}

export default function WorkspaceSelector({ onSelect, currentWorkspace }: WorkspaceSelectorProps) {
  const handleFolderSelect = async () => {
    try {
      const result = await (window as any).electronAPI.workspace.selectFolder();
      if (result) {
        onSelect(result);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  // 获取文件夹名称
  const getFolderName = (path: string) => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="workspace-selector">
      {currentWorkspace ? (
        <div className="workspace-info">
          <span className="workspace-path" title={currentWorkspace}>
            📁 {getFolderName(currentWorkspace)}
          </span>
          <button
            className="change-button"
            onClick={handleFolderSelect}
          >
            更换
          </button>
        </div>
      ) : (
        <button
          className="select-button"
          onClick={handleFolderSelect}
        >
          选择工作区
        </button>
      )}
    </div>
  );
}
