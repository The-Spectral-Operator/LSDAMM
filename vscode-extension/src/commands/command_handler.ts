/**
 * LSDAMM VS Code Extension - Command Handler
 * Handles all registered commands
 */

import * as vscode from 'vscode';
import { MeshService } from '../services/mesh_service';

export class CommandHandler {
  private meshService: MeshService;
  private outputChannel: vscode.OutputChannel;

  constructor(meshService: MeshService) {
    this.meshService = meshService;
    this.outputChannel = vscode.window.createOutputChannel('LSDAMM');
  }

  /**
   * Connect to mesh server
   */
  async connect(): Promise<void> {
    await this.meshService.connect();
  }

  /**
   * Disconnect from mesh server
   */
  disconnect(): void {
    this.meshService.disconnect();
    vscode.window.showInformationMessage('LSDAMM: Disconnected from mesh server');
  }

  /**
   * Show mesh panel
   */
  async showPanel(): Promise<void> {
    // TODO: Implement webview panel
    vscode.window.showInformationMessage('LSDAMM: Panel coming soon');
  }

  /**
   * Ask AI a question
   */
  async askAI(): Promise<void> {
    if (!this.meshService.isConnected()) {
      const action = await vscode.window.showErrorMessage(
        'LSDAMM: Not connected to mesh server',
        'Connect'
      );
      if (action === 'Connect') {
        await this.connect();
      }
      return;
    }

    const prompt = await vscode.window.showInputBox({
      prompt: 'Ask AI',
      placeHolder: 'Enter your question...',
    });

    if (!prompt) return;

    try {
      this.outputChannel.show();
      this.outputChannel.appendLine(`\n> ${prompt}\n`);
      
      const response = await this.meshService.sendToAI(prompt);
      this.outputChannel.appendLine(response);
    } catch (error) {
      vscode.window.showErrorMessage(`LSDAMM: ${(error as Error).message}`);
    }
  }

  /**
   * Explain selected code
   */
  async explainCode(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
      vscode.window.showWarningMessage('LSDAMM: No code selected');
      return;
    }

    if (!this.meshService.isConnected()) {
      await this.connect();
      if (!this.meshService.isConnected()) return;
    }

    try {
      const language = editor.document.languageId;
      
      this.outputChannel.show();
      this.outputChannel.appendLine(`\n> Explain this ${language} code:\n\`\`\`${language}\n${selectedText}\n\`\`\`\n`);
      
      const response = await this.meshService.sendToAI(
        `Explain this ${language} code:\n\n\`\`\`${language}\n${selectedText}\n\`\`\``,
        {
          systemPrompt: 'You are an expert programmer. Explain the given code clearly and concisely.',
        }
      );
      
      this.outputChannel.appendLine(response);
    } catch (error) {
      vscode.window.showErrorMessage(`LSDAMM: ${(error as Error).message}`);
    }
  }

  /**
   * Review selected code
   */
  async reviewCode(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
      vscode.window.showWarningMessage('LSDAMM: No code selected');
      return;
    }

    if (!this.meshService.isConnected()) {
      await this.connect();
      if (!this.meshService.isConnected()) return;
    }

    try {
      const language = editor.document.languageId;
      
      this.outputChannel.show();
      this.outputChannel.appendLine(`\n> Review this ${language} code:\n\`\`\`${language}\n${selectedText}\n\`\`\`\n`);
      
      const response = await this.meshService.sendToAI(
        `Review this ${language} code for bugs, security issues, and improvements:\n\n\`\`\`${language}\n${selectedText}\n\`\`\``,
        {
          systemPrompt: 'You are an expert code reviewer. Identify bugs, security issues, performance problems, and suggest improvements.',
        }
      );
      
      this.outputChannel.appendLine(response);
    } catch (error) {
      vscode.window.showErrorMessage(`LSDAMM: ${(error as Error).message}`);
    }
  }

  /**
   * Generate tests for selected code
   */
  async generateTests(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
      vscode.window.showWarningMessage('LSDAMM: No code selected');
      return;
    }

    if (!this.meshService.isConnected()) {
      await this.connect();
      if (!this.meshService.isConnected()) return;
    }

    try {
      const language = editor.document.languageId;
      
      this.outputChannel.show();
      this.outputChannel.appendLine(`\n> Generate tests for this ${language} code:\n\`\`\`${language}\n${selectedText}\n\`\`\`\n`);
      
      const response = await this.meshService.sendToAI(
        `Generate comprehensive unit tests for this ${language} code:\n\n\`\`\`${language}\n${selectedText}\n\`\`\``,
        {
          systemPrompt: 'You are an expert in writing unit tests. Generate comprehensive tests covering edge cases and common scenarios.',
        }
      );
      
      this.outputChannel.appendLine(response);
    } catch (error) {
      vscode.window.showErrorMessage(`LSDAMM: ${(error as Error).message}`);
    }
  }
}
