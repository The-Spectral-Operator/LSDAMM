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

  /**
   * Extended thinking analysis for complex problems
   */
  async extendedThinking(): Promise<void> {
    const config = vscode.workspace.getConfiguration('lsdamm');
    if (!config.get('enableExtendedThinking')) {
      vscode.window.showWarningMessage('LSDAMM: Extended thinking is disabled in settings');
      return;
    }

    const editor = vscode.window.activeTextEditor;
    const selectedText = editor ? editor.document.getText(editor.selection) : '';

    const prompt = await vscode.window.showInputBox({
      prompt: 'Extended Thinking Analysis',
      placeHolder: 'Describe the complex problem to analyze...',
      value: selectedText ? `Analyze this code:\n${selectedText}` : '',
    });

    if (!prompt) return;

    if (!this.meshService.isConnected()) {
      await this.connect();
      if (!this.meshService.isConnected()) return;
    }

    try {
      this.outputChannel.show();
      this.outputChannel.appendLine('\n> [Extended Thinking Mode]\n');
      this.outputChannel.appendLine(`Query: ${prompt}\n`);
      this.outputChannel.appendLine('--- Thinking Process ---');
      
      // Use configurable maxTokens with a reasonable default for extended thinking
      const config = vscode.workspace.getConfiguration('lsdamm');
      const maxTokens = Math.min(config.get<number>('maxTokens') ?? 4096, 8192);
      
      const response = await this.meshService.sendToAI(prompt, {
        systemPrompt: 'You are an expert analyst. Think step by step, show your reasoning process, consider multiple perspectives, and provide a thorough analysis.',
        extendedThinking: true,
        maxTokens,
      });
      
      this.outputChannel.appendLine('\n--- Analysis Complete ---\n');
      this.outputChannel.appendLine(response);
    } catch (error) {
      vscode.window.showErrorMessage(`LSDAMM: ${(error as Error).message}`);
    }
  }

  /**
   * Analyze an image using vision capabilities
   */
  async analyzeImage(): Promise<void> {
    const config = vscode.workspace.getConfiguration('lsdamm');
    if (!config.get('enableVision')) {
      vscode.window.showWarningMessage('LSDAMM: Vision capabilities are disabled in settings');
      return;
    }

    const fileUri = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Select Image',
      filters: {
        'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp'],
      },
    });

    if (!fileUri || fileUri.length === 0) return;

    const prompt = await vscode.window.showInputBox({
      prompt: 'What would you like to know about this image?',
      placeHolder: 'Describe, analyze, or ask a question about the image...',
      value: 'Describe and analyze this image in detail.',
    });

    if (!prompt) return;

    if (!this.meshService.isConnected()) {
      await this.connect();
      if (!this.meshService.isConnected()) return;
    }

    try {
      this.outputChannel.show();
      this.outputChannel.appendLine(`\n> [Vision Analysis]\nImage: ${fileUri[0].fsPath}\nQuery: ${prompt}\n`);
      
      const response = await this.meshService.sendToAI(prompt, {
        systemPrompt: 'You are an expert at analyzing images. Provide detailed, accurate descriptions and insights.',
        imageUri: fileUri[0].fsPath,
        vision: true,
      });
      
      this.outputChannel.appendLine(response);
    } catch (error) {
      vscode.window.showErrorMessage(`LSDAMM: ${(error as Error).message}`);
    }
  }

  /**
   * Text-to-speech for reading responses
   */
  async textToSpeech(): Promise<void> {
    const config = vscode.workspace.getConfiguration('lsdamm');
    if (!config.get('enableTTS')) {
      vscode.window.showWarningMessage('LSDAMM: Text-to-speech is disabled in settings');
      return;
    }

    const editor = vscode.window.activeTextEditor;
    const selectedText = editor ? editor.document.getText(editor.selection) : '';

    if (!selectedText) {
      vscode.window.showWarningMessage('LSDAMM: No text selected to read');
      return;
    }

    if (!this.meshService.isConnected()) {
      await this.connect();
      if (!this.meshService.isConnected()) return;
    }

    try {
      const voice = config.get<string>('ttsVoice') || 'alloy';
      
      vscode.window.showInformationMessage(`LSDAMM: Generating speech with voice "${voice}"...`);
      
      await this.meshService.textToSpeech(selectedText, {
        voice,
      });
      
      vscode.window.showInformationMessage('LSDAMM: Audio playback started');
    } catch (error) {
      vscode.window.showErrorMessage(`LSDAMM: ${(error as Error).message}`);
    }
  }

  /**
   * Upload an attachment to the context
   */
  async uploadAttachment(): Promise<void> {
    const config = vscode.workspace.getConfiguration('lsdamm');
    if (!config.get('enableAttachments')) {
      vscode.window.showWarningMessage('LSDAMM: Attachments are disabled in settings');
      return;
    }

    const maxSize = config.get<number>('maxAttachmentSize') || 10485760;

    const fileUri = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Select File(s) to Upload',
      filters: {
        'All Files': ['*'],
        'Documents': ['pdf', 'doc', 'docx', 'txt', 'md'],
        'Code': ['ts', 'js', 'py', 'c', 'cpp', 'h', 'java', 'go', 'rs'],
        'Data': ['json', 'xml', 'yaml', 'csv'],
        'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp'],
      },
    });

    if (!fileUri || fileUri.length === 0) return;

    if (!this.meshService.isConnected()) {
      await this.connect();
      if (!this.meshService.isConnected()) return;
    }

    try {
      for (const uri of fileUri) {
        const stat = await vscode.workspace.fs.stat(uri);
        
        if (stat.size > maxSize) {
          vscode.window.showWarningMessage(
            `LSDAMM: File "${uri.fsPath}" exceeds maximum size limit (${(maxSize / 1048576).toFixed(1)}MB)`
          );
          continue;
        }

        await this.meshService.uploadAttachment(uri.fsPath);
        vscode.window.showInformationMessage(`LSDAMM: Uploaded ${uri.fsPath}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`LSDAMM: ${(error as Error).message}`);
    }
  }

  /**
   * Show real-time statistics
   */
  async showStatistics(): Promise<void> {
    if (!this.meshService.isConnected()) {
      vscode.window.showWarningMessage('LSDAMM: Not connected to mesh');
      return;
    }

    const stats = await this.meshService.getStatistics();

    this.outputChannel.show();
    this.outputChannel.appendLine('\n========== LSDAMM Statistics ==========');
    this.outputChannel.appendLine(`Connected: ${stats.connected}`);
    this.outputChannel.appendLine(`Active Nodes: ${stats.activeNodes}`);
    this.outputChannel.appendLine(`Messages Sent: ${stats.messagesSent}`);
    this.outputChannel.appendLine(`Messages Received: ${stats.messagesReceived}`);
    this.outputChannel.appendLine(`Average Latency: ${stats.avgLatencyMs.toFixed(2)}ms`);
    this.outputChannel.appendLine(`Tokens Used: ${stats.tokensUsed}`);
    this.outputChannel.appendLine(`Cost: $${stats.costUsd.toFixed(4)}`);
    this.outputChannel.appendLine(`Uptime: ${stats.uptimeSeconds}s`);
    this.outputChannel.appendLine('========================================\n');
  }

  /**
   * Show mesh nodes
   */
  async showNodes(): Promise<void> {
    if (!this.meshService.isConnected()) {
      vscode.window.showWarningMessage('LSDAMM: Not connected to mesh');
      return;
    }

    const nodes = await this.meshService.getNodes();

    this.outputChannel.show();
    this.outputChannel.appendLine('\n========== Mesh Nodes ==========');
    
    for (const node of nodes) {
      const status = node.state === 'alive' ? '🟢' : 
                     node.state === 'suspect' ? '🟡' : '🔴';
      const role = node.isMainNode ? ' [MAIN]' : '';
      this.outputChannel.appendLine(`${status} ${node.id}${role}`);
      this.outputChannel.appendLine(`   Address: ${node.address}:${node.port}`);
      this.outputChannel.appendLine(`   Last Seen: ${new Date(node.lastSeen * 1000).toISOString()}`);
    }
    
    this.outputChannel.appendLine('================================\n');
  }
}
