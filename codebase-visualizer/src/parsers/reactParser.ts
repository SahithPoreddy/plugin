import * as vscode from 'vscode';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import { CodeNode, CodeEdge } from '../types/types';

export interface ParseResult {
  nodes: CodeNode[];
  edges: CodeEdge[];
}

export class ReactParser {
  async parse(fileUri: vscode.Uri, isEntryPoint: boolean = false): Promise<ParseResult> {
    const document = await vscode.workspace.openTextDocument(fileUri);
    const content = document.getText();
    
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];

    try {
      // Parse with Babel
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          'classProperties',
          'dynamicImport'
        ]
      });

      // Traverse AST
      traverse(ast, {
        // React Function Components
        FunctionDeclaration: (path: any) => {
          const node = path.node;
          if (this.isReactComponent(node, content)) {
            nodes.push(this.createComponentNode(node, fileUri, 'function', content));
          } else {
            nodes.push(this.createFunctionNode(node, fileUri, content));
          }
        },

        // Arrow Function Components
        VariableDeclarator: (path: any) => {
          const node = path.node;
          if (node.init && (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) {
            if (this.isReactComponent(node.init, content)) {
              nodes.push(this.createComponentNode(node, fileUri, 'arrow', content));
            }
          }
        },

        // Class Components
        ClassDeclaration: (path: any) => {
          const node = path.node;
          if (this.isReactClassComponent(node)) {
            nodes.push(this.createClassComponentNode(node, fileUri, content));
          }
        },

        // Import statements for edges
        ImportDeclaration: (path: any) => {
          const node = path.node;
          // Create import edges
          // Will be processed later
        }
      });

      // If no nodes were created but this is an entry file (like main.tsx),
      // create a module node for the entire file
      if (nodes.length === 0) {
        const fileName = fileUri.fsPath.split(/[\\/]/).pop() || 'module';
        const baseName = fileName.replace(/\.(tsx?|jsx?)$/, '');
        
        // Check if this looks like an entry file (has ReactDOM.render or createRoot)
        const isBootstrapFile = content.includes('createRoot') || 
                                content.includes('ReactDOM.render') ||
                                content.includes('render(');
        
        if (isBootstrapFile || isEntryPoint) {
          nodes.push(this.createModuleNode(fileUri, content, baseName));
        }
      }

      // Extract relationships
      this.extractRelationships(ast, nodes, edges);

      return { nodes, edges };
    } catch (error) {
      console.error(`Failed to parse ${fileUri.fsPath}:`, error);
      return { nodes: [], edges: [] };
    }
  }

  /**
   * Create a module node for files like main.tsx that don't contain components
   * but are entry points
   */
  private createModuleNode(fileUri: vscode.Uri, content: string, name: string): CodeNode {
    const lines = content.split('\n');
    
    return {
      id: `${fileUri.fsPath}:module:${name}`,
      label: name,
      type: 'module',
      language: fileUri.fsPath.endsWith('.tsx') || fileUri.fsPath.endsWith('.ts') ? 'typescript' : 'javascript',
      filePath: fileUri.fsPath,
      startLine: 1,
      endLine: lines.length,
      sourceCode: content,
      isEntryPoint: true,
      documentation: {
        summary: `Entry point module ${name}`,
        description: `Application bootstrap file that initializes React and renders the root component`,
        persona: {
          'developer': `Entry point that bootstraps the application. Contains ReactDOM.createRoot() or render() call.`,
          'product-manager': `Application entry point - where the app starts`,
          'architect': `Bootstrap module following React 18 patterns`,
          'business-analyst': `Application initialization`
        }
      }
    };
  }

  private isReactComponent(node: any, content: string): boolean {
    // Check if function returns JSX
    if (node.body && node.body.type === 'BlockStatement') {
      // Look for return statements with JSX
      return this.hasJSXReturn(node.body);
    }
    // Arrow functions with implicit return
    if (node.body && node.body.type === 'JSXElement') {
      return true;
    }
    return false;
  }

  private hasJSXReturn(body: any): boolean {
    // Recursively check for JSX in return statements
    if (body.type === 'ReturnStatement') {
      return body.argument && body.argument.type === 'JSXElement';
    }
    if (body.body && Array.isArray(body.body)) {
      return body.body.some((stmt: any) => this.hasJSXReturn(stmt));
    }
    return false;
  }

  private isReactClassComponent(node: any): boolean {
    // Check if class extends React.Component or Component
    if (node.superClass) {
      const superClass = node.superClass;
      if (superClass.type === 'Identifier' && superClass.name === 'Component') {
        return true;
      }
      if (superClass.type === 'MemberExpression' && 
          superClass.property && superClass.property.name === 'Component') {
        return true;
      }
    }
    return false;
  }

  private createComponentNode(node: any, fileUri: vscode.Uri, style: string, content: string): CodeNode {
    const name = node.id?.name || node.key?.name || 'Anonymous';
    const lines = content.split('\n');
    
    return {
      id: `${fileUri.fsPath}:component:${name}`,
      label: name,
      type: 'component',
      language: fileUri.fsPath.endsWith('.tsx') || fileUri.fsPath.endsWith('.ts') ? 'typescript' : 'javascript',
      filePath: fileUri.fsPath,
      startLine: node.loc?.start.line || 0,
      endLine: node.loc?.end.line || 0,
      sourceCode: this.extractSource(content, node.loc?.start.line, node.loc?.end.line),
      props: this.extractProps(node),
      hooks: this.extractHooks(node),
      documentation: this.generateDocumentation(name, 'component')
    };
  }

  private createFunctionNode(node: any, fileUri: vscode.Uri, content: string): CodeNode {
    const name = node.id?.name || 'Anonymous';
    
    return {
      id: `${fileUri.fsPath}:function:${name}:${node.loc?.start.line}`,
      label: name,
      type: 'function',
      language: fileUri.fsPath.endsWith('.tsx') || fileUri.fsPath.endsWith('.ts') ? 'typescript' : 'javascript',
      filePath: fileUri.fsPath,
      startLine: node.loc?.start.line || 0,
      endLine: node.loc?.end.line || 0,
      sourceCode: this.extractSource(content, node.loc?.start.line, node.loc?.end.line),
      parameters: this.extractParameters(node),
      documentation: this.generateDocumentation(name, 'function')
    };
  }

  private createClassComponentNode(node: any, fileUri: vscode.Uri, content: string): CodeNode {
    const name = node.id?.name || 'Anonymous';
    
    return {
      id: `${fileUri.fsPath}:class:${name}`,
      label: name,
      type: 'class',
      language: fileUri.fsPath.endsWith('.tsx') || fileUri.fsPath.endsWith('.ts') ? 'typescript' : 'javascript',
      filePath: fileUri.fsPath,
      startLine: node.loc?.start.line || 0,
      endLine: node.loc?.end.line || 0,
      sourceCode: this.extractSource(content, node.loc?.start.line, node.loc?.end.line),
      documentation: this.generateDocumentation(name, 'class')
    };
  }

  private extractProps(node: any): string[] {
    const props: string[] = [];
    // Extract props from function parameters or PropTypes
    if (node.params && node.params.length > 0) {
      const firstParam = node.params[0];
      if (firstParam.type === 'ObjectPattern') {
        firstParam.properties.forEach((prop: any) => {
          if (prop.key) {
            props.push(prop.key.name);
          }
        });
      }
    }
    return props;
  }

  private extractHooks(node: any): string[] {
    const hooks: string[] = [];
    // This is simplified - in production, traverse the function body
    // and find useState, useEffect, etc.
    return hooks;
  }

  private extractParameters(node: any): any[] {
    const params: any[] = [];
    if (node.params) {
      node.params.forEach((param: any) => {
        params.push({
          name: param.name || 'unknown',
          type: param.typeAnnotation?.typeAnnotation?.type || 'any'
        });
      });
    }
    return params;
  }

  private extractSource(content: string, startLine?: number, endLine?: number): string {
    if (!startLine || !endLine) return '';
    const lines = content.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }

  private extractRelationships(ast: any, nodes: CodeNode[], edges: CodeEdge[]): void {
    // Extract component usage, imports, etc.
    // Simplified version
  }

  private generateDocumentation(name: string, type: string): any {
    return {
      summary: `${type.charAt(0).toUpperCase() + type.slice(1)} ${name}`,
      description: `Auto-generated documentation for ${type} ${name}`,
      persona: {
        'developer': `Implementation details of ${name}`,
        'product-manager': `User-facing functionality of ${name}`,
        'architect': `Design patterns used in ${name}`,
        'business-analyst': `Business logic in ${name}`
      }
    };
  }
}
