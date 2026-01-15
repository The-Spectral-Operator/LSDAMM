/**
 * LSDAMM VS Code Extension - Status Bar Manager
 */

import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'lsdamm.showPanel';
    this.setStatus(false);
    this.statusBarItem.show();
  }

  setStatus(connected: boolean): void {
    if (connected) {
      this.statusBarItem.text = '$(radio-tower) LSDAMM: Connected';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip = 'Connected to mesh server';
    } else {
      this.statusBarItem.text = '$(debug-disconnect) LSDAMM: Disconnected';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.statusBarItem.tooltip = 'Click to open LSDAMM panel';
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
