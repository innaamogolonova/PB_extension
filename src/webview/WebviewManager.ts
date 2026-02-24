// /**
//  * WebviewManager.ts
//  * 
//  * Manages the lifecycle of the webview panel that displays function annotations.
//  * 
//  * Responsibilities:
//  * - Creating the webview panel (lazy creation - only when needed)
//  * - Showing and updating content
//  * - Managing panel state (open/closed)
//  * - Cleaning up resources when panel is disposed
//  * 
//  * Design pattern: Singleton
//  * - Only one panel exists at a time
//  * - Reuses the same panel for different functions
//  * - More efficient than creating/destroying panels repeatedly
//  */
// import * as vscode from 'vscode';
// import { AnnotationContent } from '../types';
// import { getWebviewContent } from './webviewContent';
// /**
//  * Manages a single webview panel for displaying function annotations.
//  * 
//  * Usage:
//  *   const manager = new WebviewManager(context);
//  *   manager.show(annotationContent);  // Opens panel with content
//  *   manager.update(newContent);       // Updates existing panel
//  *   manager.dispose();                // Cleans up
//  */
// export class WebviewManager {
//   /**
//    * The webview panel instance.
//    * - undefined = panel doesn't exist yet (or was closed)
//    * - WebviewPanel = panel is open and active
//    */
//   private panel: vscode.WebviewPanel | undefined;
  
//   /**
//    * Extension context, needed for:
//    * - Adding disposables to subscriptions
//    * - Accessing extension resources (if needed later)
//    */
//   private context: vscode.ExtensionContext;
  
//   /**
//    * Creates a new WebviewManager.
//    * 
//    * @param context - The extension context
//    */
//   constructor(context: vscode.ExtensionContext) {
//     this.context = context;
//   }
  
//   /**
//    * Shows the webview panel with the given content.
//    * 
//    * Behavior:
//    * - If panel doesn't exist, creates it
//    * - If panel exists, reuses it and updates content
//    * - Reveals the panel (brings it to front)
//    * 
//    * @param content - The annotation content to display
//    */
//   public show(content: AnnotationContent): void {
//     // If panel doesn't exist, create it first
//     if (!this.panel) {
//       this.createPanel();
//     }
    
//     // Update the panel's HTML content
//     if (this.panel) {
//       this.panel.webview.html = getWebviewContent(content);
      
//       // Reveal the panel in column 2 (side-by-side with code)
//       this.panel.reveal(vscode.ViewColumn.Two);
//     }
//   }
  
//   /**
//    * Creates a new webview panel.
//    * 
//    * Configuration:
//    * - Type: 'functionAnnotation' (internal identifier)
//    * - Title: What appears in the tab
//    * - Location: ViewColumn.Two (side panel)
//    * - Options: Enable scripts, retain state
//    */
//   private createPanel(): void {
//     this.panel = vscode.window.createWebviewPanel(
//       'functionAnnotation',              // Identifier (internal use)
//       'Function Annotation',             // Title shown to user
//       vscode.ViewColumn.Two,             // Open in second column
//       {
//         enableScripts: true,             // Allow JavaScript in webview
//         retainContextWhenHidden: true,   // Keep state when panel is hidden
//         localResourceRoots: []           // No local file access needed (yet)
//       }
//     );
    
//     // Set up event listener for when panel is closed
//     this.panel.onDidDispose(
//       () => {
//         // Panel was closed, set to undefined so we can create a new one later
//         this.panel = undefined;
//       },
//       null,
//       this.context.subscriptions
//     );
//   }
  
//   /**
//    * Updates the content of an existing panel.
//    * 
//    * More efficient than creating a new panel.
//    * Use this when you just want to refresh the content.
//    * 
//    * @param content - The new content to display
//    */
//   public update(content: AnnotationContent): void {
//     if (this.panel) {
//       this.panel.webview.html = getWebviewContent(content);
//     }
//   }
  
//   /**
//    * Disposes of the webview panel and cleans up resources.
//    * 
//    * Call this when:
//    * - Extension is deactivating
//    * - You want to force-close the panel
//    * - Cleaning up before creating a new manager
//    */
//   public dispose(): void {
//     if (this.panel) {
//       this.panel.dispose();
//       this.panel = undefined;
//     }
//   }
  
//   /**
//    * Checks if the panel is currently visible.
//    * 
//    * @returns true if panel exists and is visible, false otherwise
//    */
//   public isVisible(): boolean {
//     return this.panel !== undefined && this.panel.visible;
//   }
// }