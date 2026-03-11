import * as vscode from 'vscode';
import { CsvTableEditorProvider } from './csvTableEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(CsvTableEditorProvider.register(context));
}

export function deactivate() { }
