/**
 * extension.ts
 * 
 * Main entry point for the AI Assistant extension.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { AIPanel } from './panels/AIPanel';

export function activate(context: vscode.ExtensionContext) {
	console.log('AI Assistant extension is now active');
	console.log('Registering command: agent-workshop.openAIPanel');

	// Register webview provider
	const provider = vscode.window.registerWebviewViewProvider('agent-workshop-view', {
		resolveWebviewView(webviewView: vscode.WebviewView) {
			webviewView.webview.options = {
				enableScripts: true
			};
			
			const htmlPath = path.join(context.extensionPath, 'out', 'webview', 'statusView.html');
			webviewView.webview.html = getWebviewContent(webviewView.webview, context.extensionUri, htmlPath);
			
			// Listen for messages from the webview
			webviewView.webview.onDidReceiveMessage(
				message => {
					switch (message.command) {
						case 'openAIPanel':
							AIPanel.createOrShow(context.extensionUri);
							break;
					}
				},
				undefined,
				context.subscriptions
			);
		}
	});
	
	// Register open AI Panel command
	const openAIPanelCommand = vscode.commands.registerCommand('agent-workshop.openAIPanel', () => {
		console.log('Executing command: agent-workshop.openAIPanel');
		AIPanel.createOrShow(context.extensionUri);
	});
	
	// Register status bar item
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "$(sparkle) AI";
	statusBarItem.tooltip = "Open AI Assistant";
	statusBarItem.command = 'agent-workshop.openAIPanel';
	statusBarItem.show();
	
	// Register all subscriptions
	context.subscriptions.push(
		provider, 
		openAIPanelCommand,
		statusBarItem
	);

	console.log('AI Assistant extension fully activated with command agent-workshop.openAIPanel registered');
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, htmlPath: string): string {
	try {
		const fs = require('fs');
		let html = fs.readFileSync(htmlPath, 'utf8');
		
		return html;
	} catch (error) {
		console.error('Error loading webview content:', error);
		return `<html><body><h1>Error loading content</h1><p>${error}</p></body></html>`;
	}
}

export function deactivate() {
	if (AIPanel.currentPanel) {
		AIPanel.currentPanel.dispose();
	}
	console.log('AI Assistant extension has been deactivated');
}
