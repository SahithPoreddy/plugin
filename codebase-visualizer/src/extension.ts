import * as vscode from 'vscode';
import { VisualizationPanelReact } from './webview/visualizationPanelReact';
import { WorkspaceAnalyzer } from './analyzers/workspaceAnalyzer';
import { ClineAdapter } from './cline/adapter';
import { FileLogger } from './utils/fileLogger';
import { CodebaseDocGenerator } from './documentation/codebaseDocGenerator';
import { RAGService } from './rag/ragService';

let visualizationPanel: VisualizationPanelReact | undefined;
let workspaceAnalyzer: WorkspaceAnalyzer;
let clineAdapter: ClineAdapter;
let logger: FileLogger;
let docGenerator: CodebaseDocGenerator;
let ragService: RAGService;

export async function activate(context: vscode.ExtensionContext) {
  // Initialize file logger
  logger = new FileLogger(context);
  logger.log('Codebase Visualizer extension activated');
  
  console.log('Codebase Visualizer extension activated');

  // Initialize services
  workspaceAnalyzer = new WorkspaceAnalyzer();
  clineAdapter = new ClineAdapter();
  docGenerator = new CodebaseDocGenerator();
  ragService = new RAGService();
  
  // Show log file location
  logger.log('Extension services initialized');
  logger.log('Log file location', { path: logger.getLogFilePath() });

  // Register commands
  const showVisualizationCommand = vscode.commands.registerCommand(
    'codebase-visualizer.showVisualization',
    async () => {
      await showVisualization(context);
    }
  );

  const refreshVisualizationCommand = vscode.commands.registerCommand(
    'codebase-visualizer.refreshVisualization',
    async () => {
      if (visualizationPanel) {
        await refreshVisualization();
      } else {
        vscode.window.showWarningMessage('Visualization panel is not open');
      }
    }
  );

  const changePersonaCommand = vscode.commands.registerCommand(
    'codebase-visualizer.changePersona',
    async () => {
      await changePersona();
    }
  );

  const openLogFileCommand = vscode.commands.registerCommand(
    'codebase-visualizer.openLogFile',
    async () => {
      const logPath = logger.getLogFilePath();
      const document = await vscode.workspace.openTextDocument(logPath);
      await vscode.window.showTextDocument(document);
      vscode.window.showInformationMessage(`Log file: ${logPath}`);
    }
  );

  context.subscriptions.push(
    showVisualizationCommand,
    refreshVisualizationCommand,
    changePersonaCommand,
    openLogFileCommand,
    logger
  );

  // Check if Cline is available
  const clineExtension = vscode.extensions.getExtension('saoudrizwan.claude-dev');
  if (!clineExtension) {
    vscode.window.showWarningMessage(
      'Cline extension not found. Code modification features will be disabled. Install Cline from the marketplace.',
      'Install Cline'
    ).then(selection => {
      if (selection === 'Install Cline') {
        vscode.commands.executeCommand('workbench.extensions.search', 'saoudrizwan.claude-dev');
      }
    });
  }
}

async function showVisualization(context: vscode.ExtensionContext) {
  logger.log('\n' + '='.repeat(80));
  logger.log('showVisualization command triggered');
  
  const workspaceFolders = vscode.workspace.workspaceFolders;
  
  if (!workspaceFolders || workspaceFolders.length === 0) {
    logger.error('No workspace folder open');
    vscode.window.showErrorMessage('Please open a workspace folder first');
    return;
  }
  
  const workspaceUri = workspaceFolders[0].uri;
  logger.log('Workspace folder', { path: workspaceUri.fsPath });

  // Show progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing Codebase',
      cancellable: false
    },
    async (progress) => {
      progress.report({ increment: 0, message: 'Starting analysis...' });
      logger.log('Starting workspace analysis...');

      // Analyze workspace
      let analysisResult;
      try {
        analysisResult = await workspaceAnalyzer.analyze(workspaceUri);
        logger.log('Workspace analysis completed successfully');
      } catch (error) {
        logger.error('Workspace analysis failed', error);
        throw error;
      }

      progress.report({ increment: 30, message: 'Generating documentation...' });
      
      // Generate codebase documentation
      let documentation;
      try {
        documentation = await docGenerator.generateCodebaseDocs(analysisResult, workspaceUri);
        logger.log('Documentation generated', { 
          folder: docGenerator.getDocsFolder(),
          components: documentation.components.length 
        });
        vscode.window.showInformationMessage(
          `📚 Documentation generated in Agentic_Plugin_Docs folder (${documentation.components.length} components)`
        );
      } catch (error) {
        logger.error('Documentation generation failed', error);
        // Continue without docs
      }

      progress.report({ increment: 50, message: 'Indexing for RAG...' });
      
      // Initialize RAG service and index documents
      try {
        await ragService.initialize(workspaceUri);
        
        if (documentation) {
          const ragChunks = docGenerator.generateRAGChunks(documentation);
          await ragService.indexDocuments(ragChunks);
          logger.log('RAG indexing complete', { 
            chunks: ragChunks.length,
            usingLocalFallback: ragService.isUsingLocalFallback()
          });
        }
      } catch (error) {
        logger.error('RAG indexing failed', error);
        // Continue without RAG
      }

      progress.report({ increment: 70, message: 'Building visualization...' });

      // Create or show visualization panel
      if (visualizationPanel && !visualizationPanel.isDisposed) {
        visualizationPanel.show();
      } else {
        // Create new panel
        visualizationPanel = new VisualizationPanelReact(context, clineAdapter, ragService);
        
        // Set callback to clear reference when panel is closed
        visualizationPanel.onDispose = () => {
          visualizationPanel = undefined;
          logger.log('Visualization panel disposed');
        };
      }

      // Update panel with analysis results
      const resultSummary = {
        nodes: analysisResult.graph.nodes.length,
        edges: analysisResult.graph.edges.length,
        errors: analysisResult.errors.length,
        warnings: analysisResult.warnings.length,
        entryPoints: analysisResult.graph.metadata.entryPoints?.length || 0
      };
      
      logger.log('Analysis complete', resultSummary);
      console.log('Analysis complete:', resultSummary);
      
      if (analysisResult.graph.nodes.length === 0) {
        logger.error('WARNING: No nodes found in analysis!');
        logger.log('Analysis warnings', analysisResult.warnings);
        logger.log('Analysis errors', analysisResult.errors);
      } else {
        logger.log('Sample nodes', analysisResult.graph.nodes.slice(0, 3));
      }
      
      logger.log('Updating visualization panel with graph data...');
      visualizationPanel.updateGraph(analysisResult);
      logger.log('Graph update sent to panel');

      progress.report({ increment: 100, message: 'Done!' });
    }
  );
}

async function refreshVisualization() {
  if (!visualizationPanel) return;

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return;

  const analysisResult = await workspaceAnalyzer.analyze(workspaceFolders[0].uri);
  visualizationPanel.updateGraph(analysisResult);
}

async function changePersona() {
  const personas = [
    { label: '👨‍💻 Developer', value: 'developer', description: 'Technical implementation details' },
    { label: '📊 Product Manager', value: 'product-manager', description: 'Business features and user stories' },
    { label: '🏗️ Architect', value: 'architect', description: 'System design and patterns' },
    { label: '📈 Business Analyst', value: 'business-analyst', description: 'Process flows and requirements' }
  ];

  const selected = await vscode.window.showQuickPick(personas, {
    placeHolder: 'Select documentation persona'
  });

  if (selected) {
    vscode.window.showInformationMessage(`Persona changed to ${selected.label}`);
  }
}

export function deactivate() {
  console.log('Codebase Visualizer extension deactivated');
}
