import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Updated interface to handle multiple AI providers
interface AIResponse {
    content: string;
}

// Add provider-specific interfaces
interface AnthropicResponse {
    content: Array<{type: string, text: string}>;
}

interface OpenAIResponse {
    choices: Array<{message: {content: string}}>;
}

interface DeepseekResponse {
    outputs: Array<{text: string}>;
}

// Enum for supported providers
enum AIProvider {
    Anthropic = 'anthropic',
    OpenAI = 'openai',
    Deepseek = 'deepseek'
}

export class AIPanel {
    public static currentPanel: AIPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private static readonly _outputChannel = vscode.window.createOutputChannel('AI Assistant');
    private attachedFiles: Map<string, string> = new Map();
    private _extensionPath: string;
    
    // Get provider from settings with anthropic as default
    private _getProvider(): AIProvider {
        const config = vscode.workspace.getConfiguration('soft-assist');
        const provider = config.get<string>('provider', 'anthropic');
        return provider as AIProvider;
    }
    
    // Get API key from settings or env
    private _getApiKey(): string {
        const provider = this._getProvider();
        const config = vscode.workspace.getConfiguration('soft-assist');
        
        switch(provider) {
            case AIProvider.Anthropic:
                return config.get<string>('anthropicApiKey', process.env.ANTHROPIC_API_KEY || '');
            case AIProvider.OpenAI:
                return config.get<string>('openaiApiKey', process.env.OPENAI_API_KEY || '');
            case AIProvider.Deepseek:
                return config.get<string>('deepseekApiKey', process.env.DEEPSEEK_API_KEY || '');
            default:
                return '';
        }
    }
    
    // Get model from settings based on provider
    private _getModel(): string {
        const provider = this._getProvider();
        const config = vscode.workspace.getConfiguration('soft-assist');
        
        switch(provider) {
            case AIProvider.Anthropic:
                return config.get<string>('anthropicModel', 'claude-3-haiku-20240307');
            case AIProvider.OpenAI:
                return config.get<string>('openaiModel', 'gpt-3.5-turbo');
            case AIProvider.Deepseek:
                return config.get<string>('deepseekModel', 'deepseek-coder');
            default:
                return '';
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionPath = extensionUri.fsPath;
        AIPanel._outputChannel.appendLine('Initializing AI Assistant panel...');
        
        if (!this._panel.webview) {
            throw new Error('Webview is not available');
        }
        
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [extensionUri]
        };
        
        this._panel.webview.html = this._getWebviewContent();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'askQuestion':
                        AIPanel._outputChannel.appendLine(`Processing question: ${message.text}`);
                        await this._handleQuestion(message.text);
                        break;
                    case 'pickFiles':
                        await this._pickFiles();
                        break;
                    case 'removeFile':
                        AIPanel._outputChannel.appendLine(`Processing removeFile: ${message.fileName}`);
                        this.attachedFiles.delete(message.fileName);
                        break;
                    case 'clearFiles':
                        AIPanel._outputChannel.appendLine('Clearing all attached files');
                        this.attachedFiles.clear();
                        break;
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

        AIPanel._outputChannel.appendLine('Initializing new AIPanel instance...');
        AIPanel.currentPanel = new AIPanel(panel, extensionUri);
        
        AIPanel._outputChannel.appendLine('New AI panel created and initialized');
        return AIPanel.currentPanel;
    }

    public attachFile(fileName: string, content: string) {
        this.attachedFiles.set(fileName, content);
        this._panel.webview.postMessage({ 
            type: 'fileAttached', 
            fileName: fileName 
        });
        AIPanel._outputChannel.appendLine(`Attached file: ${fileName}`);
    }

    private async _handleQuestion(question: string) {
        try {
            AIPanel._outputChannel.appendLine(`Sending request to ${this._getProvider()} API...`);
            const startTime = Date.now();
            
            let context = '';
            this.attachedFiles.forEach((content, fileName) => {
                context += `File: ${fileName}\n\`\`\`\n${content}\n\`\`\`\n\n`;
            });

            const fullPrompt = this.attachedFiles.size > 0 
                ? `Context:\n${context}\nQuestion: ${question}`
                : question;
                
            // Call appropriate API based on provider
            const response = await this._callAIProvider(fullPrompt);
            
            const duration = Date.now() - startTime;
            AIPanel._outputChannel.appendLine(`Request completed in ${duration}ms`);
            
            this._panel.webview.postMessage({ 
                type: 'response', 
                content: response.content 
            });
            AIPanel._outputChannel.appendLine('Response sent to webview');
        } catch (error) {
            AIPanel._outputChannel.appendLine(`Error: ${error}`);
            vscode.window.showErrorMessage(`Failed to connect to ${this._getProvider()} API: ${error}`);
        }
    }
    
    private async _callAIProvider(prompt: string): Promise<AIResponse> {
        const provider = this._getProvider();
        const apiKey = this._getApiKey();
        const model = this._getModel();
        
        if (!apiKey) {
            throw new Error(`No API key found for ${provider}. Please set it in settings or environment variables.`);
        }
        
        switch(provider) {
            case AIProvider.Anthropic:
                return this._callAnthropic(prompt, apiKey, model);
            case AIProvider.OpenAI:
                return this._callOpenAI(prompt, apiKey, model);
            case AIProvider.Deepseek:
                return this._callDeepseek(prompt, apiKey, model);
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }
    
    private async _callAnthropic(prompt: string, apiKey: string, model: string): Promise<AIResponse> {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: 4000
            }),
        });
        
        const data = await response.json() as AnthropicResponse;
        if (!response.ok) {
            throw new Error(`Anthropic API error: ${JSON.stringify(data)}`);
        }
        
        // Extract content from Anthropic's response format
        const content = data.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('');
            
        return { content };
    }
    
    private async _callOpenAI(prompt: string, apiKey: string, model: string): Promise<AIResponse> {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: 4000
            }),
        });
        
        const data = await response.json() as OpenAIResponse;
        if (!response.ok) {
            throw new Error(`OpenAI API error: ${JSON.stringify(data)}`);
        }
        
        return { content: data.choices[0].message.content };
    }
    
    private async _callDeepseek(prompt: string, apiKey: string, model: string): Promise<AIResponse> {
        const response = await fetch('https://api.deepseek.com/v1/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                max_tokens: 4000
            }),
        });
        
        const data = await response.json() as DeepseekResponse;
        if (!response.ok) {
            throw new Error(`Deepseek API error: ${JSON.stringify(data)}`);
        }
        
        return { content: data.outputs[0].text };
    }

    private async _pickFiles() {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: true,
            openLabel: 'Add to Context',
            filters: {
                'All Files': ['*']
            }
        });

        if (files) {
            for (const file of files) {
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const decoder = new TextDecoder();
                    this.attachFile(file.fsPath, decoder.decode(content));
                } catch (error) {
                    AIPanel._outputChannel.appendLine(`Error reading file ${file.fsPath}: ${error}`);
                }
            }
        }
    }

    private _getWebviewContent() {
        try {
            const htmlPath = path.join(this._extensionPath, 'out', 'webview', 'webview.html');
            
            if (!fs.existsSync(htmlPath)) {
                throw new Error(`HTML file not found at: ${htmlPath}`);
            }
            
            let html = fs.readFileSync(htmlPath, 'utf8');

            // Get the webview js file
            const jsPath = vscode.Uri.file(
                path.join(this._extensionPath, 'out', 'webview', 'webview.js')
            );
            const jsUri = this._panel.webview.asWebviewUri(jsPath);

            // Replace the script src with the correct URI
            const scriptSrc = `<script src="${jsUri}"></script>`;
            html = html.replace('<script src="webview.js"></script>', scriptSrc);
            
            return html;
        } catch (error) {
            AIPanel._outputChannel.appendLine(`Error loading webview content: ${error}`);
            throw error;
        }
    }

    public dispose() {
        AIPanel._outputChannel.appendLine('Disposing AI panel...');
        AIPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        AIPanel._outputChannel.appendLine('AI panel disposed');
    }

    public sendMessage(message: any) {
        this._panel.webview.postMessage(message);
    }

    public isVisible(): boolean {
        return this._panel.visible;
    }
} 