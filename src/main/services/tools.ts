/**
 * Tool/Function Calling System for Agent
 * Allows LLM to call external tools and functions
 */

import { z } from 'zod';
import type { FileAPI } from '../../shared/types';

/**
 * Tool parameter schema
 */
export type ToolParameterSchema = {
  type: 'object';
  properties: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    enum?: string[];
    items?: { type: string };
  }>;
  required?: string[];
};

/**
 * Tool definition
 */
export interface Tool {
  /** Unique tool identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for parameters */
  parameters: ToolParameterSchema;
  /** Function to execute the tool */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Success status */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Output to show to user */
  output?: string;
}

/**
 * Tool Registry
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools in OpenAI Function Calling format
   */
  getOpenAIFunctions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: ToolParameterSchema } }> {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found`
      };
    }

    try {
      return await tool.execute(params);
    } catch (error) {
      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

/**
 * Create built-in tools for the agent
 */
export function createBuiltinTools(fileSystem?: FileAPI): Tool[] {
  const tools: Tool[] = [];

  // File read tool
  tools.push({
    name: 'read_file',
    description: 'Read the contents of a file in the workspace. Use this when you need to examine workspace files. NOT for attached files (their content is already provided).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to read, relative to the workspace root. Only works for files inside the workspace.'
        }
      },
      required: ['path']
    },
    execute: async (params) => {
      if (!fileSystem) {
        return { success: false, error: 'File system not available (no workspace set)' };
      }
      try {
        const content = await fileSystem.read(params.path as string);
        return { success: true, data: content, output: `File read successfully` };
      } catch (error) {
        return { success: false, error: `Failed to read file: ${error}` };
      }
    }
  });

  // File write tool
  tools.push({
    name: 'write_file',
    description: 'Write content to a file in the workspace. Use this to create or modify files in the workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to write, relative to the workspace root. Creates/overwrites files in the workspace only.'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file'
        }
      },
      required: ['path', 'content']
    },
    execute: async (params) => {
      if (!fileSystem) {
        return { success: false, error: 'File system not available (no workspace set)' };
      }
      try {
        await fileSystem.write(params.path as string, params.content as string);
        return { success: true, output: `File written successfully` };
      } catch (error) {
        return { success: false, error: `Failed to write file: ${error}` };
      }
    }
  });

  // List directory tool
  tools.push({
    name: 'list_directory',
    description: 'List the contents of a directory in the workspace. Use this to explore the workspace structure.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the directory to list, relative to workspace root. Use "." for current directory.'
        }
      },
      required: []
    },
    execute: async (params) => {
      if (!fileSystem) {
        return { success: false, error: 'File system not available (no workspace set)' };
      }
      try {
        const items = await fileSystem.list(params.path as string || '.');
        const formatted = items.map(item => ({
          name: item.name,
          type: item.type,
          path: item.path
        }));
        return { success: true, data: formatted, output: `Found ${items.length} items` };
      } catch (error) {
        return { success: false, error: `Failed to list directory: ${error}` };
      }
    }
  });

  // File delete tool
  tools.push({
    name: 'delete_file',
    description: 'Delete a file in the workspace. Use with caution - this cannot be undone.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to delete, relative to the workspace root.'
        }
      },
      required: ['path']
    },
    execute: async (params) => {
      if (!fileSystem) {
        return { success: false, error: 'File system not available (no workspace set)' };
      }
      try {
        await fileSystem.delete(params.path as string);
        return { success: true, output: `File deleted successfully` };
      } catch (error) {
        return { success: false, error: `Failed to delete file: ${error}` };
      }
    }
  });

  // Search files tool
  tools.push({
    name: 'search_files',
    description: 'Search for files matching a pattern in their name or content. Searches within the workspace only.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The search pattern (file name or content to search for)'
        },
        path: {
          type: 'string',
          description: 'The directory to search in, relative to workspace root'
        }
      },
      required: ['pattern']
    },
    execute: async (params) => {
      if (!fileSystem) {
        return { success: false, error: 'File system not available (no workspace set)' };
      }
      try {
        // For now, just list files and filter by name
        const items = await fileSystem.list(params.path as string || '.');
        const pattern = params.pattern as string;
        const matches = items.filter(item =>
          item.name.toLowerCase().includes(pattern.toLowerCase())
        );
        return { success: true, data: matches, output: `Found ${matches.length} matching files` };
      } catch (error) {
        return { success: false, error: `Search failed: ${error}` };
      }
    }
  });

  return tools;
}
