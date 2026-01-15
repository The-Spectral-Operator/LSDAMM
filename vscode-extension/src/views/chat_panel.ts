/**
 * LSDAMM VS Code Extension - Chat Panel Webview
 * Interactive chat interface in VS Code
 */

import * as vscode from 'vscode';
import { MeshService } from '../services/mesh_service';

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly meshService: MeshService;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, meshService: MeshService) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.meshService = meshService;

    // Set the webview's initial html content
    this.update();

    // Listen for when the panel is disposed
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      message => {
        switch (message.type) {
          case 'sendMessage':
            this.handleSendMessage(message.content, message.options);
            return;
          case 'connect':
            this.meshService.connect();
            return;
          case 'disconnect':
            this.meshService.disconnect();
            return;
          case 'getStatus':
            this.sendStatus();
            return;
        }
      },
      null,
      this.disposables
    );

    // Listen for mesh status changes
    this.meshService.onStatusChange((connected) => {
      this.panel.webview.postMessage({ type: 'statusUpdate', connected });
    });
  }

  public static createOrShow(extensionUri: vscode.Uri, meshService: MeshService): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'lsdammChat',
      'LSDAMM Chat',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'out')
        ],
        retainContextWhenHidden: true
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, meshService);
  }

  private async handleSendMessage(content: string, options?: {
    systemPrompt?: string;
    extendedThinking?: boolean;
    maxTokens?: number;
  }): Promise<void> {
    if (!this.meshService.isConnected()) {
      this.panel.webview.postMessage({
        type: 'error',
        content: 'Not connected to mesh server'
      });
      return;
    }

    try {
      // Send thinking message
      this.panel.webview.postMessage({
        type: 'thinking',
        messageId: Date.now().toString()
      });

      const response = await this.meshService.sendToAI(content, options);

      // Send response
      this.panel.webview.postMessage({
        type: 'response',
        content: response,
        messageId: Date.now().toString()
      });
    } catch (error) {
      this.panel.webview.postMessage({
        type: 'error',
        content: (error as Error).message
      });
    }
  }

  private sendStatus(): void {
    this.panel.webview.postMessage({
      type: 'statusUpdate',
      connected: this.meshService.isConnected()
    });
  }

  public dispose(): void {
    ChatPanel.currentPanel = undefined;

    // Clean up our resources
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private update(): void {
    const webview = this.panel.webview;
    this.panel.webview.html = this.getHtmlForWebview(webview);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    // Get the local path to main script
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.js')
    );

    // Get the local path to css
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css')
    );

    // Use a nonce to whitelist which scripts can be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>LSDAMM Chat</title>
</head>
<body>
  <div class="chat-container">
    <div class="chat-header">
      <h2>LSDAMM AI Chat</h2>
      <div class="status-indicator">
        <span class="status-dot" id="statusDot"></span>
        <span id="statusText">Disconnected</span>
      </div>
    </div>
    
    <div class="messages-container" id="messagesContainer">
      <div class="welcome-message">
        <h3>🌌 Welcome to LSDAMM Chat</h3>
        <p>Ask questions, explain code, generate tests, and more.</p>
        <p class="hint">Type your message below or use the command palette for specific actions.</p>
      </div>
    </div>

    <div class="input-container">
      <div class="options-bar">
        <label>
          <input type="checkbox" id="extendedThinking"> Extended Thinking
        </label>
        <label>
          Model:
          <select id="modelSelect">
            <option value="">Auto</option>
            <option value="anthropic">Claude</option>
            <option value="openai">GPT-4</option>
            <option value="google">Gemini</option>
            <option value="ollama_local">Ollama (Local)</option>
          </select>
        </label>
      </div>
      <div class="input-wrapper">
        <textarea 
          id="messageInput" 
          placeholder="Type your message... (Shift+Enter for new line, Enter to send)"
          rows="3"
        ></textarea>
        <button id="sendButton" title="Send (Enter)">
          <span>➤</span>
        </button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
