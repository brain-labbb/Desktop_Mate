import React, { useState, useRef, useEffect } from 'react';
import ModelSelector, { ModelConfig } from './ModelSelector';
import WorkspaceSelector from './WorkspaceSelector';
import './ChatInput.css';

interface AttachedFile {
  id: string;
  name: string;
  path: string;
  size: number;
}

interface ChatInputProps {
  onSend: (message: string, attachments?: AttachedFile[]) => void;
  disabled?: boolean;
  placeholder?: string;
  onModelChange?: (model: ModelConfig) => void;
  onWorkspaceSelect?: (path: string) => void;
  currentWorkspace?: string | null;
  currentModel?: ModelConfig | null;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "",
  onModelChange,
  onWorkspaceSelect,
  currentWorkspace,
  currentModel
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSelectFile = async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.dialog) {
        const fileData = await electronAPI.dialog.selectFile();
        if (fileData) {
          const newFile: AttachedFile = {
            id: Date.now().toString(),
            name: fileData.name,
            path: fileData.path,
            size: fileData.size
          };
          setAttachments(prev => [...prev, newFile]);
        }
      }
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(file => file.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const newFiles: AttachedFile[] = Array.from(files).map(file => ({
        id: `${Date.now()}-${Math.random()}`,
        name: file.name,
        path: (file as any).path || file.name,
        size: file.size
      }));
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || attachments.length > 0) && !disabled) {
      onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
      setInput('');
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      className={`chat-input-wrapper ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="attachments-container">
          {attachments.map(file => (
            <div key={file.id} className="file-attachment">
              <span className="attachment-icon">📎</span>
              <div className="attachment-info">
                <span className="attachment-name">{file.name}</span>
                <span className="attachment-size">{formatFileSize(file.size)}</span>
              </div>
              <button
                type="button"
                className="file-remove-btn"
                onClick={() => handleRemoveAttachment(file.id)}
                disabled={disabled}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Unified chat input container */}
      <div className="chat-input-container">
        {/* Upper section: Text input */}
        <form className="chat-input-form" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="chat-textarea"
          />
        </form>

        {/* Lower section: All controls */}
        <div className="chat-input-controls">
          {/* Left: Workspace + Attachment */}
          <div className="controls-left">
            <WorkspaceSelector
              onSelect={onWorkspaceSelect || (() => {})}
              currentWorkspace={currentWorkspace}
            />
            <button
              type="button"
              className="attach-button-inline"
              onClick={handleSelectFile}
              disabled={disabled}
              title="附加文件"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          </div>

          {/* Right: Model selector + Send button */}
          <div className="controls-right">
            <ModelSelector onModelChange={onModelChange || (() => {})} />
            <button
              type="submit"
              className="send-button-inline"
              disabled={disabled || (!input.trim() && attachments.length === 0)}
              title="发送"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
