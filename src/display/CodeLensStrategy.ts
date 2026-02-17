/**
 * CodeLensStrategy.ts
 * 
 * Display strategy that uses CodeLens to show function annotations.
 * 
 * CodeLens = clickable inline text that appears above code elements
 * (like "0 references" in VS Code)
 * 
 * How it works:
 * 1. Detects functions in the active file
 * 2. Creates a CodeLens above each function
 * 3. When clicked, generates annotation and shows in webview panel
 * 4. Manages the webview lifecycle
 * 
 * This class implements TWO interfaces:
 * - IDisplayStrategy: Our custom strategy interface
 * - CodeLensProvider: VS Code's interface for providing CodeLens
 */
import * as vscode from 'vscode';
import { IDisplayStrategy } from './IDisplayStrategy';
import { FunctionInfo } from '../types';
import { detectFunctions } from '../functionDetector';
import { generateAnnotation } from '../services/basicLLMService';
import { WebviewManager } from '../webview/WebviewManager';
/**
 * CodeLens-based display strategy.
 * 
 * Implements both IDisplayStrategy and CodeLensProvider.
 */
export class CodeLensStrategy implements IDisplayStrategy, vscode.CodeLensProvider {
  /**
   * Manages the webview panel for displaying annotations.
   */
  private webviewManager: WebviewManager | undefined;
  
  /**
   * Extension context stored for use in annotation generation.
   */
  private context!: vscode.ExtensionContext;
  
  /**
   * Array of disposables to clean up when deactivated.
   * Includes providers, commands, event listeners.
   */
  private disposables: vscode.Disposable[] = [];
  
  /**
   * Activates the CodeLens strategy.
   * 
   * Steps:
   * 1. Create WebviewManager
   * 2. Register as a CodeLens provider
   * 3. Register the click command
   * 4. Set up event listeners
   */
  public activate(context: vscode.ExtensionContext): void {
    console.log('CodeLensStrategy: Activating');
    
    // Store context for later use
    this.context = context;
    
    // Create the webview manager
    this.webviewManager = new WebviewManager(context);
    
    // Register this class as a CodeLens provider for all files
    const codeLensProvider = vscode.languages.registerCodeLensProvider(
      { pattern: '**/*' },  // All files
      this                   // This class provides the CodeLens
    );
    
    this.disposables.push(codeLensProvider);
    context.subscriptions.push(codeLensProvider);
    
    // Register the command that's called when CodeLens is clicked
    const showAnnotationCommand = vscode.commands.registerCommand(
      'functionAnnotations.showAnnotation',
      async (functionInfo: FunctionInfo) => {
        await this.showAnnotation(functionInfo);
      }
    );
    
    this.disposables.push(showAnnotationCommand);
    context.subscriptions.push(showAnnotationCommand);
    
    console.log('CodeLensStrategy: Activated successfully');
  }
  
  /**
   * Deactivates the CodeLens strategy.
   * Cleans up all resources.
   */
  public deactivate(): void {
    console.log('CodeLensStrategy: Deactivating');
    
    // Dispose of webview manager
    if (this.webviewManager) {
      this.webviewManager.dispose();
      this.webviewManager = undefined;
    }
    
    // Dispose of all registered providers and commands
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    
    console.log('CodeLensStrategy: Deactivated');
  }
  
  /**
   * Refreshes the display for the given editor.
   * 
   * Note: For CodeLens, VS Code automatically re-requests CodeLens
   * when the document changes, so we don't need to do anything here.
   * 
   * This method is here to satisfy the IDisplayStrategy interface.
   */
  public async refresh(editor: vscode.TextEditor): Promise<void> {
    // CodeLens refreshes automatically, nothing to do
    // In a floating webview strategy, we'd recalculate positions here
  }
  
  /**
   * Provides CodeLens for a document (Phase 1).
   * 
   * This is called by VS Code to get CodeLens positions.
   * Should be FAST - just return positions, not content.
   * 
   * @param document - The document to provide CodeLens for
   * @param token - Cancellation token
   * @returns Array of CodeLens objects (without commands yet)
   */
  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    
    // Detect all functions in the document
    const functions = await detectFunctions(document);
    
    if (functions.length === 0) {
      return [];
    }
    
    // Create a CodeLens for each function
    const codeLenses = functions.map(functionInfo => {
      // Create range at the start of the function (line 0, char 0)
      const range = new vscode.Range(
        functionInfo.startLine, 0,
        functionInfo.startLine, 0
      );
      
      // Create the CodeLens (without command yet)
      const codeLens = new vscode.CodeLens(range);
      
      // Store function info for later (in resolveCodeLens)
      // TypeScript doesn't like this, but it works
      (codeLens as any).functionInfo = functionInfo;
      
      return codeLens;
    });
    
    console.log(`CodeLensStrategy: Provided ${codeLenses.length} CodeLens`);
    return codeLenses;
  }
  
  /**
   * Resolves a CodeLens (Phase 2).
   * 
   * This is called by VS Code to add the command/text to the CodeLens.
   * Can be slower - adds the clickable text and behavior.
   * 
   * @param codeLens - The CodeLens to resolve
   * @param token - Cancellation token
   * @returns Resolved CodeLens with command
   */
  public async resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    
    // Retrieve the function info we stored earlier
    const functionInfo = (codeLens as any).functionInfo as FunctionInfo;
    
    if (!functionInfo) {
      return codeLens;
    }
    
    // Set the command that runs when clicked
    codeLens.command = {
      title: `📊 View ${functionInfo.name}`,
      command: 'functionAnnotations.showAnnotation',
      arguments: [functionInfo]
    };
    
    return codeLens;
  }
  
  /**
   * Shows the annotation for a function.
   * Called when user clicks the CodeLens.
   * 
   * Steps:
   * 1. Show loading state in webview
   * 2. Generate annotation (call mock LLM service)
   * 3. Update webview with real content
   * 
   * @param functionInfo - Information about the function to annotate
   */
  public async showAnnotation(functionInfo: FunctionInfo): Promise<void> {
    if (!this.webviewManager) {
      console.error('CodeLensStrategy: WebviewManager not initialized');
      return;
    }
    
    console.log(`CodeLensStrategy: Showing annotation for ${functionInfo.name}`);
    
    // Step 1: Show loading state
    this.webviewManager.show({
      functionName: functionInfo.name,
      summary: '',
      timestamp: new Date(),
      isLoading: true
    });
    
    try {
      // Step 2: Generate the annotation (simulates LLM call)
      const content = await generateAnnotation(functionInfo, this.context);
      
      // Step 3: Update with real content
      this.webviewManager.update(content);
      
      console.log(`CodeLensStrategy: Annotation generated for ${functionInfo.name}`);
    } catch (error) {
      console.error('CodeLensStrategy: Error generating annotation', error);
      
      // Show error in webview
      this.webviewManager.update({
        functionName: functionInfo.name,
        summary: 'Error generating annotation',
        timestamp: new Date(),
        isLoading: false
      });
    }
  }
}