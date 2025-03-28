/**
 * AIPanel.ts
 * 
 * This file defines the main panel for the AI Assistant extension.
 * It manages:
 * - Creating and displaying the main assistant webview panel
 * - Handling communication between the VS Code extension and webview
 * - Processing API requests to OpenAI
 * - Managing file attachments as context for AI queries
 * - Error handling and user feedback
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as config from '../config';

// Types
interface OpenAIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface OpenAIRequest {
    model: string;
    messages: OpenAIMessage[];
    max_tokens: number;
}

interface OpenAIResponse {
    choices: Array<{message: {content: string}}>;
    error?: {
        message: string;
        type: string;
        code?: string;
    };
}

export class AIPanel {
    public static currentPanel: AIPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private static readonly _outputChannel = vscode.window.createOutputChannel('AI Assistant');
    private attachedFiles: Map<string, string> = new Map();
    private readonly _extensionPath: string;
    
    private get _apiKey(): string {
        return config.getApiKey();
    }
    
    private get _model(): string {
        return config.getModel();
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionPath = extensionUri.fsPath;
        AIPanel._outputChannel.appendLine('Initializing AI Assistant panel...');
        
        this._setupWebview(extensionUri);
        
        this._setupMessageHandlers();
    }
    
    private _setupWebview(extensionUri: vscode.Uri): void {
        if (!this._panel.webview) {
            throw new Error('Webview is not available');
        }
        
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [extensionUri]
        };
        
        this._panel.webview.html = this._getWebviewContent();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    
    private _setupMessageHandlers(): void {
        this._panel.webview.onDidReceiveMessage(
            async (message: {command: string; text?: string; fileName?: string}) => {
                try {
                    switch (message.command) {
                        case 'askQuestion':
                            if (message.text) {
                                AIPanel._outputChannel.appendLine(`Processing question: ${message.text}`);
                                await this._handleQuestion(message.text);
                            }
                            break;
                        case 'pickFiles':
                            await this._pickFiles();
                            break;
                        case 'removeFile':
                            if (message.fileName) {
                                AIPanel._outputChannel.appendLine(`Removing file: ${message.fileName}`);
                                this.attachedFiles.delete(message.fileName);
                            }
                            break;
                        case 'clearFiles':
                            AIPanel._outputChannel.appendLine('Clearing all attached files');
                            this.attachedFiles.clear();
                            break;
                        default:
                            AIPanel._outputChannel.appendLine(`Unknown command: ${message.command}`);
                    }
                } catch (error) {
                    this._handleError(`Error processing message: ${error}`);
                }
            },
            null,
            this._disposables
        );
    }

    public static async createOrShow(extensionUri: vscode.Uri): Promise<AIPanel> {
        AIPanel._outputChannel.appendLine('Creating or showing AI panel...');

        const panel = vscode.window.createWebviewPanel(
            'aiAssistantPanel',
            'AI Assistant',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
            }
        );

        AIPanel.currentPanel = new AIPanel(panel, extensionUri);
        AIPanel._outputChannel.appendLine('AI panel created and initialized');
        return AIPanel.currentPanel;
    }

    public attachFile(fileName: string, content: string): void {
        this.attachedFiles.set(fileName, content);
        this._sendMessage({ 
            type: 'fileAttached', 
            fileName: fileName 
        });
        AIPanel._outputChannel.appendLine(`Attached file: ${fileName}`);
    }

    private async _handleQuestion(question: string): Promise<void> {
        try {
            AIPanel._outputChannel.appendLine('Sending request to OpenAI API...');
            const startTime = Date.now();
            
            const prompt = this._buildPrompt(question);
            const response = await this._callOpenAI(prompt);
            
            const duration = Date.now() - startTime;
            AIPanel._outputChannel.appendLine(`Request completed in ${duration}ms`);
            
            this._sendMessage({ 
                type: 'response', 
                content: response 
            });
        } catch (error) {
            AIPanel._outputChannel.appendLine(`Failed to connect to OpenAI API: ${error}`);
            this._sendMessage({
                type: 'error',
                content: error instanceof Error ? error.message : String(error)
            });
        }
    }
    
    private _buildPrompt(question: string): string {
        if (this.attachedFiles.size === 0) {
            return question;
        }
        
        let context = '';
        this.attachedFiles.forEach((content, fileName) => {
            context += `File: ${fileName}\n\`\`\`\n${content}\n\`\`\`\n\n`;
        });
        
        return `Context:\n${context}\nQuestion: ${question}`;
    }
    
    private async _callOpenAI(prompt: string): Promise<string> {
        const apiKey = this._apiKey;
        
        if (!apiKey) {
            this._showApiKeyMissingHelp();
            throw new Error('No API key found for OpenAI. Please set it in settings or environment variables.');
        }
        
        const requestBody: OpenAIRequest = {
            model: this._model,
            messages: [
                { role: 'user', content: prompt }
            ],
            max_tokens: config.MAX_TOKENS
        };
        
        let response;
        try {
            AIPanel._outputChannel.appendLine(`Making request to ${config.OPENAI_API_ENDPOINT} with model ${this._model}`);
            response = await fetch(config.OPENAI_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json() as OpenAIResponse;
            
            if (!response.ok) {
                const errorMsg = data.error?.message || JSON.stringify(data);
                AIPanel._outputChannel.appendLine(`API returned error: ${errorMsg}`);
                throw new Error(`API error: ${errorMsg}`);
            }
            
            if (!data.choices || !data.choices[0]?.message?.content) {
                throw new Error('Invalid response format from OpenAI API');
            }
            
            return data.choices[0].message.content;
        } catch (error) {
            // If this is a network error, provide a more user-friendly message
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new Error('Network error: Could not connect to OpenAI API. Please check your internet connection.');
            }
            
            AIPanel._outputChannel.appendLine(`API call error: ${error}`);
            throw error;
        }
    }

    private _showApiKeyMissingHelp(): void {
        const message = 'OpenAI API key not found. Set it in settings or .env file.';
        const setKey = 'Set in Settings';
        const envHelp = 'Show .env Help';
        
        vscode.window.showErrorMessage(message, setKey, envHelp).then(selection => {
            if (selection === setKey) {
                vscode.commands.executeCommand('workbench.action.openSettings', `${config.SECTION}.${config.API_KEY}`);
            } else if (selection === envHelp) {
                vscode.window.showInformationMessage(
                    'You can also set your API key in a .env file at the root of the project:\n\n' +
                    'OPENAI_API_KEY=your_api_key_here\n\n' +
                    'Make sure .env is in your .gitignore to avoid exposing your key.'
                );
            }
        });
    }

    private async _pickFiles(): Promise<void> {
        try {
            const files = await vscode.window.showOpenDialog({
                canSelectMany: true,
                openLabel: 'Add to Context',
                filters: {
                    'All Files': ['*']
                }
            });
    
            if (!files || files.length === 0) {
                return;
            }
            
            for (const file of files) {
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const decoder = new TextDecoder();
                    this.attachFile(file.fsPath, decoder.decode(content));
                } catch (error) {
                    AIPanel._outputChannel.appendLine(`Error reading file ${file.fsPath}: ${error}`);
                }
            }
        } catch (error) {
            this._handleError(`Error picking files: ${error}`);
        }
    }

    private _getWebviewContent(): string {
        try {
            const htmlPath = path.join(this._extensionPath, 'out', 'webview', 'webview.html');
            
            if (!fs.existsSync(htmlPath)) {
                throw new Error(`HTML file not found at: ${htmlPath}`);
            }
            
            let html = fs.readFileSync(htmlPath, 'utf8');

            // Replace script reference with webview URI
            const jsPath = vscode.Uri.file(
                path.join(this._extensionPath, 'out', 'webview', 'webview.js')
            );
            const jsUri = this._panel.webview.asWebviewUri(jsPath);
            const scriptSrc = `<script src="${jsUri}"></script>`;
            
            return html.replace('<script src="webview.js"></script>', scriptSrc);
        } catch (error) {
            this._handleError(`Error loading webview content: ${error}`);
            return `<html><body><h1>Error loading content</h1><p>${error}</p></body></html>`;
        }
    }
    
    private _sendMessage(message: any): void {
        if (this._panel.webview) {
            this._panel.webview.postMessage(message);
        }
    }
    
    private _handleError(message: string): void {
        AIPanel._outputChannel.appendLine(`Error: ${message}`);
        vscode.window.showErrorMessage(message);
    }

    public dispose(): void {
        AIPanel._outputChannel.appendLine('Disposing AI panel...');
        AIPanel.currentPanel = undefined;
        this._panel.dispose();
        
        for (const disposable of this._disposables) {
            disposable.dispose();
        }
        this._disposables = [];
        
        AIPanel._outputChannel.appendLine('AI panel disposed');
    }

    public isVisible(): boolean {
        return this._panel.visible;
    }
    
    public sendMessage(message: any): void {
        this._sendMessage(message);
    }
} 