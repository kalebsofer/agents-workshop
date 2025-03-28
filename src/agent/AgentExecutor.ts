/**
 * AgentExecutor.ts
 * 
 * Main entry point for the AI coding agent. Coordinates the orchestrator,
 * workers, and tools to execute coding tasks.
 */

import * as vscode from 'vscode';
import { WorkspaceManager } from './WorkspaceManager';
import { ToolsImplementation } from './ToolsImplementation';
import { Orchestrator, OrchestratorRequest } from './Orchestrator';
import { Logger } from './Logger';

export interface ExecutionResult {
    success: boolean;
    response?: string;
    error?: string;
}

export interface ExecutionProgress {
    readonly onProgress: vscode.Event<string>;
    report(message: string): void;
}

export class AgentExecutor {
    private readonly logger = Logger.getInstance();
    private readonly componentName = 'AgentExecutor';
    private readonly workspaceManager: WorkspaceManager;
    private readonly toolsProvider: ToolsImplementation;
    private readonly orchestrator: Orchestrator;
    private readonly progressEmitter = new vscode.EventEmitter<string>();
    
    private _isExecuting: boolean = false;
    
    constructor() {
        try {
            this.workspaceManager = new WorkspaceManager();
            this.toolsProvider = new ToolsImplementation(this.workspaceManager);
            this.orchestrator = new Orchestrator(this.toolsProvider, this.workspaceManager);
            
            this.logger.log(this.componentName, 'AI Coding Agent initialized successfully');
        } catch (error) {
            this.logger.log(this.componentName, `Error initializing AI Coding Agent: ${error}`);
            throw error;
        }
    }
    
    /**
     * Get a progress reporter for tracking execution progress
     */
    public get progress(): ExecutionProgress {
        return {
            onProgress: this.progressEmitter.event,
            report: (message: string) => this.progressEmitter.fire(message)
        };
    }
    
    /**
     * Check if the agent is currently executing a task
     */
    public get isExecuting(): boolean {
        return this._isExecuting;
    }
    
    /**
     * Execute a task using the agent
     */
    public async execute(query: string): Promise<ExecutionResult> {
        if (this._isExecuting) {
            return {
                success: false,
                error: 'Another task is already being executed'
            };
        }
        
        this._isExecuting = true;
        
        try {
            // Check if we have a workspace folder
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.progressEmitter.fire('Error: No workspace folder is open');
                return {
                    success: false,
                    error: 'No workspace folder is open. Please open a folder in VS Code to use the agent features.'
                };
            }
            
            this.logger.log(this.componentName, `Executing task: ${query}`);
            this.progressEmitter.fire('Analyzing task...');
            
            // Prepare the request
            const request: OrchestratorRequest = {
                userQuery: query
            };
            
            // Execute the request
            this.progressEmitter.fire('Planning execution...');
            const response = await this.orchestrator.execute(request);
            
            if (!response.success) {
                this.progressEmitter.fire(`Error: ${response.error || 'Task execution failed'}`);
                return {
                    success: false,
                    error: response.error || 'Task execution failed'
                };
            }
            
            // Return the synthesized results
            return {
                success: true,
                response: response.results || 'Task completed successfully, but no results were generated'
            };
        } catch (error) {
            const errorMessage = `Error executing task: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            
            // Check if this is a workspace access error
            if (error instanceof Error && error.message.includes('workspace folder')) {
                this.progressEmitter.fire('Error: No workspace folder access');
                return {
                    success: false,
                    error: 'The agent cannot access workspace files. Please make sure a folder is open in VS Code.'
                };
            }
            
            this.progressEmitter.fire(`Error: ${error}`);
            return {
                success: false,
                error: errorMessage
            };
        } finally {
            this._isExecuting = false;
        }
    }
    
    /**
     * Cancel the current execution
     */
    public cancel(): void {
        // Currently, we don't have a way to cancel in-progress LLM requests
        // This is a stub for future implementation
        this.logger.log(this.componentName, 'Cancellation requested, but not yet implemented');
        this.progressEmitter.fire('Cancellation requested');
    }
    
    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.progressEmitter.dispose();
    }
} 