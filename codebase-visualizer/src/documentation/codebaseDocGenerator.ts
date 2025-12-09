import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CodeNode, CodeEdge, AnalysisResult, Persona } from '../types/types';

interface ComponentDoc {
  id: string;
  name: string;
  type: string;
  language: string;
  filePath: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  sourceCode: string;
  summary: string;
  technicalDetails: string;
  dependencies: string[];
  dependents: string[];
  patterns: string[];
  props?: string[];
  hooks?: string[];
  parameters?: { name: string; type: string }[];
  returnType?: string;
}

interface CodebaseDocumentation {
  projectName: string;
  generatedAt: string;
  totalFiles: number;
  totalComponents: number;
  languages: string[];
  entryPoints: string[];
  components: ComponentDoc[];
  architecture: {
    overview: string;
    layers: string[];
    patterns: string[];
  };
}

/**
 * Generates comprehensive documentation for the entire codebase
 * and saves it to the Agentic_Plugin_Docs folder
 */
export class CodebaseDocGenerator {
  private docsFolder: string = '';
  private workspaceRoot: string = '';

  /**
   * Generate documentation for the entire codebase
   */
  async generateCodebaseDocs(
    analysisResult: AnalysisResult,
    workspaceUri: vscode.Uri
  ): Promise<CodebaseDocumentation> {
    this.workspaceRoot = workspaceUri.fsPath;
    this.docsFolder = path.join(this.workspaceRoot, 'Agentic_Plugin_Docs');

    // Create docs folder if it doesn't exist
    if (!fs.existsSync(this.docsFolder)) {
      fs.mkdirSync(this.docsFolder, { recursive: true });
    }

    const { nodes, edges } = analysisResult.graph;
    const projectName = path.basename(this.workspaceRoot);

    // Generate documentation for each component
    const componentDocs: ComponentDoc[] = nodes.map(node => 
      this.generateComponentDoc(node, edges, nodes)
    );

    // Analyze architecture
    const architecture = this.analyzeArchitecture(nodes, edges);

    // Create the full documentation object
    const documentation: CodebaseDocumentation = {
      projectName,
      generatedAt: new Date().toISOString(),
      totalFiles: analysisResult.graph.metadata.totalFiles,
      totalComponents: nodes.length,
      languages: analysisResult.graph.metadata.languages,
      entryPoints: analysisResult.graph.metadata.entryPoints || [],
      components: componentDocs,
      architecture
    };

    // Save documentation files
    await this.saveDocumentation(documentation);

    return documentation;
  }

  /**
   * Generate documentation for a single component
   */
  private generateComponentDoc(
    node: CodeNode,
    edges: CodeEdge[],
    allNodes: CodeNode[]
  ): ComponentDoc {
    // Find dependencies (what this component imports)
    const dependencies = edges
      .filter(e => e.from === node.filePath)
      .map(e => {
        const targetNode = allNodes.find(n => n.filePath === e.to);
        return targetNode ? targetNode.label : path.basename(e.to);
      });

    // Find dependents (what imports this component)
    const dependents = edges
      .filter(e => e.to === node.filePath)
      .map(e => {
        const sourceNode = allNodes.find(n => n.filePath === e.from);
        return sourceNode ? sourceNode.label : path.basename(e.from);
      });

    // Analyze patterns in the code
    const patterns = this.detectPatterns(node.sourceCode);

    // Generate summary
    const summary = this.generateSummary(node, dependencies, dependents, patterns);

    // Generate technical details
    const technicalDetails = this.generateTechnicalDetails(node);

    return {
      id: node.id,
      name: node.label,
      type: node.type,
      language: node.language,
      filePath: node.filePath,
      relativePath: path.relative(this.workspaceRoot, node.filePath),
      startLine: node.startLine,
      endLine: node.endLine,
      sourceCode: node.sourceCode,
      summary,
      technicalDetails,
      dependencies,
      dependents,
      patterns,
      props: node.props,
      hooks: node.hooks,
      parameters: node.parameters,
      returnType: node.returnType
    };
  }

  /**
   * Detect patterns in source code
   */
  private detectPatterns(sourceCode: string): string[] {
    const patterns: string[] = [];
    
    if (!sourceCode) return patterns;

    // React patterns
    if (sourceCode.includes('useState')) patterns.push('State Management (useState)');
    if (sourceCode.includes('useEffect')) patterns.push('Side Effects (useEffect)');
    if (sourceCode.includes('useContext')) patterns.push('Context Consumer');
    if (sourceCode.includes('useReducer')) patterns.push('Reducer Pattern');
    if (sourceCode.includes('useMemo') || sourceCode.includes('useCallback')) patterns.push('Memoization');
    if (sourceCode.includes('useRef')) patterns.push('Ref Usage');
    if (sourceCode.includes('createContext')) patterns.push('Context Provider');
    
    // API patterns
    if (sourceCode.includes('fetch(') || sourceCode.includes('axios')) patterns.push('HTTP Requests');
    if (sourceCode.includes('async ') && sourceCode.includes('await ')) patterns.push('Async/Await');
    if (sourceCode.includes('.then(')) patterns.push('Promise Chains');
    
    // Error handling
    if (sourceCode.includes('try') && sourceCode.includes('catch')) patterns.push('Error Handling');
    
    // Storage
    if (sourceCode.includes('localStorage')) patterns.push('Local Storage');
    if (sourceCode.includes('sessionStorage')) patterns.push('Session Storage');
    
    // State management libraries
    if (sourceCode.includes('dispatch') || sourceCode.includes('Redux')) patterns.push('Redux/State Management');
    if (sourceCode.includes('zustand') || sourceCode.includes('create(')) patterns.push('Zustand Store');
    
    // Routing
    if (sourceCode.includes('useNavigate') || sourceCode.includes('useRouter')) patterns.push('Routing');
    if (sourceCode.includes('useParams') || sourceCode.includes('useSearchParams')) patterns.push('URL Parameters');
    
    // Form handling
    if (sourceCode.includes('onSubmit') || sourceCode.includes('handleSubmit')) patterns.push('Form Handling');
    if (sourceCode.includes('useState') && sourceCode.includes('onChange')) patterns.push('Controlled Inputs');
    
    // Event handling
    if (sourceCode.includes('addEventListener') || sourceCode.includes('onClick')) patterns.push('Event Handling');
    
    return patterns;
  }

  /**
   * Generate a comprehensive summary for a component
   */
  private generateSummary(
    node: CodeNode,
    dependencies: string[],
    dependents: string[],
    patterns: string[]
  ): string {
    const parts: string[] = [];

    // Type-specific description
    switch (node.type) {
      case 'component':
        parts.push(`${node.label} is a React component that provides UI functionality.`);
        if (node.props && node.props.length > 0) {
          parts.push(`It accepts ${node.props.length} props: ${node.props.slice(0, 5).join(', ')}${node.props.length > 5 ? '...' : ''}.`);
        }
        if (node.hooks && node.hooks.length > 0) {
          parts.push(`Uses React hooks: ${node.hooks.join(', ')}.`);
        }
        break;
      case 'class':
        parts.push(`${node.label} is a ${node.language} class that encapsulates related functionality.`);
        break;
      case 'function':
        parts.push(`${node.label} is a utility function.`);
        if (node.parameters && node.parameters.length > 0) {
          parts.push(`Takes ${node.parameters.length} parameter(s): ${node.parameters.map(p => p.name).join(', ')}.`);
        }
        if (node.returnType) {
          parts.push(`Returns: ${node.returnType}.`);
        }
        break;
      case 'method':
        parts.push(`${node.label} is a method that performs a specific operation.`);
        break;
      default:
        parts.push(`${node.label} is a ${node.type} in the codebase.`);
    }

    // Dependencies info
    if (dependencies.length > 0) {
      parts.push(`Depends on: ${dependencies.slice(0, 5).join(', ')}${dependencies.length > 5 ? ` and ${dependencies.length - 5} more` : ''}.`);
    }

    // Dependents info
    if (dependents.length > 0) {
      parts.push(`Used by: ${dependents.slice(0, 5).join(', ')}${dependents.length > 5 ? ` and ${dependents.length - 5} more` : ''}.`);
    }

    // Patterns detected
    if (patterns.length > 0) {
      parts.push(`Implements patterns: ${patterns.join(', ')}.`);
    }

    return parts.join(' ');
  }

  /**
   * Generate technical details for a component
   */
  private generateTechnicalDetails(node: CodeNode): string {
    const details: string[] = [];

    details.push(`File: ${path.basename(node.filePath)}`);
    details.push(`Lines: ${node.startLine}-${node.endLine} (${node.endLine - node.startLine + 1} lines)`);
    details.push(`Language: ${node.language}`);
    details.push(`Type: ${node.type}`);

    if (node.isAsync) details.push('Async: Yes');
    if (node.isStatic) details.push('Static: Yes');
    if (node.visibility) details.push(`Visibility: ${node.visibility}`);
    if (node.isEntryPoint) details.push('Entry Point: Yes');

    return details.join('\n');
  }

  /**
   * Analyze the overall architecture of the codebase
   */
  private analyzeArchitecture(nodes: CodeNode[], edges: CodeEdge[]): {
    overview: string;
    layers: string[];
    patterns: string[];
  } {
    // Categorize files by directory/type
    const directories = new Map<string, number>();
    const types = new Map<string, number>();

    nodes.forEach(node => {
      const dir = path.dirname(node.filePath);
      const relDir = path.relative(this.workspaceRoot, dir).split(path.sep)[0] || 'root';
      directories.set(relDir, (directories.get(relDir) || 0) + 1);
      types.set(node.type, (types.get(node.type) || 0) + 1);
    });

    // Detect layers
    const layers: string[] = [];
    const dirEntries = Array.from(directories.entries()).sort((a, b) => b[1] - a[1]);
    dirEntries.forEach(([dir, count]) => {
      layers.push(`${dir}: ${count} components`);
    });

    // Detect overall patterns
    const allPatterns = new Set<string>();
    nodes.forEach(node => {
      this.detectPatterns(node.sourceCode).forEach(p => allPatterns.add(p));
    });

    // Generate overview
    const typeBreakdown = Array.from(types.entries())
      .map(([t, c]) => `${c} ${t}s`)
      .join(', ');

    const overview = `This codebase contains ${nodes.length} components (${typeBreakdown}) organized across ${directories.size} directories. ` +
      `It has ${edges.length} import relationships between components.`;

    return {
      overview,
      layers: layers.slice(0, 10),
      patterns: Array.from(allPatterns).slice(0, 15)
    };
  }

  /**
   * Save documentation to files
   */
  private async saveDocumentation(documentation: CodebaseDocumentation): Promise<void> {
    // Save main JSON documentation
    const jsonPath = path.join(this.docsFolder, 'codebase-documentation.json');
    fs.writeFileSync(jsonPath, JSON.stringify(documentation, null, 2));

    // Save markdown overview
    const markdownPath = path.join(this.docsFolder, 'README.md');
    const markdown = this.generateMarkdownOverview(documentation);
    fs.writeFileSync(markdownPath, markdown);

    // Save individual component docs
    const componentsDir = path.join(this.docsFolder, 'components');
    if (!fs.existsSync(componentsDir)) {
      fs.mkdirSync(componentsDir, { recursive: true });
    }

    documentation.components.forEach(comp => {
      const compFileName = comp.name.replace(/[^a-zA-Z0-9]/g, '_') + '.md';
      const compPath = path.join(componentsDir, compFileName);
      const compMarkdown = this.generateComponentMarkdown(comp);
      fs.writeFileSync(compPath, compMarkdown);
    });

    // Save RAG-optimized chunks
    const chunksPath = path.join(this.docsFolder, 'rag-chunks.json');
    const chunks = this.generateRAGChunks(documentation);
    fs.writeFileSync(chunksPath, JSON.stringify(chunks, null, 2));
  }

  /**
   * Generate markdown overview of the codebase
   */
  private generateMarkdownOverview(doc: CodebaseDocumentation): string {
    const lines: string[] = [];

    lines.push(`# ${doc.projectName} - Codebase Documentation`);
    lines.push('');
    lines.push(`> Generated on: ${new Date(doc.generatedAt).toLocaleString()}`);
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(doc.architecture.overview);
    lines.push('');
    lines.push('## Statistics');
    lines.push('');
    lines.push(`- **Total Files**: ${doc.totalFiles}`);
    lines.push(`- **Total Components**: ${doc.totalComponents}`);
    lines.push(`- **Languages**: ${doc.languages.join(', ')}`);
    lines.push(`- **Entry Points**: ${doc.entryPoints.length > 0 ? doc.entryPoints.map(e => path.basename(e)).join(', ') : 'None detected'}`);
    lines.push('');
    lines.push('## Architecture Layers');
    lines.push('');
    doc.architecture.layers.forEach(layer => {
      lines.push(`- ${layer}`);
    });
    lines.push('');
    lines.push('## Patterns Used');
    lines.push('');
    doc.architecture.patterns.forEach(pattern => {
      lines.push(`- ${pattern}`);
    });
    lines.push('');
    lines.push('## Components');
    lines.push('');
    lines.push('| Name | Type | File | Dependencies |');
    lines.push('|------|------|------|--------------|');
    doc.components.slice(0, 50).forEach(comp => {
      lines.push(`| ${comp.name} | ${comp.type} | ${comp.relativePath} | ${comp.dependencies.length} |`);
    });
    if (doc.components.length > 50) {
      lines.push(`| ... | ... | ... | ... |`);
      lines.push(`| *(${doc.components.length - 50} more components)* | | | |`);
    }

    return lines.join('\n');
  }

  /**
   * Generate markdown for individual component
   */
  private generateComponentMarkdown(comp: ComponentDoc): string {
    const lines: string[] = [];

    lines.push(`# ${comp.name}`);
    lines.push('');
    lines.push(`> ${comp.type} | ${comp.language}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(comp.summary);
    lines.push('');
    lines.push('## Technical Details');
    lines.push('');
    lines.push('```');
    lines.push(comp.technicalDetails);
    lines.push('```');
    lines.push('');

    if (comp.patterns.length > 0) {
      lines.push('## Patterns');
      lines.push('');
      comp.patterns.forEach(p => lines.push(`- ${p}`));
      lines.push('');
    }

    if (comp.dependencies.length > 0) {
      lines.push('## Dependencies');
      lines.push('');
      comp.dependencies.forEach(d => lines.push(`- ${d}`));
      lines.push('');
    }

    if (comp.dependents.length > 0) {
      lines.push('## Used By');
      lines.push('');
      comp.dependents.forEach(d => lines.push(`- ${d}`));
      lines.push('');
    }

    lines.push('## Source Code');
    lines.push('');
    lines.push('```' + comp.language);
    lines.push(comp.sourceCode);
    lines.push('```');

    return lines.join('\n');
  }

  /**
   * Generate chunks optimized for RAG indexing
   */
  generateRAGChunks(doc: CodebaseDocumentation): Array<{
    id: string;
    content: string;
    metadata: Record<string, any>;
  }> {
    const chunks: Array<{ id: string; content: string; metadata: Record<string, any> }> = [];

    // Add overview chunk
    chunks.push({
      id: 'overview',
      content: `Project: ${doc.projectName}\n\n${doc.architecture.overview}\n\nPatterns used: ${doc.architecture.patterns.join(', ')}`,
      metadata: {
        type: 'overview',
        project: doc.projectName,
        totalComponents: doc.totalComponents
      }
    });

    // Add component chunks
    doc.components.forEach(comp => {
      // Main component chunk
      chunks.push({
        id: comp.id,
        content: `Component: ${comp.name}\nType: ${comp.type}\nFile: ${comp.relativePath}\n\n${comp.summary}\n\n${comp.technicalDetails}`,
        metadata: {
          type: 'component',
          name: comp.name,
          componentType: comp.type,
          language: comp.language,
          filePath: comp.filePath,
          relativePath: comp.relativePath,
          dependencies: comp.dependencies,
          dependents: comp.dependents,
          patterns: comp.patterns
        }
      });

      // Source code chunk (for code search)
      if (comp.sourceCode && comp.sourceCode.length < 5000) {
        chunks.push({
          id: `${comp.id}-source`,
          content: `Source code for ${comp.name}:\n\n${comp.sourceCode}`,
          metadata: {
            type: 'source',
            name: comp.name,
            componentType: comp.type,
            filePath: comp.filePath
          }
        });
      }
    });

    return chunks;
  }

  /**
   * Get the docs folder path
   */
  getDocsFolder(): string {
    return this.docsFolder;
  }

  /**
   * Check if documentation already exists
   */
  docsExist(workspaceUri: vscode.Uri): boolean {
    const docsPath = path.join(workspaceUri.fsPath, 'Agentic_Plugin_Docs', 'codebase-documentation.json');
    return fs.existsSync(docsPath);
  }

  /**
   * Load existing documentation
   */
  loadExistingDocs(workspaceUri: vscode.Uri): CodebaseDocumentation | null {
    const docsPath = path.join(workspaceUri.fsPath, 'Agentic_Plugin_Docs', 'codebase-documentation.json');
    if (fs.existsSync(docsPath)) {
      try {
        const content = fs.readFileSync(docsPath, 'utf-8');
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
    return null;
  }
}
