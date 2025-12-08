import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface EntryPoint {
  filePath: string;
  type: 'main' | 'index' | 'app' | 'config';
  score: number;
}

export class EntryPointDetector {
  /**
   * Detect entry points in the workspace
   * Entry points are files like:
   * - main.java, Main.java, Application.java (Java)
   * - index.tsx, index.ts, App.tsx, main.tsx (React/TS)
   * - Files with main() method or exported entry functions
   */
  async detectEntryPoints(workspaceUri: vscode.Uri): Promise<EntryPoint[]> {
    const entryPoints: EntryPoint[] = [];

    // Find potential entry files by name
    const commonEntryNames = [
      '**/*[Mm]ain.{java,ts,tsx,js,jsx}',
      '**/*[Aa]pp.{tsx,ts,jsx,js}',
      '**/*[Ii]ndex.{tsx,ts,jsx,js}',
      '**/*[Aa]pplication.java',
      '**/src/index.{tsx,ts,jsx,js}',
      '**/src/App.{tsx,ts,jsx,js}',
      '**/src/main/java/**/*Application.java'
    ];

    for (const pattern of commonEntryNames) {
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
      
      for (const file of files) {
        const score = this.calculateEntryPointScore(file);
        if (score > 0) {
          entryPoints.push({
            filePath: file.fsPath,
            type: this.detectEntryPointType(file),
            score
          });
        }
      }
    }

    // Sort by score (highest first)
    entryPoints.sort((a, b) => b.score - a.score);

    // Also scan files with main() methods
    const filesWithMain = await this.findFilesWithMainMethod(workspaceUri);
    entryPoints.push(...filesWithMain);

    // Deduplicate
    const uniqueEntryPoints = this.deduplicateEntryPoints(entryPoints);
    
    return uniqueEntryPoints.slice(0, 10); // Return top 10 entry points
  }

  private calculateEntryPointScore(fileUri: vscode.Uri): number {
    const fileName = path.basename(fileUri.fsPath).toLowerCase();
    const filePath = fileUri.fsPath.toLowerCase();
    
    let score = 0;

    // Name-based scoring
    if (fileName === 'index.tsx' || fileName === 'index.ts') score += 10;
    if (fileName === 'app.tsx' || fileName === 'app.ts') score += 9;
    if (fileName === 'main.tsx' || fileName === 'main.ts') score += 8;
    if (fileName.includes('main.java')) score += 10;
    if (fileName.includes('application.java')) score += 9;
    
    // Path-based scoring
    if (filePath.includes('src/index')) score += 5;
    if (filePath.includes('src/app')) score += 4;
    if (filePath.includes('src/main')) score += 4;
    if (filePath.includes('public/')) score += 3;
    if (filePath.includes('/pages/')) score += 2;

    // Root level files get bonus
    const depth = fileUri.fsPath.split(path.sep).length;
    if (depth <= 5) score += 2;

    return score;
  }

  private detectEntryPointType(fileUri: vscode.Uri): 'main' | 'index' | 'app' | 'config' {
    const fileName = path.basename(fileUri.fsPath).toLowerCase();
    
    if (fileName.includes('main')) return 'main';
    if (fileName.includes('index')) return 'index';
    if (fileName.includes('app')) return 'app';
    return 'config';
  }

  private async findFilesWithMainMethod(workspaceUri: vscode.Uri): Promise<EntryPoint[]> {
    const entryPoints: EntryPoint[] = [];
    
    // Find Java files
    const javaFiles = await vscode.workspace.findFiles(
      '**/*.java',
      '**/node_modules/**',
      100
    );

    for (const file of javaFiles) {
      const hasMain = await this.hasMainMethod(file);
      if (hasMain) {
        entryPoints.push({
          filePath: file.fsPath,
          type: 'main',
          score: 10
        });
      }
    }

    return entryPoints;
  }

  private async hasMainMethod(fileUri: vscode.Uri): Promise<boolean> {
    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      const content = document.getText();
      
      // Check for main method signature
      const mainMethodPattern = /public\s+static\s+void\s+main\s*\(\s*String\s*\[\s*\]\s+\w+\s*\)/;
      return mainMethodPattern.test(content);
    } catch (error) {
      return false;
    }
  }

  private deduplicateEntryPoints(entryPoints: EntryPoint[]): EntryPoint[] {
    const seen = new Set<string>();
    const unique: EntryPoint[] = [];

    for (const ep of entryPoints) {
      if (!seen.has(ep.filePath)) {
        seen.add(ep.filePath);
        unique.push(ep);
      }
    }

    return unique;
  }
}
