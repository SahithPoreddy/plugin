import * as vscode from 'vscode';
import { ClineContext, ClineResponse, CodeNode } from '../types/types';

/**
 * Adapter to integrate with Cline extension
 */
export class ClineAdapter {
  private clineExtension: vscode.Extension<any> | undefined;

  constructor() {
    this.clineExtension = vscode.extensions.getExtension('saoudrizwan.claude-dev');
  }

  isClineAvailable(): boolean {
    return this.clineExtension !== undefined && this.clineExtension.isActive;
  }

  async ensureClineActive(): Promise<boolean> {
    if (!this.clineExtension) {
      return false;
    }

    if (!this.clineExtension.isActive) {
      try {
        await this.clineExtension.activate();
        return true;
      } catch (error) {
        console.error('Failed to activate Cline:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Send code modification request to Cline
   */
  async sendModificationRequest(context: ClineContext): Promise<ClineResponse> {
    if (!await this.ensureClineActive()) {
      return {
        success: false,
        error: 'Cline extension is not available or could not be activated'
      };
    }

    try {
      // Build the context message for Cline
      const prompt = this.buildPrompt(context);

      // Send to Cline via command
      // This uses Cline's public API to start a task
      await vscode.commands.executeCommand('cline.plusButtonClicked');
      
      // Wait a bit for the UI to open
      await new Promise(resolve => setTimeout(resolve, 500));

      // Insert the prompt (this might need adjustment based on Cline's API)
      await vscode.commands.executeCommand('cline.sendMessage', prompt);

      return {
        success: true,
        explanation: 'Request sent to Cline. Please review and approve the changes in Cline panel.'
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to communicate with Cline: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Build a detailed prompt for Cline with full context
   */
  private buildPrompt(context: ClineContext): string {
    const sections = [];

    // Task description
    sections.push('# Code Modification Request');
    sections.push('');
    sections.push(`**User Request**: ${context.query}`);
    sections.push('');

    // File context
    sections.push('## File Context');
    sections.push(`- **File**: ${context.filePath}`);
    sections.push(`- **Lines**: ${context.startLine}-${context.endLine}`);
    sections.push(`- **Type**: ${context.nodeType}`);
    sections.push(`- **Name**: ${context.nodeName}`);
    sections.push('');

    // Current source code
    sections.push('## Current Implementation');
    sections.push('```');
    sections.push(context.sourceCode);
    sections.push('```');
    sections.push('');

    // Dependencies
    if (context.dependencies.length > 0) {
      sections.push('## Dependencies');
      sections.push('This code depends on:');
      context.dependencies.forEach(dep => {
        sections.push(`- ${dep}`);
      });
      sections.push('');
    }

    // Used by
    if (context.usedBy.length > 0) {
      sections.push('## Used By');
      sections.push('This code is used by:');
      context.usedBy.forEach(user => {
        sections.push(`- ${user}`);
      });
      sections.push('');
    }

    // Instructions
    sections.push('## Instructions');
    sections.push('Please modify the code according to the user request above.');
    sections.push('Ensure that:');
    sections.push('1. The changes address the user\'s request completely');
    sections.push('2. The code remains functional and maintains existing behavior unless explicitly changed');
    sections.push('3. Any dependencies are properly handled');
    sections.push('4. Code style and conventions are maintained');
    sections.push('5. Add appropriate comments if the changes are complex');

    return sections.join('\n');
  }

  /**
   * Alternative approach: Use Cline's API directly if available
   */
  async sendViaClineAPI(context: ClineContext): Promise<ClineResponse> {
    if (!this.clineExtension) {
      return { success: false, error: 'Cline extension not found' };
    }

    try {
      // Get Cline's exported API
      const clineAPI = this.clineExtension.exports;

      if (clineAPI && typeof clineAPI.createTask === 'function') {
        // Use Cline's programmatic API
        const result = await clineAPI.createTask({
          task: context.query,
          files: [context.filePath],
          context: this.buildPrompt(context)
        });

        return {
          success: true,
          explanation: 'Task created in Cline',
          modifiedCode: result?.modifiedCode
        };
      } else {
        // Fallback to command-based approach
        return this.sendModificationRequest(context);
      }

    } catch (error) {
      return {
        success: false,
        error: `Failed to use Cline API: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Open file in Cline's context
   */
  async openInCline(node: CodeNode): Promise<void> {
    // Open the file
    const document = await vscode.workspace.openTextDocument(node.filePath);
    await vscode.window.showTextDocument(document, {
      selection: new vscode.Range(
        new vscode.Position(node.startLine, 0),
        new vscode.Position(node.endLine, 0)
      )
    });

    // Optionally highlight the relevant code
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.revealRange(
        new vscode.Range(node.startLine, 0, node.endLine, 0),
        vscode.TextEditorRevealType.InCenter
      );
    }
  }
}
