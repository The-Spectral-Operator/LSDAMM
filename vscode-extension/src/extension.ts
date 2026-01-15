/**
 * LSDAMM VS Code Extension
 * Main extension entry point
 */

import * as vscode from 'vscode';
import { MeshService } from './services/mesh_service';
import { StatusBarManager } from './services/status_bar';
import { CommandHandler } from './commands/command_handler';
import { StatusTreeProvider } from './services/tree_providers';

let meshService: MeshService | null = null;
let statusBarManager: StatusBarManager | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('LSDAMM extension activating...');

  // Initialize mesh service
  meshService = new MeshService(context);
  
  // Initialize status bar
  statusBarManager = new StatusBarManager();
  
  // Initialize command handler
  const commandHandler = new CommandHandler(meshService, context.extensionUri);

  // Register tree data providers
  const statusTreeProvider = new StatusTreeProvider(meshService);
  vscode.window.registerTreeDataProvider('lsdamm.status', statusTreeProvider);

  // Register commands
  const commands = [
    vscode.commands.registerCommand('lsdamm.connect', () => commandHandler.connect()),
    vscode.commands.registerCommand('lsdamm.disconnect', () => commandHandler.disconnect()),
    vscode.commands.registerCommand('lsdamm.showPanel', () => commandHandler.showPanel()),
    vscode.commands.registerCommand('lsdamm.askAI', () => commandHandler.askAI()),
    vscode.commands.registerCommand('lsdamm.explainCode', () => commandHandler.explainCode()),
    vscode.commands.registerCommand('lsdamm.reviewCode', () => commandHandler.reviewCode()),
    vscode.commands.registerCommand('lsdamm.generateTests', () => commandHandler.generateTests()),
    // Extended features
    vscode.commands.registerCommand('lsdamm.extendedThinking', () => commandHandler.extendedThinking()),
    vscode.commands.registerCommand('lsdamm.analyzeImage', () => commandHandler.analyzeImage()),
    vscode.commands.registerCommand('lsdamm.textToSpeech', () => commandHandler.textToSpeech()),
    vscode.commands.registerCommand('lsdamm.uploadAttachment', () => commandHandler.uploadAttachment()),
    vscode.commands.registerCommand('lsdamm.showStatistics', () => commandHandler.showStatistics()),
    vscode.commands.registerCommand('lsdamm.showNodes', () => commandHandler.showNodes()),
  ];

  // Add all disposables to context
  context.subscriptions.push(...commands);
  context.subscriptions.push(statusBarManager);
  context.subscriptions.push(meshService);

  // Listen for mesh status changes
  meshService.onStatusChange((connected) => {
    statusBarManager?.setStatus(connected);
    statusTreeProvider.refresh();
  });

  // Auto-connect if configured
  const config = vscode.workspace.getConfiguration('lsdamm');
  if (config.get('autoConnect')) {
    const authToken = config.get<string>('authToken');
    const clientId = config.get<string>('clientId');
    
    if (authToken && clientId) {
      await meshService.connect();
    }
  }

  console.log('LSDAMM extension activated');
}

export function deactivate(): void {
  console.log('LSDAMM extension deactivating...');
  meshService?.disconnect();
}
