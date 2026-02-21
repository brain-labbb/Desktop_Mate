import React, { useState, useEffect, useCallback } from 'react';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import PermissionDialog, { PermissionRequestData } from './components/PermissionDialog';
import { ModelConfig } from './components/ModelSelector';
import './styles/App.css';

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

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequestData | null>(null);
  const [currentModel, setCurrentModel] = useState<ModelConfig | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<AgentStep[]>([]);

  // Check if LLM is configured on mount
  useEffect(() => {
    const checkConfiguration = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI && electronAPI.llm) {
          const configured = await electronAPI.llm.isConfigured();
          setIsConfigured(configured);
        }
      } catch (error) {
        console.error('Failed to check LLM configuration:', error);
      }
    };
    checkConfiguration();
  }, []);

  // Subscribe to agent steps
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || !electronAPI.events) {
      return;
    }

    const handleAgentStep = (step: AgentStep) => {
      console.log('Agent step:', step);
      setCurrentSteps((prev) => [...prev, step]);
    };

    electronAPI.events.on('agent:step', handleAgentStep);

    // Subscribe to agent steps in main process
    if (electronAPI.agent) {
      electronAPI.agent.subscribeSteps();
    }

    return () => {
      electronAPI.events.removeListener('agent:step', handleAgentStep);
    };
  }, []);

  const handleSendMessage = async (content: string, attachments?: AttachedFile[]) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setCurrentSteps([]);

    // Check if API is configured
    const electronAPI = (window as any).electronAPI;
    if (!isConfigured || !currentModel?.apiKey) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: '⚠️ 请先配置 API Key。点击输入框右侧的 "+" 按钮添加模型。',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setIsLoading(false);
      return;
    }

    try {
      // Use Agent API for task execution
      if (electronAPI && electronAPI.agent) {
        const response = await electronAPI.agent.execute(content, {
          workspacePath: workspace || undefined,
          attachments: attachments
        });

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.success ? response.answer : `错误: ${response.error}`,
          timestamp: Date.now(),
          steps: response.steps?.filter((step: AgentStep) => step.type !== 'final_answer')
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error('Agent API not available');
      }
    } catch (error) {
      console.error('Agent execution failed:', error);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWorkspaceSelect = async (path: string) => {
    setWorkspace(path);

    // 通知主进程挂载工作区
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.workspace) {
        await electronAPI.workspace.set(path);
        console.log('Workspace mounted:', path);
      }
    } catch (error) {
      console.error('Failed to mount workspace:', error);
    }
  };

  const handleModelChange = async (model: ModelConfig) => {
    setCurrentModel(model);
    console.log('Model changed:', model);

    // 通知主进程更新模型配置
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.llm) {
        await electronAPI.llm.updateConfig({
          provider: model.provider,
          model: model.model,
          apiKey: model.apiKey || '',
          ...(model.baseUrl && { baseUrl: model.baseUrl })
        });

        // Re-check configuration
        const configured = await electronAPI.llm.isConfigured();
        setIsConfigured(configured && !!model.apiKey);
      }
    } catch (error) {
      console.error('Failed to update model config:', error);
    }
  };

  // 监听权限审批请求
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || !electronAPI.events) {
      console.warn('electronAPI.events not available');
      return;
    }

    const handleApprovalRequest = (data: PermissionRequestData) => {
      console.log('收到权限请求:', data);
      setPermissionRequest(data);
    };

    // 注册监听器
    electronAPI.events.on('guardian:approval-request', handleApprovalRequest);

    // 清理函数
    return () => {
      electronAPI.events.removeListener('guardian:approval-request', handleApprovalRequest);
    };
  }, []);

  // 处理权限批准
  const handlePermissionApprove = useCallback(async () => {
    if (!permissionRequest) return;

    try {
      await (window as any).electronAPI.guardian.sendApprovalResponse(
        permissionRequest.requestId,
        { approved: true }
      );
    } catch (error) {
      console.error('发送批准响应失败:', error);
    } finally {
      setPermissionRequest(null);
    }
  }, [permissionRequest]);

  // 处理权限拒绝
  const handlePermissionDeny = useCallback(async () => {
    if (!permissionRequest) return;

    try {
      await (window as any).electronAPI.guardian.sendApprovalResponse(
        permissionRequest.requestId,
        { approved: false }
      );
    } catch (error) {
      console.error('发送拒绝响应失败:', error);
    } finally {
      setPermissionRequest(null);
    }
  }, [permissionRequest]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Desktop Mate</h1>
        <div className="window-controls">
          <button
            className="window-control-btn minimize-btn"
            onClick={() => (window as any).electronAPI?.window?.minimize()}
            title="最小化"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="5" width="10" height="2" fill="currentColor"/>
            </svg>
          </button>
          <button
            className="window-control-btn maximize-btn"
            onClick={() => (window as any).electronAPI?.window?.maximize()}
            title="最大化"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          <button
            className="window-control-btn close-btn"
            onClick={() => (window as any).electronAPI?.window?.close()}
            title="关闭"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="app-main">
        <MessageList messages={messages} isLoading={isLoading} agentSteps={currentSteps} />
        <ChatInput
          onSend={handleSendMessage}
          disabled={isLoading}
          placeholder=""
          onModelChange={handleModelChange}
          onWorkspaceSelect={handleWorkspaceSelect}
          currentWorkspace={workspace}
          currentModel={currentModel}
        />
      </main>

      {/* 权限审批对话框 */}
      {permissionRequest && (
        <PermissionDialog
          request={permissionRequest}
          onApprove={handlePermissionApprove}
          onDeny={handlePermissionDeny}
        />
      )}
    </div>
  );
}
