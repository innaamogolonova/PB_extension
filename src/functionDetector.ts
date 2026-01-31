/**
 * functionDetector.ts
 * 
 * Detects and extracts information about functions in source code files.
 * 
 * How it works:
 * 1. Uses VS Code's Document Symbol Provider API
 * 2. Recursively searches for Function, Method, and Constructor symbols
 * 3. Extracts relevant information (name, location, code)
 * 4. Returns array of FunctionInfo objects
 * 
 * Language support: Works with any language that has a VS Code extension
 * providing symbol information (Python, JavaScript, TypeScript, Java, etc.)
 */
import * as vscode from 'vscode';
import { FunctionInfo } from './types';

/**
 * Detects all functions in a given document.
 * 
 * @param document - The text document to analyze
 * @returns Array of FunctionInfo objects, one for each detected function
 * 
 * Example usage:
 *   const functions = await detectFunctions(document);
 *   console.log(`Found ${functions.length} functions`);
 */
export async function detectFunctions(
  document: vscode.TextDocument
): Promise<FunctionInfo[]> {
  
  // Step 1: Ask VS Code for all symbols in this document
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    document.uri
  );
  
  // Step 2: If no symbols found (empty file or unsupported language), return empty
  if (!symbols || symbols.length === 0) {
    console.log('No symbols found in document');
    return [];
  }
  
  // Step 3: Recursively find all function symbols
  const functionSymbols = findFunctionSymbols(symbols);
  
  // Step 4: Convert symbols to FunctionInfo objects
  const functionInfos = functionSymbols.map(symbol => 
    symbolToFunctionInfo(symbol, document)
  );
  
  console.log(`Detected ${functionInfos.length} functions`);
  return functionInfos;
}
/**
 * Recursively finds all function-like symbols in a symbol tree.
 * 
 * Why recursive? Because symbols can be nested:
 * - Functions inside modules
 * - Methods inside classes
 * - Nested functions
 * 
 * @param symbols - Array of document symbols to search
 * @returns Flattened array of all function symbols
 */
function findFunctionSymbols(
  symbols: vscode.DocumentSymbol[]
): vscode.DocumentSymbol[] {
  const results: vscode.DocumentSymbol[] = [];
  
  for (const symbol of symbols) {
    // Check if this symbol is a function/method/constructor
    if (isFunctionLikeSymbol(symbol)) {
      results.push(symbol);
    }
    
    // Recursively search children (e.g., methods inside a class)
    if (symbol.children && symbol.children.length > 0) {
      const childFunctions = findFunctionSymbols(symbol.children);
      results.push(...childFunctions);
    }
  }
  
  return results;
}
/**
 * Checks if a symbol represents a function, method, or constructor.
 * 
 * @param symbol - The symbol to check
 * @returns true if it's a function-like symbol
 */
function isFunctionLikeSymbol(symbol: vscode.DocumentSymbol): boolean {
  return (
    symbol.kind === vscode.SymbolKind.Function ||
    symbol.kind === vscode.SymbolKind.Method ||
    symbol.kind === vscode.SymbolKind.Constructor
  );
}
/**
 * Converts a VS Code DocumentSymbol to our FunctionInfo type.
 * 
 * Extracts:
 * - Name
 * - Location (range, line numbers)
 * - Source code
 * 
 * @param symbol - The symbol to convert
 * @param document - The document containing the symbol
 * @returns FunctionInfo object
 */
function symbolToFunctionInfo(
  symbol: vscode.DocumentSymbol,
  document: vscode.TextDocument
): FunctionInfo {
  return {
    name: symbol.name,
    range: symbol.range,
    startLine: symbol.range.start.line,
    endLine: symbol.range.end.line,
    functionCode: document.getText(symbol.range),
    symbolKind: symbol.kind
  };
}