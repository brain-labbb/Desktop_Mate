/**
 * IPC Handlers
 * Bridge between renderer and main process
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { FileAPI } from '../../shared/types';
import type { Guardian } from '../services/guardian';
import type { LLMService } from '../services/llm';
import type { PermissionRequest, PermissionResponse } from '../../shared/types';
import { Agent } from '../services/agent';
import { ToolRegistry, createBuiltinTools } from '../services/tools';

interface AgentState {
  agent: Agent | null;
  tools: ToolRegistry;
}

const agentState: AgentState = {
  agent: null,
  tools: new ToolRegistry()
};

export function registerIPCHandlers(options: {
  fileSystem: FileAPI;
  guardian: Guardian;
  llm: LLMService;
}): void {
  const { fileSystem, guardian, llm } = options;

  // Initialize tools with file system
  const builtinTools = createBuiltinTools(fileSystem);
  builtinTools.forEach(tool => agentState.tools.register(tool));

  // Initialize agent
  agentState.agent = new Agent(llm, agentState.tools, {
    verbose: true,
    maxIterations: 10
  });

  // File System APIs
  ipcMain.handle('fs:read', async (_, filePath: string) => {
    return await fileSystem.read(filePath);
  });

  ipcMain.handle('fs:write', async (_, filePath: string, content: string) => {
    return await fileSystem.write(filePath, content);
  });

  ipcMain.handle('fs:list', async (_, dirPath?: string) => {
    return await fileSystem.list(dirPath || '.');
  });

  ipcMain.handle('fs:exists', async (_, filePath: string) => {
    return await fileSystem.exists(filePath);
  });

  ipcMain.handle('fs:delete', async (_, filePath: string) => {
    return await fileSystem.delete(filePath);
  });

  ipcMain.handle('fs:tree-summary', async () => {
    return await fileSystem.list('.');
  });

  // Permission APIs
  ipcMain.handle('guardian:request-permission', async (_, request: PermissionRequest) => {
    return await guardian.requestPermission(request);
  });

  ipcMain.handle('guardian:approval-response', async (_, requestId: string, response: PermissionResponse) => {
    guardian.handleApprovalResponse(requestId, response);
  });

  ipcMain.handle('guardian:get-audit-log', async (_, filters) => {
    return guardian.getAuditLog(filters);
  });

  ipcMain.handle('guardian:export-audit-log', async (_, format: 'json' | 'csv') => {
    return await guardian.exportAuditLog(format);
  });

  ipcMain.handle('guardian:clear-permissions', async () => {
    return await guardian.clearPermissionMemory();
  });

  // LLM APIs
  ipcMain.handle('llm:generate', async (_, messages) => {
    return await llm.generate(messages);
  });

  ipcMain.handle('llm:get-config', async () => {
    return llm.getConfig();
  });

  ipcMain.handle('llm:update-config', async (_, config) => {
    llm.updateConfig(config);
    // Reinitialize agent with new LLM config
    if (agentState.agent) {
      agentState.agent = new Agent(llm, agentState.tools, {
        verbose: true,
        maxIterations: 10
      });
    }
    return llm.getConfig();
  });

  ipcMain.handle('llm:is-configured', async () => {
    try {
      const config = llm.getConfig();
      return !!config.apiKey;
    } catch {
      return false;
    }
  });

  // Agent APIs
  ipcMain.handle('agent:execute', async (_, query: string, context?: { workspacePath?: string; attachments?: any[] }) => {
    if (!agentState.agent) {
      return {
        success: false,
        error: 'Agent not initialized'
      };
    }

    try {
      const response = await agentState.agent.execute(query, context);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        steps: [],
        answer: ''
      };
    }
  });

  ipcMain.handle('agent:get-tools', async () => {
    return agentState.tools.getOpenAIFunctions();
  });

  // Agent step streaming
  ipcMain.on('agent:subscribe-steps', (event) => {
    if (agentState.agent) {
      agentState.agent.updateOptions({
        onStep: (step) => {
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('agent:step', step);
          }
        }
      });
    }
  });

  // Window control APIs
  ipcMain.on('window:minimize', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('window:maximize', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window:close', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.close();
    }
  });

  // Event forwarding
  guardian.on('approval-request', (data) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('guardian:approval-request', data);
    }
  });

  guardian.on('audit', (entry) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('guardian:audit', entry);
    }
  });
}

export function unregisterIPCHandlers(): void {
  const channels = [
    'fs:read', 'fs:write', 'fs:list', 'fs:exists', 'fs:delete', 'fs:tree-summary',
    'guardian:request-permission', 'guardian:approval-response', 'guardian:get-audit-log',
    'guardian:export-audit-log', 'guardian:clear-permissions',
    'llm:generate', 'llm:get-config', 'llm:update-config', 'llm:is-configured',
    'agent:execute', 'agent:get-tools',
    'agent:subscribe-steps'
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  agentState.agent = null;
}

export { agentState };
