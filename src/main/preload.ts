import { contextBridge, ipcRenderer } from 'electron';

const electronFileSystem = {
  read: (filePath: string) => ipcRenderer.invoke('fs:read', filePath),
  write: (filePath: string, content: string) => ipcRenderer.invoke('fs:write', filePath, content),
  list: (dirPath?: string) => ipcRenderer.invoke('fs:list', dirPath),
  exists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
  delete: (filePath: string) => ipcRenderer.invoke('fs:delete', filePath)
};

const electronGuardian = {
  requestPermission: (request: any) => ipcRenderer.invoke('guardian:request-permission', request),
  sendApprovalResponse: (requestId: string, response: any) => ipcRenderer.invoke('guardian:approval-response', requestId, response)
};

const electronLLM = {
  generate: (messages: any[]) => ipcRenderer.invoke('llm:generate', messages),
  getConfig: () => ipcRenderer.invoke('llm:get-config'),
  updateConfig: (config: any) => ipcRenderer.invoke('llm:update-config', config),
  isConfigured: () => ipcRenderer.invoke('llm:is-configured')
};

const electronWorkspace = {
  set: (workspacePath: string) => ipcRenderer.invoke('workspace:set', workspacePath),
  get: () => ipcRenderer.invoke('workspace:get'),
  selectFolder: () => ipcRenderer.invoke('workspace:select-folder')
};

const electronChat = {
  sendMessage: (message: string) => ipcRenderer.invoke('chat:send-message', message)
};

const electronAgent = {
  execute: (query: string, context?: { workspacePath?: string; attachments?: any[] }) =>
    ipcRenderer.invoke('agent:execute', query, context),
  getTools: () => ipcRenderer.invoke('agent:get-tools'),
  subscribeSteps: () => ipcRenderer.send('agent:subscribe-steps')
};

const electronDialog = {
  selectFile: () => ipcRenderer.invoke('dialog:select-file')
};

const electronWindow = {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close')
};

// 事件监听器
const electronEvents = {
  on: (channel: string, callback: (...args: any[]) => void) => {
    // 只允许监听特定的安全频道
    const validChannels = [
      'guardian:approval-request',
      'guardian:audit',
      'workspace:changed',
      'agent:step'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'guardian:approval-request',
      'guardian:audit',
      'workspace:changed',
      'agent:step'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback as any);
    }
  }
};

contextBridge.exposeInMainWorld('electronAPI', {
  fileSystem: electronFileSystem,
  guardian: electronGuardian,
  llm: electronLLM,
  workspace: electronWorkspace,
  chat: electronChat,
  agent: electronAgent,
  events: electronEvents,
  dialog: electronDialog,
  window: electronWindow
});

/**
 * Type definition for the exposed electronAPI object
 */
export type ElectronAPI = {
  fileSystem: typeof electronFileSystem;
  guardian: typeof electronGuardian;
  llm: typeof electronLLM;
  workspace: typeof electronWorkspace;
  chat: typeof electronChat;
  agent: typeof electronAgent;
  events: typeof electronEvents;
  dialog: typeof electronDialog;
  window: typeof electronWindow;
};

/**
 * Global declaration for the electronAPI exposed to the renderer process
 */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
