import * as vscode from 'vscode';
import { AnalysisResult, Persona, CodeNode, ClineContext } from '../types/types';
import { ClineAdapter } from '../cline/adapter';
import { DocumentationGenerator } from '../documentation/generator';
import { GraphBuilder } from '../graph/graphBuilder';
import * as path from 'path';

export class VisualizationPanelReact {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;
  private clineAdapter: ClineAdapter;
  private docGenerator: DocumentationGenerator;
  private graphBuilder: GraphBuilder;
  private currentPersona: Persona = 'developer';
  private currentAnalysis: AnalysisResult | undefined;
  private disposables: vscode.Disposable[] = [];
  private webviewReady: boolean = false;
  private pendingMessages: any[] = [];

  constructor(context: vscode.ExtensionContext, clineAdapter: ClineAdapter) {
    this.context = context;
    this.clineAdapter = clineAdapter;
    this.docGenerator = new DocumentationGenerator();
    this.graphBuilder = new GraphBuilder();
    this.createPanel();
  }

  private createPanel() {
    this.panel = vscode.window.createWebviewPanel(
      'codebaseVisualization',
      'Codebase Visualization',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist')
        ]
      }
    );

    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );

    this.panel.onDidDispose(
      () => this.dispose(),
      null,
      this.disposables
    );
  }

  private async handleMessage(message: any) {
    switch (message.command) {
      case 'webviewReady':
        console.log('Webview is ready, flushing pending messages...');
        this.webviewReady = true;
        // Send any pending messages
        this.pendingMessages.forEach(msg => {
          this.panel?.webview.postMessage(msg);
        });
        this.pendingMessages = [];
        break;

      case 'nodeClicked':
        await this.handleNodeClick(message.nodeId);
        break;
      
      case 'sendToCline':
        await this.handleSendToCline(message.nodeId, message.query);
        break;
      
      case 'changePersona':
        await this.changePersona(message.persona);
        break;
      
      case 'openFile':
        await this.openFileAtLocation(message.filePath, message.line);
        break;

      case 'refreshGraph':
        // Will be handled by extension command
        break;
    }
  }

  private async handleNodeClick(nodeId: string) {
    if (!this.currentAnalysis) return;

    const node = this.currentAnalysis.graph.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Get dependencies and dependents
    const dependencies = this.graphBuilder.getDependencies(this.currentAnalysis.graph, nodeId);
    const dependents = this.graphBuilder.getDependents(this.currentAnalysis.graph, nodeId);

    // Generate documentation
    const documentation = this.docGenerator.generateForNode(node, this.currentPersona);

    // Send to webview
    this.panel?.webview.postMessage({
      command: 'showNodeDetails',
      node: node,
      documentation: documentation,
      dependencies: dependencies.map(d => d.label),
      dependents: dependents.map(d => d.label)
    });
  }

  private async handleSendToCline(nodeId: string, query: string) {
    if (!this.currentAnalysis) return;

    const node = this.currentAnalysis.graph.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Check if Cline is available
    const isClineAvailable = await this.clineAdapter.isClineAvailable();
    if (!isClineAvailable) {
      vscode.window.showWarningMessage(
        'Cline extension is not installed or not available. Please install Cline to use this feature.'
      );
      return;
    }

    // Build context for Cline
    const context: ClineContext = {
      nodeId: node.id,
      nodeName: node.label,
      nodeType: node.type,
      sourceCode: node.sourceCode,
      filePath: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      dependencies: this.graphBuilder.getDependencies(this.currentAnalysis.graph, nodeId).map(d => d.label),
      usedBy: this.graphBuilder.getDependents(this.currentAnalysis.graph, nodeId).map(d => d.label),
      query: query
    };

    // Send to Cline
    await this.clineAdapter.sendModificationRequest(context);
    
    vscode.window.showInformationMessage('Request sent to Cline!');
  }

  private async changePersona(persona: Persona) {
    this.currentPersona = persona;
    
    // If a node is selected, regenerate its documentation
    // This would require tracking the currently selected node
    // For now, just update the persona
    
    vscode.window.showInformationMessage(`Switched to ${persona} persona`);
  }

  private async openFileAtLocation(filePath: string, line: number) {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    
    const position = new vscode.Position(Math.max(0, line - 1), 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );
  }

  updateGraph(analysis: AnalysisResult) {
    this.currentAnalysis = analysis;
    
    console.log('Sending graph to webview:', {
      nodesCount: analysis.graph.nodes.length,
      edgesCount: analysis.graph.edges.length,
      sampleNode: analysis.graph.nodes[0]
    });
    
    const message = {
      command: 'updateGraph',
      graph: analysis.graph
    };
    
    if (this.webviewReady) {
      this.panel?.webview.postMessage(message);
      console.log('Message sent to webview immediately');
    } else {
      console.log('Webview not ready yet, queuing message...');
      this.pendingMessages.push(message);
      // Try sending after a short delay as fallback
      setTimeout(() => {
        if (!this.webviewReady && this.pendingMessages.length > 0) {
          console.log('Fallback: Sending queued messages after timeout');
          this.pendingMessages.forEach(msg => {
            this.panel?.webview.postMessage(msg);
          });
          this.pendingMessages = [];
        }
      }, 1000);
    }
  }

  show() {
    this.panel?.reveal();
  }

  dispose() {
    this.panel?.dispose();
    this.disposables.forEach(d => d.dispose());
  }

  private getHtmlContent(): string {
    const scriptUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codebase Visualization</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: #ffffff;
      overflow: hidden;
    }

    #root {
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
