import * as vscode from 'vscode';
import * as path from 'path';
import { CodeNode, CodeEdge } from '../types/types';
import { parse } from 'java-parser';

export interface ParseResult {
  nodes: CodeNode[];
  edges: CodeEdge[];
}

export class JavaParser {
  constructor() {
    // java-parser is used as a function, not a class
  }

  async parse(fileUri: vscode.Uri): Promise<ParseResult> {
    const document = await vscode.workspace.openTextDocument(fileUri);
    const content = document.getText();
    
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];

    try {
      // Parse Java file
      const cst = parse(content);
      
      // Extract classes
      this.extractClasses(cst, fileUri, content, nodes, edges);
      
      return { nodes, edges };
    } catch (error) {
      console.error(`Failed to parse ${fileUri.fsPath}:`, error);
      return { nodes: [], edges: [] };
    }
  }

  private extractClasses(
    cst: any,
    fileUri: vscode.Uri,
    content: string,
    nodes: CodeNode[],
    edges: CodeEdge[]
  ): void {
    // This is a simplified implementation
    // In production, you'd traverse the CST properly
    
    const lines = content.split('\n');
    const classRegex = /(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*class\s+(\w+)/g;
    const methodRegex = /(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*(?:\w+)\s+(\w+)\s*\([^)]*\)/g;

    let match;
    let lineNumber = 0;

    // Extract classes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Find classes
      classRegex.lastIndex = 0;
      match = classRegex.exec(line);
      if (match) {
        const className = match[1];
        const classNode: CodeNode = {
          id: `${fileUri.fsPath}:class:${className}`,
          label: className,
          type: 'class',
          language: 'java',
          filePath: fileUri.fsPath,
          startLine: i,
          endLine: this.findClassEnd(lines, i),
          sourceCode: this.extractSourceCode(lines, i, this.findClassEnd(lines, i)),
          documentation: this.generateDocumentation(className, 'class')
        };
        nodes.push(classNode);
      }

      // Find methods
      methodRegex.lastIndex = 0;
      match = methodRegex.exec(line);
      if (match) {
        const methodName = match[1];
        const methodNode: CodeNode = {
          id: `${fileUri.fsPath}:method:${methodName}:${i}`,
          label: methodName,
          type: 'method',
          language: 'java',
          filePath: fileUri.fsPath,
          startLine: i,
          endLine: this.findMethodEnd(lines, i),
          sourceCode: this.extractSourceCode(lines, i, this.findMethodEnd(lines, i)),
          documentation: this.generateDocumentation(methodName, 'method')
        };
        nodes.push(methodNode);
      }
    }

    // Extract relationships (simplified)
    this.extractRelationships(content, nodes, edges);
  }

  private findClassEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let started = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
          if (started && braceCount === 0) {
            return i;
          }
        }
      }
    }
    return lines.length - 1;
  }

  private findMethodEnd(lines: string[], startLine: number): number {
    // Similar to findClassEnd but for methods
    return this.findClassEnd(lines, startLine);
  }

  private extractSourceCode(lines: string[], startLine: number, endLine: number): string {
    return lines.slice(startLine, endLine + 1).join('\n');
  }

  private extractRelationships(content: string, nodes: CodeNode[], edges: CodeEdge[]): void {
    // Extract method calls, extends, implements relationships
    // This is a simplified version - you'd want more sophisticated analysis
    
    const extendsRegex = /class\s+(\w+)\s+extends\s+(\w+)/g;
    const implementsRegex = /class\s+(\w+)\s+implements\s+(\w+)/g;

    let match;
    
    while ((match = extendsRegex.exec(content)) !== null) {
      const fromClass = match[1];
      const toClass = match[2];
      const fromNode = nodes.find(n => n.label === fromClass && n.type === 'class');
      const toNode = nodes.find(n => n.label === toClass && n.type === 'class');
      
      if (fromNode && toNode) {
        edges.push({
          from: fromNode.id,
          to: toNode.id,
          type: 'extends',
          label: 'extends'
        });
      }
    }

    while ((match = implementsRegex.exec(content)) !== null) {
      const fromClass = match[1];
      const toInterface = match[2];
      const fromNode = nodes.find(n => n.label === fromClass && n.type === 'class');
      const toNode = nodes.find(n => n.label === toInterface);
      
      if (fromNode && toNode) {
        edges.push({
          from: fromNode.id,
          to: toNode.id,
          type: 'implements',
          label: 'implements'
        });
      }
    }
  }

  private generateDocumentation(name: string, type: string): any {
    // Generate basic documentation - will be enhanced by documentation generator
    return {
      summary: `${type.charAt(0).toUpperCase() + type.slice(1)} ${name}`,
      description: `Auto-generated documentation for ${type} ${name}`,
      persona: {
        'developer': `Technical implementation of ${name}`,
        'product-manager': `Business functionality provided by ${name}`,
        'architect': `Architectural role of ${name} in the system`,
        'business-analyst': `Business process handled by ${name}`
      }
    };
  }
}
