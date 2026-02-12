/**
 * webviewContent.ts
 * 
 * Generates the HTML content displayed in the webview panel.
 * 
 * This file is responsible for:
 * - Creating a complete HTML document structure
 * - Applying CSS styling that respects VS Code themes
 * - Displaying annotation content (summary, visualization)
 * - Showing loading states
 * - Making content scrollable
 * 
 * The HTML uses VS Code CSS variables so it automatically matches
 * the user's theme (dark mode, light mode, custom themes).
 */
import { AnnotationContent } from '../types';

/**
 * Generates the complete HTML content for the webview panel.
 * 
 * Creates a full HTML document with:
 * - DOCTYPE and meta tags
 * - Inline CSS for styling
 * - Header with function name and timestamp
 * - Content area (loading state or actual content)
 * - Scrollable layout
 * 
 * @param content - The annotation content to display
 * @returns Complete HTML document as a string
 * 
 * Example usage:
 *   const html = getWebviewContent(annotationContent);
 *   webviewPanel.webview.html = html;
 */
export function getWebviewContent(content: AnnotationContent): string {
  // If still loading, show loading state
  if (content.isLoading) {
    return getLoadingContent(content.functionName);
  }
  
  // Otherwise, show the actual content
  return getFullContent(content);
}
/**
 * Generates HTML for the loading state.
 * Displayed while the annotation is being generated.
 * 
 * @param functionName - Name of the function being analyzed
 * @returns HTML document with loading spinner
 */
function getLoadingContent(functionName: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Function Annotation</title>
      <style>${getBaseStyles()}</style>
    </head>
    <body>
      <div class="header">
        <div class="function-name">${functionName}</div>
      </div>
      
      <div class="loading-container">
        <div class="loading-spinner">⏳</div>
        <div class="loading-text">Generating annotation...</div>
      </div>
    </body>
    </html>
  `;
}
/**
 * Generates HTML for the full content (after loading).
 * Displays the complete annotation with summary and visualization.
 * 
 * @param content - The complete annotation content
 * @returns HTML document with full content
 */
function getFullContent(content: AnnotationContent): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Function Annotation - ${content.functionName}</title>
      <style>${getBaseStyles()}</style>
    </head>
    <body>
      <div class="header">
        <div class="function-name">${content.functionName}</div>
        <div class="timestamp">Generated: ${formatTimestamp(content.timestamp)}</div>
      </div>
      
      <div class="content-container">
        <div class="summary-section">
          <h3 class="section-title">Summary</h3>
          <div class="summary-content">${content.summary}</div>
        </div>
        
      </div>
    </body>
    </html>
  `;
}
/**
 * Formats a timestamp into a readable string.
 * 
 * @param date - The date to format
 * @returns Formatted date string (e.g., "Jan 31, 2026, 9:47 AM")
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}
/**
 * Returns the base CSS styles for the webview.
 * 
 * Uses VS Code CSS variables to automatically match the user's theme:
 * - --vscode-foreground: Text color
 * - --vscode-editor-background: Background color
 * - --vscode-panel-border: Border color
 * - etc.
 * 
 * Benefits:
 * - Automatically adapts to dark/light themes
 * - Respects user's color customizations
 * - Consistent with VS Code's UI
 * 
 * @returns CSS as a string
 */
function getBaseStyles(): string {
  return `
    /* Reset and base styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 0;
      margin: 0;
      overflow-x: hidden;
    }
    
    /* Header section */
    .header {
      position: sticky;
      top: 0;
      background-color: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 16px;
      z-index: 10;
    }
    
    .function-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--vscode-symbolIcon-functionForeground);
      margin-bottom: 4px;
    }
    
    .timestamp {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.8;
    }
    
    /* Loading state */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
    }
    
    .loading-spinner {
      font-size: 48px;
      margin-bottom: 16px;
      animation: pulse 2s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .loading-text {
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }
    
    /* Content container */
    .content-container {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(100vh - 80px);
    }
    
    /* Summary section */
    .summary-section {
      margin-bottom: 24px;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .summary-content {
      background-color: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textBlockQuote-border);
      padding: 12px 16px;
      line-height: 1.6;
      border-radius: 2px;
    }
    
    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 10px;
    }
    
    ::-webkit-scrollbar-track {
      background: var(--vscode-scrollbarSlider-background);
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-hoverBackground);
      border-radius: 5px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-activeBackground);
    }
  `;
}
