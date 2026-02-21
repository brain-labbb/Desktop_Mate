/**
 * OCR Service
 * Handles optical character recognition for images and scanned PDFs
 */

import * as fs from 'fs';
import * as path from 'path';
import Tesseract from 'tesseract.js';

/**
 * OCR options
 */
export interface OcrOptions {
  /** Recognition language(s), default 'eng+chi_sim' (English + Simplified Chinese) */
  language?: string | string[];
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
}

/**
 * OCR result
 */
export interface OcrResult {
  /** Extracted text */
  text: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether OCR was needed (false for PDFs with text layers) */
  usedOcr: boolean;
}

/**
 * OCR Service
 */
export class OcrService {
  private worker: Tesseract.Worker | null = null;
  private defaultLanguage: string;
  private minConfidence: number;

  constructor(options: OcrOptions = {}) {
    this.defaultLanguage = typeof options.language === 'string'
      ? options.language
      : 'eng+chi_sim';
    this.minConfidence = options.minConfidence ?? 0.5;
  }

  /**
   * Initialize Tesseract worker
   */
  async initialize(language?: string): Promise<void> {
    if (this.worker) {
      return; // Already initialized
    }

    const lang = language || this.defaultLanguage;
    this.worker = await Tesseract.createWorker(lang);
  }

  /**
   * Recognize text from an image file
   */
  async recognizeImage(imagePath: string): Promise<OcrResult> {
    if (!this.worker) {
      await this.initialize();
    }

    try {
      const { data } = await this.worker!.recognize(imagePath);

      return {
        text: data.text,
        confidence: data.confidence / 100,
        usedOcr: true
      };
    } catch (error) {
      throw new Error(`OCR failed for ${imagePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Recognize text from a PDF file
   * First tries to extract text using pdf-parse, falls back to OCR if needed
   */
  async recognizePdf(pdfPath: string): Promise<OcrResult> {
    const pdfParse = require('pdf-parse');

    try {
      const buffer = await fs.promises.readFile(pdfPath);
      const data = await pdfParse(buffer);

      // Check if PDF has sufficient text content
      const textLength = data.text.trim().length;
      if (textLength > 100) {
        // PDF has text layer, no OCR needed
        return {
          text: data.text,
          confidence: 1.0,
          usedOcr: false
        };
      }

      // PDF appears to be scanned, use OCR
      // Note: Tesseract.js can handle PDFs directly
      return await this.ocrPdfWithImages(pdfPath);
    } catch (error) {
      throw new Error(`PDF processing failed for ${pdfPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform OCR on a PDF using Tesseract
   */
  private async ocrPdfWithImages(pdfPath: string): Promise<OcrResult> {
    if (!this.worker) {
      await this.initialize();
    }

    try {
      // Tesseract.js can handle PDFs directly
      const { data } = await this.worker!.recognize(pdfPath);

      return {
        text: data.text,
        confidence: data.confidence / 100,
        usedOcr: true
      };
    } catch (error) {
      throw new Error(`PDF OCR failed for ${pdfPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Terminate the Tesseract worker and free resources
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.worker !== null;
  }
}

/**
 * Create an OCR service instance
 */
export function createOcrService(options?: OcrOptions): OcrService {
  return new OcrService(options);
}
