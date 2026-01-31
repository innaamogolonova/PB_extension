/**
 * types.ts
 * 
 * Central location for all TypeScript type definitions used throughout the extension.
 * This file defines the shape of data structures for:
 * - Function information (detected from code)
 * - Annotation content (displayed in webview)
 * - Display strategy interface (for swappable UI implementations)
 */

import * as vscode from 'vscode';

/**
 * Represents information about a function detected in the source code.
 * This is the core data structure passed around when we find functions.
 */
export interface FunctionInfo {
  /** The name of the function (e.g., "calculate_total") */
  name: string;
  
  /** The full range of the function in the document (start to end) */
  range: vscode.Range;
  
  /** The line number where the function starts (0-based) */
  startLine: number;
  
  /** The line number where the function ends (0-based) */
  endLine: number;
  
  /** The complete source code of the function */
  functionCode: string;
  
  /** The type of symbol (Function, Method, or Constructor) */
  symbolKind: vscode.SymbolKind;
}

/**
 * Represents the content displayed in the webview panel.
 * This is what gets generated (by LLM or mock service) and shown to the user.
 */
export interface AnnotationContent {
  /** The name of the function being annotated */
  functionName: string;
  
  /** A brief summary or explanation of the function */
  summary: string;
  
  /** HTML content for rich visualization (charts, tables, etc.) */
  visualization: string;
  
  /** When this annotation was generated */
  timestamp: Date;
  
  /** Whether the content is still being generated */
  isLoading: boolean;
}
/**
 * Interface for display strategies.
 * 
 * This allows us to swap between different display approaches:
 * - CodeLens (current implementation)
 * - Floating webviews (future)
 * - Inline decorations (future)
 * 
 * Any class implementing this interface can be used as a display strategy.
 */
export interface IDisplayStrategy {
  /**
   * Called when the extension is activated.
   * Use this to register providers, commands, and event listeners.
   */
  activate(context: vscode.ExtensionContext): void;
  
  /**
   * Called when the extension is deactivated.
   * Use this to clean up resources (dispose panels, providers, etc.)
   */
  deactivate(): void;
  
  /**
   * Called when the editor content changes or needs to be refreshed.
   * Use this to update the display with new function information.
   */
  refresh(editor: vscode.TextEditor): Promise<void>;
}