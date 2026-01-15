/**
 * LSDAMM VS Code Extension - Tree Data Providers
 */

import * as vscode from 'vscode';
import { MeshService } from './mesh_service';

export class StatusTreeProvider implements vscode.TreeDataProvider<StatusItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatusItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private meshService: MeshService;

  constructor(meshService: MeshService) {
    this.meshService = meshService;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: StatusItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: StatusItem): Thenable<StatusItem[]> {
    const items: StatusItem[] = [];

    // Connection status
    const connected = this.meshService.isConnected();
    items.push(new StatusItem(
      'Connection',
      connected ? 'Connected' : 'Disconnected',
      vscode.TreeItemCollapsibleState.None,
      connected ? 'check' : 'x'
    ));

    // Server URL
    const config = vscode.workspace.getConfiguration('lsdamm');
    items.push(new StatusItem(
      'Server',
      config.get<string>('serverUrl') || 'Not configured',
      vscode.TreeItemCollapsibleState.None,
      'server'
    ));

    // Default provider
    items.push(new StatusItem(
      'Default Provider',
      config.get<string>('defaultProvider') || 'anthropic',
      vscode.TreeItemCollapsibleState.None,
      'robot'
    ));

    return Promise.resolve(items);
  }
}

class StatusItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    private readonly value: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    icon?: string
  ) {
    super(label, collapsibleState);
    this.description = value;
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }
  }
}
