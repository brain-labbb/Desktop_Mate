/**
 * Agent Core Logic
 * Orchestrates LLM interactions with tool calling for autonomous task execution
 */

import type { LLMService } from './llm';
import type { LLMMessage, AttachedFile, AgentExecutionContext, ContentBlock } from '../../shared/types';
import { ToolRegistry, type ToolResult } from './tools';
import { FileProcessor, createFileProcessor } from './file-processor';
import { RAGService, type RAGServiceOptions, type RAGRetrievalOptions } from './rag';

/**
 * Agent execution step
 */
export interface AgentStep {
  /** Step type */
  type: 'thought' | 'tool_call' | 'observation' | 'final_answer';
  /** Step content */
  content: string;
  /** Tool calls (if any) */
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  /** Tool results (if any) */
  toolResults?: Array<{
    id: string;
    result: ToolResult;
  }>;
  /** Timestamp */
  timestamp: number;
}

/**
 * Agent execution options
 */
export interface AgentOptions {
  /** Maximum iterations before giving up */
  maxIterations?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Callback for step updates */
  onStep?: (step: AgentStep) => void;
  /** RAG service configuration (optional) */
  rag?: RAGServiceOptions;
  /** Whether to auto-index attachments in RAG (default: true if RAG enabled) */
  ragAutoIndex?: boolean;
  /** RAG retrieval options (maxResults, minSimilarity, etc.) */
  ragRetrieval?: RAGRetrievalOptions;
}

/**
 * Agent response
 */
export interface AgentResponse {
  /** Final answer */
  answer: string;
  /** All execution steps */
  steps: AgentStep[];
  /** Success status */
  success: boolean;
  /** Error if failed */
  error?: string;
}

/**
 * Agent class - coordinates LLM and tools
 */
export class Agent {
  private llm: LLMService;
  private tools: ToolRegistry;
  private options: Required<Omit<AgentOptions, 'rag' | 'ragAutoIndex' | 'ragRetrieval'>> & {
    rag?: RAGServiceOptions;
    ragAutoIndex: boolean;
    ragRetrieval?: RAGRetrievalOptions;
  };
  private fileProcessor: FileProcessor;
  private ragService?: RAGService;

  constructor(llm: LLMService, tools: ToolRegistry, options: AgentOptions = {}) {
    this.llm = llm;
    this.tools = tools;
    this.options = {
      maxIterations: options.maxIterations ?? 10,
      verbose: options.verbose ?? false,
      onStep: options.onStep ?? (() => {}),
      rag: options.rag,
      ragAutoIndex: options.ragAutoIndex ?? true,
      ragRetrieval: options.ragRetrieval
    };
    this.fileProcessor = createFileProcessor();

    // Initialize RAG service if configured
    if (this.options.rag) {
      this.ragService = new RAGService(this.options.rag);
    }
  }

  /**
   * Execute the agent with a user query
   */
  async execute(userQuery: string, context?: AgentExecutionContext): Promise<AgentResponse> {
    const steps: AgentStep[] = [];
    const maxIterations = this.options.maxIterations;

    // Process attachments if present
    let attachmentSummary = '';
    let contentBlocks: ContentBlock[] = [{ type: 'text', text: userQuery }];
    let ragContext = '';

    if (context?.attachments && context.attachments.length > 0) {
      const processedAttachments = await this.fileProcessor.processAttachments(context.attachments, context?.workspacePath);
      attachmentSummary = this.fileProcessor.generateAttachmentSummary(processedAttachments, context?.workspacePath);
      const attachmentBlocks = await this.fileProcessor.attachmentsToContentBlocks(processedAttachments);
      contentBlocks = [...contentBlocks, ...attachmentBlocks];

      // Index attachments in RAG if enabled
      if (this.ragService && this.options.ragAutoIndex) {
        for (const attachment of processedAttachments) {
          if (attachment.content && attachment.content.length > 100) {
            try {
              await this.ragService.indexDocument(
                attachment.id,
                attachment.content,
                {
                  filename: attachment.name,
                  fileType: attachment.type,
                  size: attachment.size
                }
              );
              this.log(`Indexed attachment in RAG: ${attachment.name}`);
            } catch (error) {
              this.log(`Failed to index attachment ${attachment.name}:`, error);
            }
          }
        }
      }
    }

    // Retrieve relevant context from RAG if enabled
    if (this.ragService) {
      try {
        const ragResult = await this.ragService.retrieve(userQuery, this.options.ragRetrieval);
        if (ragResult.chunkCount > 0) {
          ragContext = ragResult.context;
          this.log(`Retrieved ${ragResult.chunkCount} relevant chunks from RAG`);
        }
      } catch (error) {
        this.log('RAG retrieval failed:', error);
      }
    }

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(context?.workspacePath, context?.additionalContext, attachmentSummary, ragContext);

    // Initialize messages with multimodal content support
    let messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contentBlocks.length === 1 && contentBlocks[0].type === 'text' ? contentBlocks[0].text : contentBlocks as any }
    ];

    // Main agent loop
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      this.log(`Iteration ${iteration + 1}/${maxIterations}`);

      // Get available tools in OpenAI format
      const openAITools = this.tools.getOpenAIFunctions();

      // Call LLM with tools
      let response: AgentStep;

      try {
        const llmResponse = await this.llm.generateWithTools(messages, openAITools);

        if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
          // LLM wants to call tools
          this.log(`Tool calls requested: ${llmResponse.toolCalls.map(t => t.function.name).join(', ')}`);

          response = {
            type: 'tool_call',
            content: llmResponse.content || '',
            toolCalls: llmResponse.toolCalls.map(call => ({
              id: call.id,
              name: call.function.name,
              arguments: call.function.arguments
            })),
            timestamp: Date.now()
          };

          steps.push(response);
          this.options.onStep(response);

          // Execute tool calls
          const toolResults: Array<{ id: string; result: ToolResult }> = [];

          for (const toolCall of llmResponse.toolCalls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            this.log(`Executing tool: ${toolName} with args:`, toolArgs);

            const result = await this.tools.execute(toolName, toolArgs);
            toolResults.push({ id: toolCall.id, result });

            this.log(`Tool result:`, result);
          }

          // Add tool results to messages
          const toolResultsMessage: LLMMessage = {
            role: 'user',
            content: JSON.stringify(toolResults.map(r => ({
              tool_call_id: r.id,
              output: JSON.stringify(r.result)
            })))
          };

          messages.push({
            role: 'assistant',
            content: response.content,
            tool_calls: llmResponse.toolCalls
          } as any);
          messages.push(toolResultsMessage);

          // Add observation step
          const observationStep: AgentStep = {
            type: 'observation',
            content: `Executed ${toolResults.length} tool(s)`,
            toolResults: toolResults,
            timestamp: Date.now()
          };

          steps.push(observationStep);
          this.options.onStep(observationStep);

          // Continue loop to get next response
          continue;
        } else {
          // LLM provided final answer
          this.log('Final answer received');

          response = {
            type: 'final_answer',
            content: llmResponse.content,
            timestamp: Date.now()
          };

          steps.push(response);
          this.options.onStep(response);

          return {
            answer: llmResponse.content,
            steps,
            success: true
          };
        }
      } catch (error) {
        this.log('Agent error:', error);

        const errorStep: AgentStep = {
          type: 'thought',
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: Date.now()
        };

        steps.push(errorStep);

        return {
          answer: '',
          steps,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    // Max iterations reached
    return {
      answer: 'Agent exceeded maximum iterations. Please try a more specific query.',
      steps,
      success: false,
      error: 'Max iterations exceeded'
    };
  }

  /**
   * Build the system prompt for the agent
   */
  private buildSystemPrompt(workspacePath?: string, additionalContext?: string, attachmentSummary?: string, ragContext?: string): string {
    const tools = this.tools.getAll();
    const toolDescriptions = tools.map(tool =>
      `- ${tool.name}: ${tool.description}`
    ).join('\n');

    let prompt = `You are Desktop Mate, an AI assistant that helps users with tasks on their computer.

## File Access Mechanisms

You have TWO distinct ways to access file content:

`;

    // Workspace files mechanism
    if (workspacePath) {
      prompt += `### 1. WORKSPACE FILES (persistent, structured, read/write)
   - Current workspace: ${workspacePath}
   - Use file tools (read_file, write_file, etc.) with RELATIVE paths
   - You can create, read, modify, and delete files here
   - Example: read_file("src/index.js") reads from workspace
   - Example: write_file("output.txt", "content") creates in workspace
`;
    } else {
      prompt += `### 1. NO WORKSPACE ACTIVE
   - File creation and modification tools are NOT available
   - You can only work with attached files (see below)
`;
    }

    // Attachments mechanism
    if (attachmentSummary) {
      prompt += `### 2. ATTACHED FILES (temporary, read-only)
   - Content is already embedded in this conversation
   - NO need to use read_file tool for attachments
   - These are reference materials provided by the user
   - They may be from outside the workspace

${attachmentSummary}
`;
    }

    prompt += `
## Available Tools
${toolDescriptions}

## Guidelines
- Always explain what you're doing before using tools
- Use the minimum number of tools needed
- If a tool fails, try to understand why and try a different approach
- Be precise with file paths
- After completing the requested task, provide a clear summary
- If you cannot complete the task, explain why and suggest alternatives
- Attached file content is already available - don't ask to read it again
`;

    if (additionalContext) {
      prompt += `
## Additional Context
${additionalContext}
`;
    }

    // RAG context
    if (ragContext) {
      prompt += `
## Relevant Document Context
The following content was retrieved from the knowledge base based on your query:

${ragContext}

Use this context to provide more accurate and informed responses. When referencing this information, cite the source number.
`;
    }

    return prompt;
  }

  /**
   * Log if verbose mode is enabled
   */
  private log(...args: unknown[]): void {
    if (this.options.verbose) {
      console.log('[Agent]', ...args);
    }
  }

  /**
   * Update agent options
   */
  updateOptions(options: Partial<AgentOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get available tools
   */
  getTools(): ToolRegistry {
    return this.tools;
  }

  /**
   * Get the RAG service if configured
   */
  getRAGService(): RAGService | undefined {
    return this.ragService;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.fileProcessor.cleanup();
    if (this.ragService) {
      this.ragService.close();
    }
  }
}
