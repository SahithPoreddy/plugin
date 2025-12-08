import * as vscode from 'vscode';
import { CodeGraph, CodeNode, CodeEdge, AnalysisResult, AnalysisError } from '../types/types';
import { JavaParser } from '../parsers/javaParser';
import { ReactParser } from '../parsers/reactParser';
import { GraphBuilder } from '../graph/graphBuilder';
import { EntryPointDetector } from './entryPointDetector';
import { ImportAnalyzer } from './importAnalyzer';
import * as path from 'path';

export class WorkspaceAnalyzer {
  private javaParser: JavaParser;
  private reactParser: ReactParser;
  private graphBuilder: GraphBuilder;
  private entryPointDetector: EntryPointDetector;
  private importAnalyzer: ImportAnalyzer;

  constructor() {
    this.javaParser = new JavaParser();
    this.reactParser = new ReactParser();
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

      console.log(`Found ${javaFiles.length} Java files and ${reactFiles.length} React files`);

      // Step 3: Build dependency map from imports
      const dependencyMap = new Map<string, string[]>();
      
      for (const file of [...javaFiles, ...reactFiles]) {
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
      }

      console.log(`Parsing ${filesToParse.size} files...`);

      // Step 5: Parse selected files
      for (const filePath of filesToParse) {
        const fileUri = vscode.Uri.file(filePath);
        const ext = path.extname(filePath);
        
        try {
          let result;
          if (ext === '.java') {
            result = await this.javaParser.parse(fileUri);
          } else if (['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
            result = await this.reactParser.parse(fileUri);
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

      // Step 6: Mark entry point nodes
      for (const ep of entryPoints) {
        const entryNode = allNodes.find(n => n.filePath === ep.filePath);
        if (entryNode) {
          entryNode.isEntryPoint = true;
        }
      }

      // Step 7: Build the graph with entry points as roots
      const graph = this.graphBuilder.buildFromEntryPoints(
        allNodes, 
        allEdges, 
        workspaceUri.fsPath,
        entryPoints.map(ep => ep.filePath)
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
        totalReactFiles: reactFiles.length
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
    }
    
    return [];
  }
}
