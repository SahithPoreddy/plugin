import * as vscode from 'vscode';
import { CodeGraph, CodeNode, CodeEdge, AnalysisResult, AnalysisError } from '../types/types';
import { JavaParser } from '../parsers/javaParser';
import { ReactParser } from '../parsers/reactParser';
import { PythonParser } from '../parsers/pythonParser';
import { GraphBuilder } from '../graph/graphBuilder';
import { EntryPointDetector } from './entryPointDetector';
import { ImportAnalyzer } from './importAnalyzer';
import * as path from 'path';

export class WorkspaceAnalyzer {
  private javaParser: JavaParser;
  private reactParser: ReactParser;
  private pythonParser: PythonParser;
  private graphBuilder: GraphBuilder;
  private entryPointDetector: EntryPointDetector;
  private importAnalyzer: ImportAnalyzer;

  constructor() {
    this.javaParser = new JavaParser();
    this.reactParser = new ReactParser();
    this.pythonParser = new PythonParser();
    this.graphBuilder = new GraphBuilder();
    this.entryPointDetector = new EntryPointDetector();
    this.importAnalyzer = new ImportAnalyzer();
  }

  async analyze(workspaceUri: vscode.Uri): Promise<AnalysisResult> {
    const errors: AnalysisError[] = [];
    const warnings: string[] = [];
    const allNodes: CodeNode[] = [];
    const allEdges: CodeEdge[] = [];

    try {
      // Step 1: Detect entry points
      console.log('Detecting entry points...');
      const entryPoints = await this.entryPointDetector.detectEntryPoints(workspaceUri);
      console.log(`Found ${entryPoints.length} entry points`);

      if (entryPoints.length === 0) {
        warnings.push('No entry points detected. Analyzing all files...');
      }

      // Step 2: Find all relevant files
      const javaFiles = await vscode.workspace.findFiles(
        '**/*.java',
        '**/node_modules/**'
      );
      
      const reactFiles = await vscode.workspace.findFiles(
        '**/*.{tsx,jsx,ts,js}',
        '**/node_modules/**'
      );

      const pythonFiles = await vscode.workspace.findFiles(
        '**/*.py',
        '{**/node_modules/**,**/__pycache__/**,**/venv/**,**/.venv/**,**/env/**}'
      );

      console.log(`Found ${javaFiles.length} Java files, ${reactFiles.length} React/JS files, and ${pythonFiles.length} Python files`);

      // Step 3: Build dependency map from imports
      const dependencyMap = new Map<string, string[]>();
      
      for (const file of [...javaFiles, ...reactFiles, ...pythonFiles]) {
        try {
          const deps = await this.importAnalyzer.buildDependencyMap(file, workspaceUri.fsPath);
          const targets = deps.map(d => d.targetFile);
          dependencyMap.set(file.fsPath, targets);
          
          // Create import edges
          for (const dep of deps) {
            allEdges.push({
              from: file.fsPath,
              to: dep.targetFile,
              type: 'imports',
              label: dep.importedItems.join(', ')
            });
          }
        } catch (error) {
          // Skip files with import errors
        }
      }

      // Step 4: Parse files starting from entry points
      const filesToParse = new Set<string>();
      
      if (entryPoints.length > 0) {
        // Start from entry points and follow dependencies
        for (const ep of entryPoints.slice(0, 3)) { // Top 3 entry points
          this.collectDependencyTree(ep.filePath, dependencyMap, filesToParse, 0, 5);
        }
      } else {
        // Parse all files if no entry points found
        javaFiles.forEach(f => filesToParse.add(f.fsPath));
        reactFiles.forEach(f => filesToParse.add(f.fsPath));
        pythonFiles.forEach(f => filesToParse.add(f.fsPath));
      }

      console.log(`Parsing ${filesToParse.size} files...`);

      // Create a set of entry point file paths for quick lookup
      const entryPointPaths = new Set(entryPoints.map(ep => ep.filePath));

      // Step 5: Parse selected files
      for (const filePath of filesToParse) {
        const fileUri = vscode.Uri.file(filePath);
        const ext = path.extname(filePath);
        const isEntryPointFile = entryPointPaths.has(filePath);
        
        try {
          let result;
          if (ext === '.java') {
            result = await this.javaParser.parse(fileUri, isEntryPointFile);
          } else if (['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
            // Pass isEntryPoint flag to create module node for files like main.tsx
            result = await this.reactParser.parse(fileUri, isEntryPointFile);
          } else if (ext === '.py') {
            result = await this.pythonParser.parse(fileUri, isEntryPointFile);
          } else {
            continue;
          }
          
          allNodes.push(...result.nodes);
          allEdges.push(...result.edges);
        } catch (error) {
          errors.push({
            file: filePath,
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'parse-error'
          });
        }
      }

      // Step 6: Mark entry point nodes and primary entry
      for (const ep of entryPoints) {
        const entryNode = allNodes.find(n => n.filePath === ep.filePath);
        if (entryNode) {
          entryNode.isEntryPoint = true;
          if (ep.isPrimaryEntry) {
            entryNode.isPrimaryEntry = true;
            console.log(`Marked node as PRIMARY entry: ${entryNode.label}`);
          }
        }
      }

      // Step 7: Build the graph with entry points as roots
      // Pass only the primary entry point as the main root
      const primaryEntry = entryPoints.find(ep => ep.isPrimaryEntry);
      const graph = this.graphBuilder.buildFromEntryPoints(
        allNodes, 
        allEdges, 
        workspaceUri.fsPath,
        primaryEntry ? [primaryEntry.filePath] : entryPoints.map(ep => ep.filePath)
      );

      const finalResult = {
        totalNodes: graph.nodes.length,
        totalEdges: graph.edges.length,
        entryPoints: entryPoints.length,
        entryPointFiles: entryPoints.map(ep => ep.filePath),
        errors: errors.length,
        warnings: warnings.length,
        filesToParse: filesToParse.size,
        totalJavaFiles: javaFiles.length,
        totalReactFiles: reactFiles.length,
        totalPythonFiles: pythonFiles.length
      };
      
      console.log('Final analysis result:', finalResult);

      return {
        graph,
        errors,
        warnings
      };

    } catch (error) {
      throw new Error(`Workspace analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private collectDependencyTree(
    filePath: string,
    dependencyMap: Map<string, string[]>,
    collected: Set<string>,
    depth: number,
    maxDepth: number
  ): void {
    if (depth >= maxDepth || collected.has(filePath)) {
      return;
    }

    collected.add(filePath);
    const dependencies = dependencyMap.get(filePath) || [];
    
    for (const dep of dependencies) {
      this.collectDependencyTree(dep, dependencyMap, collected, depth + 1, maxDepth);
    }
  }

  async analyzeFile(fileUri: vscode.Uri): Promise<CodeNode[]> {
    const ext = path.extname(fileUri.fsPath);
    
    if (ext === '.java') {
      const result = await this.javaParser.parse(fileUri);
      return result.nodes;
    } else if (['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
      const result = await this.reactParser.parse(fileUri);
      return result.nodes;
    } else if (ext === '.py') {
      const result = await this.pythonParser.parse(fileUri);
      return result.nodes;
    }
    
    return [];
  }
}
