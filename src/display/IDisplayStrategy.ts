/**
 * IDisplayStrategy.ts
 * 
 * Interface for display strategies.
 * 
 * This defines the contract that all display implementations must follow.
 * By programming to this interface, we can easily swap between different
 * display approaches (CodeLens, floating webviews, etc.) without changing
 * other parts of the codebase.
 * 
 * Design pattern: Strategy Pattern
 * - Define a family of algorithms (display strategies)
 * - Make them interchangeable
 * - Let clients switch strategies without modifying code
 */
import * as vscode from 'vscode';
/**
 * Interface for display strategies.
 * 
 * Any class implementing this interface can be used to display function annotations.
 */
export interface IDisplayStrategy {
  /**
   * Called when the extension is activated.
   * 
   * Use this to:
   * - Register providers (CodeLens, decorations, etc.)
   * - Register commands
   * - Set up event listeners
   * - Initialize resources
   * 
   * @param context - The extension context for registering disposables
   */
  activate(context: vscode.ExtensionContext): void;
  
  /**
   * Called when the extension is deactivated.
   * 
   * Use this to:
   * - Dispose of resources (panels, providers, etc.)
   * - Clean up event listeners
   * - Save state if needed
   */
  deactivate(): void;
  
  /**
   * Called when the editor content changes and display needs to refresh.
   * 
   * Use this to:
   * - Re-detect functions
   * - Update decorations/CodeLens
   * - Refresh displayed content
   * 
   * @param editor - The active text editor
   * @returns Promise that resolves when refresh is complete
   */
  refresh(editor: vscode.TextEditor): Promise<void>;
}