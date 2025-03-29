/**
 * ToolsImplementation.ts
 * 
 * Implements the tools that can be used by agent workers.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import { 
    ToolsProvider, 
    AgentTool, 
    ReadFileTool, 
    WriteFileTool, 
    ListFilesTool,
    SearchCodeTool,
    RunCommandTool,
    ToolResult 
} from '../types/agent';
import { WorkspaceManager } from './WorkspaceManager';
import { Logger } from './Logger';

export class ToolsImplementation implements ToolsProvider {
    private readonly logger = Logger.getInstance();
    private readonly componentName = 'ToolsImplementation';
    private readonly workspaceManager: WorkspaceManager;
    private readonly tools: AgentTool[];
    
    constructor(workspaceManager: WorkspaceManager) {
        this.workspaceManager = workspaceManager;
        this.tools = this.initializeTools();
    }
    
    public getTools(): AgentTool[] {
        return this.tools;
    }
    
    public getTool(name: string): AgentTool | undefined {
        return this.tools.find(tool => tool.name === name);
    }
    
    private initializeTools(): AgentTool[] {
        return [
            this.createReadFileTool(),
            this.createWriteFileTool(),
            this.createListFilesTool(),
            this.createSearchCodeTool(),
            this.createRunCommandTool()
        ];
    }
    
    private createReadFileTool(): ReadFileTool {
        return {
            name: 'readFile',
            description: 'Read the contents of a file in the workspace',
            execute: async (filePath: string): Promise<ToolResult> => {
                try {
                    this.logger.log(this.componentName, `Reading file: ${filePath}`);
                    const content = await this.workspaceManager.readFile(filePath);
                    return {
                        success: true,
                        data: { content }
                    };
                } catch (error) {
                    this.logger.log(this.componentName, `Error reading file: ${error}`);
                    return {
                        success: false,
                        error: `Failed to read file: ${error}`
                    };
                }
            }
        };
    }
    
    private createWriteFileTool(): WriteFileTool {
        return {
            name: 'writeFile',
            description: 'Write content to a file in the workspace (creates the file if it doesn\'t exist)',
            execute: async (filePath: string, content: string): Promise<ToolResult> => {
                try {
                    this.logger.log(this.componentName, `Writing to file: ${filePath}`);
                    const success = await this.workspaceManager.writeFile(filePath, content, true);
                    if (success) {
                        return {
                            success: true,
                            data: { filePath }
                        };
                    } else {
                        return {
                            success: false,
                            error: 'User declined the file write operation'
                        };
                    }
                } catch (error) {
                    this.logger.log(this.componentName, `Error writing to file: ${error}`);
                    return {
                        success: false,
                        error: `Failed to write to file: ${error}`
                    };
                }
            }
        };
    }
    
    private createListFilesTool(): ListFilesTool {
        return {
            name: 'listFiles',
            description: 'List files in a directory',
            execute: async (directoryPath: string): Promise<ToolResult> => {
                try {
                    this.logger.log(this.componentName, `Listing files in directory: ${directoryPath}`);
                    const files = await this.workspaceManager.listFiles(directoryPath);
                    return {
                        success: true,
                        data: { files }
                    };
                } catch (error) {
                    this.logger.log(this.componentName, `Error listing files: ${error}`);
                    return {
                        success: false,
                        error: `Failed to list files: ${error}`
                    };
                }
            }
        };
    }
    
    private createSearchCodeTool(): SearchCodeTool {
        return {
            name: 'searchCode',
            description: 'Search for code in the workspace using a query',
            execute: async (query: string, filePattern?: string): Promise<ToolResult> => {
                try {
                    this.logger.log(this.componentName, `Searching code with query: ${query}`);
                    
                    // Get workspace URI
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        return {
                            success: false,
                            error: 'No workspace folder open'
                        };
                    }
                    
                    // Manually search through files since findTextInFiles is not available
                    const results: Array<{ file: string; line: number; text: string }> = [];
                    
                    // Get all text documents in the workspace
                    const textDocuments = await vscode.workspace.findFiles(
                        filePattern || '**/*.{ts,js,json,md,html,css}',
                        '**/node_modules/**'
                    );
                    
                    // For each file, search for the query
                    for (const fileUri of textDocuments) {
                        try {
                            const document = await vscode.workspace.openTextDocument(fileUri);
                            const text = document.getText();
                            
                            // Simple search for matches
                            const lines = text.split('\n');
                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i].includes(query)) {
                                    results.push({
                                        file: fileUri.fsPath,
                                        line: i + 1, // Convert to 1-based line numbers
                                        text: lines[i].trim()
                                    });
                                    
                                    // Limit results per file
                                    if (results.length >= 100) {
                                        break;
                                    }
                                }
                            }
                        } catch (error) {
                            this.logger.log(this.componentName, `Error searching in file ${fileUri.fsPath}: ${error}`);
                        }
                    }
                    
                    return {
                        success: true,
                        data: { results }
                    };
                } catch (error) {
                    this.logger.log(this.componentName, `Error searching code: ${error}`);
                    return {
                        success: false,
                        error: `Failed to search code: ${error}`
                    };
                }
            }
        };
    }
    
    private createRunCommandTool(): RunCommandTool {
        return {
            name: 'runCommand',
            description: 'Run a command in the terminal (use with caution)',
            execute: async (command: string): Promise<ToolResult> => {
                try {
                    // Safety check - confirm with user first
                    const choice = await vscode.window.showWarningMessage(
                        `The agent wants to run command: ${command}`,
                        'Run', 'Cancel'
                    );
                    
                    if (choice !== 'Run') {
                        return {
                            success: false,
                            error: 'User declined to run the command'
                        };
                    }
                    
                    this.logger.log(this.componentName, `Running command: ${command}`);
                    
                    // Execute command
                    const exec = util.promisify(cp.exec);
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                    const { stdout, stderr } = await exec(command, { cwd: workspaceFolder });
                    
                    // Log output
                    if (stdout) {
                        this.logger.log(this.componentName, `Command output: ${stdout}`);
                    }
                    
                    if (stderr) {
                        this.logger.log(this.componentName, `Command error output: ${stderr}`);
                    }
                    
                    return {
                        success: true,
                        data: { 
                            output: stdout,
                            error: stderr 
                        }
                    };
                } catch (error) {
                    this.logger.log(this.componentName, `Error running command: ${error}`);
                    return {
                        success: false,
                        error: `Failed to run command: ${error}`
                    };
                }
            }
        };
    }
} 