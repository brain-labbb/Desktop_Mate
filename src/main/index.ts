/**
 * Desktop Mate - Main Process Entry Point
 */

import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { LLMConfig, FileAPI } from '../shared/types';
import type { LLMService } from './services/llm';
import { createFileSystemService, DEFAULT_FS_CONFIG } from './services/file-system';
import { Guardian } from './services/guardian';
import { createLLMService, DEFAULT_LLM_CONFIGS } from './services/llm';
import { registerIPCHandlers, unregisterIPCHandlers, updateServices } from './ipc/handlers';

interface AppState {
  mainWindow: BrowserWindow | null;
  workspacePath: string | null;
  fileSystem: FileAPI | null;
  guardian: Guardian | null;
  llm: LLMService | null;
}

const state: AppState = {
  mainWindow: null,
  workspacePath: null,
  fileSystem: null,
  guardian: null,
  llm: null
};

// Check if running in development mode
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
console.log('isDev:', isDev, 'NODE_ENV:', process.env.NODE_ENV, 'isPackaged:', app.isPackaged);

async function createMainWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    minWidth: 700,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Desktop Mate',
    backgroundColor: '#1a1a1a',
    show: true
  });

  if (isDev) {
    // Try common Vite ports
    const vitePorts = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 5181, 5182, 5183, 5184, 5185];
    let loaded = false;

    for (const port of vitePorts) {
      try {
        await mainWindow.loadURL(`http://localhost:${port}`);
        mainWindow.webContents.openDevTools();
        loaded = true;
        console.log(`Loaded Vite dev server on port ${port}`);
        break;
      } catch {
        // Port not available, try next
        continue;
      }
    }

    if (!loaded) {
      console.error('Vite dev server not found on ports 5173-5178. Please start the renderer first.');
      mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    state.mainWindow = null;
  });

  return mainWindow;
}

async function initializeServices(): Promise<void> {
  const userDataPath = app.getPath('userData');
  state.guardian = new Guardian('default_user', path.join(userDataPath, 'audit.log'));

  const llmConfig: LLMConfig = {
    ...DEFAULT_LLM_CONFIGS.openai
  };
  state.llm = await createLLMService(llmConfig);

  // Register IPC handlers immediately after services are initialized
  // Create a placeholder fileSystem that will be replaced when workspace is set
  if (state.guardian && state.llm) {
    // Create a minimal placeholder fileSystem
    const { EventEmitter } = require('events');
    const placeholderFileSystem: FileAPI = {
      read: async () => { throw new Error('Workspace not set. Please select a workspace first.'); },
      write: async () => { throw new Error('Workspace not set. Please select a workspace first.'); },
      list: async () => { throw new Error('Workspace not set. Please select a workspace first.'); },
      exists: async () => { throw new Error('Workspace not set. Please select a workspace first.'); },
      delete: async () => { throw new Error('Workspace not set. Please select a workspace first.'); },
      watch: () => {
        const emitter = new EventEmitter();
        emitter.emit('error', new Error('Workspace not set. Please select a workspace first.'));
        return emitter;
      }
    };

    registerIPCHandlers({
      fileSystem: placeholderFileSystem,
      guardian: state.guardian,
      llm: state.llm
    });
  }
}

async function setWorkspace(workspacePath: string): Promise<void> {
  state.workspacePath = workspacePath;
  state.fileSystem = createFileSystemService({
    workspaceRoot: workspacePath,
    ...DEFAULT_FS_CONFIG
  });

  // Update services with new fileSystem (re-registration no longer needed)
  if (state.guardian && state.llm && state.fileSystem) {
    updateServices({
      fileSystem: state.fileSystem,
      guardian: state.guardian,
      llm: state.llm
    });
  }

  if (state.mainWindow) {
    state.mainWindow.webContents.send('workspace:changed', workspacePath);
  }
}

// Remove default menu bar
Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  await initializeServices();
  state.mainWindow = await createMainWindow();

  ipcMain.handle('workspace:set', async (_, workspacePath: string) => {
    await setWorkspace(workspacePath);
    return { success: true };
  });

  ipcMain.handle('workspace:get', async () => {
    return state.workspacePath;
  });

  ipcMain.handle('workspace:select-folder', async () => {
    const result = await dialog.showOpenDialog(state.mainWindow!, {
      properties: ['openDirectory'],
      title: '选择工作区文件夹'
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:select-file', async () => {
    const result = await dialog.showOpenDialog(state.mainWindow!, {
      properties: ['openFile'],
      title: '选择要附加的文件',
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: '文本文件', extensions: ['txt', 'md', 'csv', 'json', 'xml'] },
        { name: '代码文件', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs'] },
        { name: '文档', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const stats = await fs.promises.stat(filePath);

    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size
    };
  });

  ipcMain.handle('chat:send-message', async (_, message: string) => {
    if (!state.llm) {
      return { error: 'LLM service not initialized' };
    }

    try {
      const response = await state.llm.generate([
        { role: 'user', content: message }
      ]);
      return { success: true, content: response.content };
    } catch (error) {
      return { error: String(error) };
    }
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      state.mainWindow = await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Close file system if it has a close method (our FileSystemService does)
  if (state.fileSystem && state.fileSystem.close) {
    state.fileSystem.close();
  }
  unregisterIPCHandlers();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Close file system if it has a close method
  if (state.fileSystem && state.fileSystem.close) {
    state.fileSystem.close();
  }
});

export { state };
