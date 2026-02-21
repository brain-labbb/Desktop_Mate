import React from 'react';
import './MessageList.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  steps?: AgentStep[];
  attachments?: AttachedFile[];
}

interface AttachedFile {
  id: string;
  name: string;
  path: string;
  size: number;
}

interface AgentStep {
  type: 'thought' | 'tool_call' | 'observation' | 'final_answer';
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  toolResults?: Array<{ id: string; result: any }>;
  timestamp: number;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  agentSteps?: AgentStep[];
}

export default function MessageList({ messages, isLoading, agentSteps = [] }: MessageListProps) {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [expandedSteps, setExpandedSteps] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, agentSteps]);

  // 过滤掉 final_answer 类型的步骤
  const filterSteps = (steps: AgentStep[]) => {
    return steps.filter(step => step.type !== 'final_answer');
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 文件附件预览组件
  const AttachmentPreview = ({ attachments }: { attachments: AttachedFile[] }) => {
    return (
      <div className="message-attachments">
        {attachments.map(file => (
          <div key={file.id} className="message-attachment">
            <span className="attachment-icon">📎</span>
            <span className="attachment-name">{file.name}</span>
            <span className="attachment-size">{formatFileSize(file.size)}</span>
          </div>
        ))}
      </div>
    );
  };

  // 切换步骤展开/折叠状态
  const toggleSteps = (messageId: string) => {
    setExpandedSteps(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const renderContent = (content: string) => {
    // 简单的 Markdown 渲染
    // TODO: 集成完整的 Markdown 库
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('```')) {
        return <pre key={i} className="code-block">{line}</pre>;
      }
      if (line.startsWith('# ')) {
        return <h3 key={i}>{line.substring(2)}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h4 key={i}>{line.substring(3)}</h4>;
      }
      if (line.startsWith('- ')) {
        return <li key={i}>{line.substring(2)}</li>;
      }
      return <p key={i}>{line || '\u00A0'}</p>;
    });
  };

  const renderAgentStep = (step: AgentStep, index: number) => {
    const stepIcons = {
      thought: '💭',
      tool_call: '🔧',
      observation: '👁️',
      final_answer: '✅'
    };

    // 获取步骤状态图标
    const getStatusIcon = () => {
      switch (step.status) {
        case 'pending': return '⏳';
        case 'in_progress': return '🔄';
        case 'completed': return '✅';
        case 'failed': return '❌';
        default: return '';
      }
    };

    // 简化步骤描述 - 只显示 computer 干了什么
    const getStepDescription = () => {
      switch (step.type) {
        case 'tool_call':
          return step.toolCalls?.map(call => `调用工具: ${call.name}`).join(', ') || '执行工具调用';
        case 'observation':
          return step.toolResults?.map(r => r.result.success ? '执行成功' : '执行失败').join(', ') || '观察结果';
        case 'thought':
          return step.content ? step.content.slice(0, 100) + (step.content.length > 100 ? '...' : '') : '思考中...';
        default:
          return step.type.replace('_', ' ');
      }
    };

    return (
      <div key={index} className={`agent-step agent-step-${step.type} agent-step-${step.status || 'default'}`}>
        <div className="step-header">
          <span className="step-icon">{stepIcons[step.type]}</span>
          <span className="step-status">{getStatusIcon()}</span>
          <span className="step-description">{getStepDescription()}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="message-list">
      {messages.map((message) => {
        const filteredSteps = message.steps ? filterSteps(message.steps) : [];
        const isExpanded = expandedSteps[message.id];

        return (
          <div key={message.id} className={`message message-${message.role}`}>
            <div className="message-content">
              {/* Show attachments for user messages */}
              {message.attachments && message.attachments.length > 0 && (
                <AttachmentPreview attachments={message.attachments} />
              )}

              {/* Show steps for assistant messages - BEFORE the answer */}
              {filteredSteps.length > 0 && (
                <div className="message-steps">
                  <div className="steps-header" onClick={() => toggleSteps(message.id)}>
                    <span className="steps-toggle">{isExpanded ? '▼' : '▶'}</span>
                    <span>📋 执行步骤 ({filteredSteps.length})</span>
                  </div>
                  {isExpanded && (
                    <div className="steps-list">
                      {filteredSteps.map((step, index) => renderAgentStep(step, index))}
                    </div>
                  )}
                </div>
              )}

              {/* Answer content */}
              {renderContent(message.content)}
            </div>
            <div className="message-time">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          </div>
        );
      })}

      {/* Show real-time agent steps when loading */}
      {isLoading && agentSteps.length > 0 && (
        <div className="agent-steps-live">
          <div className="steps-header">🔄 正在执行... ({filterSteps(agentSteps).length} 步)</div>
          <div className="steps-list">
            {filterSteps(agentSteps).map((step, index) => renderAgentStep(step, index))}
          </div>
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}

      {isLoading && agentSteps.length === 0 && (
        <div className="message message-assistant">
          <div className="message-content typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
