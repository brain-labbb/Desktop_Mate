/**
 * File Processor Service
 * Handles file type detection, content reading, and attachment processing for LLM
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AttachedFile, ContentBlock, FileProcessingConfig } from '../../shared/types';
import { FileType, DEFAULT_FILE_PROCESSING_CONFIG } from '../../shared/types';
import { OcrService } from './ocr';

/**
 * Document parser interface
 */
interface DocumentParser {
  canParse(filePath: string): boolean;
  parse(filePath: string): Promise<string>;
}

/**
 * PDF parser with OCR fallback for scanned documents
 */
class PDFParser implements DocumentParser {
  private ocrService: OcrService;

  constructor(ocrService: OcrService) {
    this.ocrService = ocrService;
  }

  canParse(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.pdf');
  }

  async parse(filePath: string): Promise<string> {
    const pdfParse = require('pdf-parse');
    const buffer = await fs.promises.readFile(filePath);
    const data = await pdfParse(buffer);

    // Check if PDF has sufficient text content
    const textLength = data.text.trim().length;
    if (textLength > 100) {
      return data.text;
    }

    // PDF appears to be scanned, use OCR
    try {
      const ocrResult = await this.ocrService.recognizePdf(filePath);
      return ocrResult.text;
    } catch (error) {
      // If OCR fails, return whatever text we have
      console.warn(`OCR failed for ${filePath}:`, error);
      return data.text || `[Unable to extract text from PDF. The document may be image-based.]`;
    }
  }
}

/**
 * Office document parser supporting DOCX, XLSX, and PPTX
 */
class OfficeParser implements DocumentParser {
  canParse(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.docx', '.xlsx', '.pptx', '.ppt'].includes(ext);
  }

  async parse(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.docx':
        return await this.parseDocx(filePath);
      case '.xlsx':
        return await this.parseXlsx(filePath);
      case '.pptx':
      case '.ppt':
        return await this.parsePptx(filePath);
      default:
        throw new Error(`Office format ${ext} is not supported.`);
    }
  }

  private async parseDocx(filePath: string): Promise<string> {
    const mammoth = require('mammoth');
    const buffer = await fs.promises.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  private async parseXlsx(filePath: string): Promise<string> {
    const xlsx = require('xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheets: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const text = xlsx.utils.sheet_to_txt(worksheet);
      sheets.push(`[Sheet: ${sheetName}]\n${text}`);
    }

    return sheets.join('\n\n');
  }

  private async parsePptx(filePath: string): Promise<string> {
    // For .ppt files, we need to convert them first
    if (filePath.toLowerCase().endsWith('.ppt')) {
      throw new Error('Legacy .ppt format is not supported. Please convert to .pptx.');
    }

    // Use node-pptx-parser for PPTX files
    const fs = require('fs');

    try {
      // node-pptx-parser extracts text from PPTX
      const PptxParser = require('node-pptx-parser');
      const parser = new PptxParser(fs.readFileSync(filePath));
      const data = parser.parse();

      const slides: string[] = [];
      for (let i = 0; i < data.length; i++) {
        const slide = data[i];
        // Extract text from the slide
        const text = this.extractTextFromSlide(slide);
        if (text) {
          slides.push(`[Slide ${i + 1}]\n${text}`);
        }
      }

      return slides.join('\n\n');
    } catch (error) {
      throw new Error(`Failed to parse PPTX: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private extractTextFromSlide(slide: any): string {
    // Helper to extract text recursively from slide elements
    const extractText = (obj: any): string => {
      if (!obj) return '';

      let text = '';

      if (typeof obj === 'string') {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(extractText).filter(Boolean).join(' ');
      }

      if (obj.text) {
        text += obj.text + ' ';
      }

      // Check common child properties
      for (const key of ['children', 'elements', 'items', 'bodyItems']) {
        if (obj[key]) {
          text += extractText(obj[key]);
        }
      }

      return text;
    };

    return extractText(slide).trim();
  }
}

/**
 * File processor options
 */
export interface FileProcessorOptions {
  /** File processing configuration */
  config?: Partial<FileProcessingConfig>;
}

/**
 * Processed file with content
 */
export interface ProcessedFile extends AttachedFile {
  /** Detected file type */
  type: FileType;
  /** MIME type */
  mimeType: string;
  /** Text content (for text files) */
  content?: string;
  /** Base64 content (for images) */
  base64?: string;
}

/**
 * File Processor Service
 */
export class FileProcessor {
  private config: FileProcessingConfig;
  private mimeTypes: Map<string, string>;
  private documentParsers: DocumentParser[];
  private ocrService: OcrService;

  // MIME type mappings (built-in, no external dependency required)
  private readonly MIME_TYPE_MAP: Record<string, string> = {
    // Text files
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.yaml': 'application/x-yaml',
    '.yml': 'application/x-yaml',
    '.toml': 'application/toml',
    '.ini': 'text/plain',
    '.env': 'text/plain',
    '.log': 'text/plain',

    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',

    // PDF
    '.pdf': 'application/pdf',

    // Office documents
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.odt': 'application/vnd.oasis.opendocument.text',
    '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
    '.odp': 'application/vnd.oasis.opendocument.presentation',

    // Code files
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.jsx': 'text/jsx',
    '.tsx': 'text/tsx',
    '.py': 'text/x-python',
    '.java': 'text/x-java-source',
    '.cpp': 'text/x-c++',
    '.c': 'text/x-c',
    '.h': 'text/x-c',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.rb': 'text/x-ruby',
    '.php': 'text/x-php',
    '.cs': 'text/x-csharp',
    '.swift': 'text/x-swift',
    '.kt': 'text/x-kotlin',
    '.scala': 'text/x-scala',
    '.sh': 'text/x-shellscript',
    '.bash': 'text/x-shellscript',
    '.zsh': 'text/x-shellscript',
    '.fish': 'text/x-fish',
    '.ps1': 'text/x-powershell',
    '.html': 'text/html',
    '.css': 'text/css',
    '.scss': 'text/x-scss',
    '.less': 'text/x-less',
    '.sass': 'text/x-sass',
    '.vue': 'text/x-vue',
    '.svelte': 'text/x-svelte'
  };

  constructor(options: FileProcessorOptions = {}) {
    // Import defaults from shared types
    const defaults = require('../../shared/types').DEFAULT_FILE_PROCESSING_CONFIG;

    this.config = {
      ...defaults,
      ...options.config
    };

    // Build mime types map for quick lookup
    this.mimeTypes = new Map(Object.entries(this.MIME_TYPE_MAP));

    // Initialize OCR service
    this.ocrService = new OcrService();

    // Initialize document parsers
    this.documentParsers = [
      new PDFParser(this.ocrService),
      new OfficeParser()
    ];
  }

  /**
   * Detect file type from extension
   */
  detectFileType(filePath: string): FileType {
    const ext = path.extname(filePath).toLowerCase();

    if (this.config.imageFileExtensions.includes(ext)) {
      return FileType.IMAGE;
    }
    if (this.config.pdfFileExtensions.includes(ext)) {
      return FileType.PDF;
    }
    if (this.config.officeFileExtensions.includes(ext)) {
      return FileType.OFFICE;
    }
    if (this.config.codeFileExtensions.includes(ext)) {
      return FileType.CODE;
    }
    if (this.config.textFileExtensions.includes(ext)) {
      return FileType.TEXT;
    }

    return FileType.UNKNOWN;
  }

  /**
   * Get MIME type from file extension
   */
  getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return this.mimeTypes.get(ext) || 'application/octet-stream';
  }

  /**
   * Check if file is binary
   */
  private isBinaryFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const textExtensions = [
      ...this.config.textFileExtensions,
      ...this.config.codeFileExtensions
    ];
    return !textExtensions.includes(ext);
  }

  /**
   * Get appropriate document parser for a file
   */
  private getDocumentParser(filePath: string): DocumentParser | null {
    for (const parser of this.documentParsers) {
      if (parser.canParse(filePath)) {
        return parser;
      }
    }
    return null;
  }

  /**
   * Calculate relative path from workspace
   * Returns null if file is outside workspace
   */
  private calculateRelativePath(filePath: string, workspacePath?: string): string | null {
    if (!workspacePath) return null;

    const normalizedFile = path.normalize(filePath);
    const normalizedWorkspace = path.normalize(workspacePath);
    const relativePath = path.relative(normalizedWorkspace, normalizedFile);

    // Check if file is inside workspace (relative path doesn't start with ..)
    if (relativePath.startsWith('..')) {
      return null;
    }

    return relativePath;
  }

  /**
   * Read file content based on type
   */
  async readFile(filePath: string): Promise<{ content?: string; base64?: string }> {
    const fileType = this.detectFileType(filePath);
    const stats = await fs.promises.stat(filePath);

    try {
      switch (fileType) {
        case FileType.IMAGE:
          // For images, read as base64 if under threshold
          if (stats.size <= this.config.imageFileThreshold) {
            const buffer = await fs.promises.readFile(filePath);
            const base64 = buffer.toString('base64');
            const mimeType = this.getMimeType(filePath);
            return { base64: `data:${mimeType};base64,${base64}` };
          }
          // For large images, use OCR to extract text
          try {
            const ocrResult = await this.ocrService.recognizeImage(filePath);
            if (ocrResult.text.trim()) {
              return { content: `[Image OCR Result: ${path.basename(filePath)}]\n${ocrResult.text}` };
            }
          } catch (error) {
            console.warn(`OCR failed for image ${filePath}:`, error);
          }
          return { content: `[Image: ${path.basename(filePath)}, ${(stats.size / 1024 / 1024).toFixed(1)}MB - too large to embed, OCR unavailable]` };

        case FileType.TEXT:
        case FileType.CODE:
          // For text files, read content if under threshold
          if (stats.size <= this.config.smallFileThreshold) {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return { content };
          }
          // For larger text files, return a preview with truncation notice
          const preview = await fs.promises.readFile(filePath, 'utf-8');
          const truncated = preview.substring(0, 10000);
          return { content: truncated + '\n\n[... file truncated, use read_file tool for full content ...]' };

        case FileType.PDF:
        case FileType.OFFICE:
          // For documents, use document parser to extract text
          const parser = this.getDocumentParser(filePath);
          if (parser) {
            try {
              const text = await parser.parse(filePath);
              // Limit document text size
              const maxDocSize = 50000;
              if (text.length > maxDocSize) {
                return { content: text.substring(0, maxDocSize) + '\n\n[... document truncated ...]' };
              }
              return { content: text };
            } catch (error) {
              return { content: `[Failed to parse document: ${error instanceof Error ? error.message : String(error)}]` };
            }
          }
          // No parser available - return metadata
          return { content: `[Document: ${path.basename(filePath)}, ${(stats.size / 1024).toFixed(1)}KB - parsing not available]` };

        default:
          // For unknown types, try to read as text if small
          if (stats.size <= this.config.smallFileThreshold && !this.isBinaryFile(filePath)) {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return { content };
          }
          return {};
      }
    } catch (error) {
      console.error(`Failed to read file ${filePath}:`, error);
      return {};
    }
  }

  /**
   * Process a single attachment
   */
  async processAttachment(attachment: AttachedFile, workspacePath?: string): Promise<ProcessedFile> {
    const fileType = this.detectFileType(attachment.path);
    const mimeType = this.getMimeType(attachment.path);

    // Calculate relative path and location
    const relativePath = this.calculateRelativePath(attachment.path, workspacePath);
    const inWorkspace = relativePath !== null;

    // Read file content
    const { content, base64 } = await this.readFile(attachment.path);

    return {
      ...attachment,
      type: fileType,
      mimeType,
      content,
      base64,
      relativePath: relativePath || undefined,
      inWorkspace
    };
  }

  /**
   * Process multiple attachments
   */
  async processAttachments(attachments: AttachedFile[], workspacePath?: string): Promise<ProcessedFile[]> {
    return Promise.all(attachments.map(att => this.processAttachment(att, workspacePath)));
  }

  /**
   * Convert processed attachments to LLM content blocks
   */
  async attachmentsToContentBlocks(attachments: ProcessedFile[]): Promise<ContentBlock[]> {
    const blocks: ContentBlock[] = [];

    for (const attachment of attachments) {
      switch (attachment.type) {
        case FileType.IMAGE:
          if (attachment.base64) {
            blocks.push({
              type: 'image_url',
              image_url: { url: attachment.base64 }
            });
          } else {
            // Large image - provide metadata
            blocks.push({
              type: 'file_metadata',
              file: attachment
            });
          }
          break;

        case FileType.TEXT:
        case FileType.CODE:
          if (attachment.content) {
            // Text/code file - include content with file wrapper
            blocks.push({
              type: 'text',
              text: `\n[File: ${attachment.name}${attachment.inWorkspace ? ` @ ${attachment.relativePath}` : ''}]\n${attachment.content}\n[End of ${attachment.name}]\n`
            });
          } else {
            // Large text file - provide metadata
            blocks.push({
              type: 'file_metadata',
              file: attachment
            });
          }
          break;

        case FileType.PDF:
        case FileType.OFFICE:
          if (attachment.content && !attachment.content.startsWith('[')) {
            // Document content was parsed successfully - include it
            blocks.push({
              type: 'text',
              text: `\n[Document: ${attachment.name}${attachment.inWorkspace ? ` @ ${attachment.relativePath}` : ''}]\n${attachment.content}\n[End of ${attachment.name}]\n`
            });
          } else {
            // Document parsing failed or not available - provide metadata
            blocks.push({
              type: 'file_metadata',
              file: attachment
            });
          }
          break;

        default:
          // Unknown types - provide metadata
          blocks.push({
            type: 'file_metadata',
            file: attachment
          });
      }
    }

    return blocks;
  }

  /**
   * Generate a text summary of attachments for the system prompt
   */
  generateAttachmentSummary(attachments: ProcessedFile[], workspacePath?: string): string {
    if (attachments.length === 0) return '';

    const summaryParts: string[] = [];
    summaryParts.push('\n--- Attached Files (Temporary Reference) ---');

    for (const att of attachments) {
      const sizeKB = (att.size / 1024).toFixed(1);
      const status = this.getFileStatus(att);
      const location = att.inWorkspace
        ? `[in workspace: ${att.relativePath}]`
        : `[outside workspace]`;

      summaryParts.push(`- ${att.name} (${att.type}, ${sizeKB}KB) ${location} ${status}`);
    }

    summaryParts.push('--- End of Attachments ---\n');
    return summaryParts.join('\n');
  }

  /**
   * Get file status for attachment summary
   */
  private getFileStatus(att: ProcessedFile): string {
    if (att.base64) {
      return '(image embedded)';
    }
    if (att.content) {
      // Check if content was truncated
      if (att.content.includes('... truncated')) {
        const preview = att.content.substring(0, 50).replace(/\n/g, ' ');
        return `(preview: "${preview}...")`;
      }
      const preview = att.content.substring(0, 50).replace(/\n/g, ' ');
      return `(content embedded: "${preview}...")`;
    }
    return '(metadata only)';
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FileProcessingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FileProcessingConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources (OCR worker)
   */
  async cleanup(): Promise<void> {
    await this.ocrService.terminate();
  }
}

/**
 * Create a file processor instance
 */
export function createFileProcessor(options?: FileProcessorOptions): FileProcessor {
  return new FileProcessor(options);
}

// Re-export types for convenience
export type { AttachedFile, ContentBlock, FileProcessingConfig };
export { FileType, DEFAULT_FILE_PROCESSING_CONFIG };
