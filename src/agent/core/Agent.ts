/**
 * Main entry point for the LangGraph-based agent using graph-based approach.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { WorkspaceManager } from '../utils/WorkspaceManager';
import { pendingFileChanges } from '../utils/WorkspaceManager';
import { createAgentGraph } from './graph';
import type { ExecutionResult, ExecutionProgress } from '../../types/agent';

export class Agent {
    private readonly logger = Logger.getInstance();
    private readonly componentName = 'Agent';
    private readonly workspaceManager: WorkspaceManager;
    private readonly graph: ReturnType<typeof createAgentGraph>;
    private readonly progressEmitter = new vscode.EventEmitter<string>();
    private _isExecuting: boolean = false;
    
    constructor() {
        try {
            this.workspaceManager = new WorkspaceManager();
            this.graph = createAgentGraph();
            
            this.logger.log(this.componentName, 'LangGraph AI Coding Agent initialized successfully');
        } catch (error) {
            this.logger.log(this.componentName, `Error initializing LangGraph AI Coding Agent: ${error}`);
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
        // Special handling for accept/reject commands
        if (query.startsWith('Accept changes for file:') || query.startsWith('Reject changes for file:')) {
            return this.handleFileChangeCommand(query);
        }
        
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
            
            // Validate the query
            if (!query || typeof query !== 'string' || query.trim() === '') {
                this.logger.log(this.componentName, 'Error: Empty or invalid query provided');
                return {
                    success: false,
                    error: 'Empty or invalid query provided'
                };
            }
            
            this.logger.log(this.componentName, `Executing task: ${query}`);
            this.progressEmitter.fire('Analyzing task...');
            
            // Create event handler for progress updates
            const eventHandler = {
                handleNodeStart: (data: any) => {
                    const nodeName = data.node.name;
                    this.progressEmitter.fire(`Executing: ${nodeName}...`);
                },
                handleNodeEnd: (data: any) => {
                    // Optional update when a node finishes
                },
                handleNodeError: (data: any) => {
                    this.progressEmitter.fire(`Error in ${data.node.name}: ${data.error}`);
                },
            };
            
            // Prepare the input
            const input = {
                task: { query: query.trim() },
                workspaceManager: this.workspaceManager
            };
            
            this.logger.log(this.componentName, `Input prepared: ${JSON.stringify({ task: input.task })}`);
            this.progressEmitter.fire('Executing graph...');
            
            // Call LangGraph graph with the input
            const result = await this.graph.invoke({
                // Only include fields defined in the state graph
                task: { query: query.trim() },
                currentSubtask: null,
                results: {},
                error: null,
                nextStep: 'planExecution' // Skip initializeState, go directly to planning
            }, {
                // Pass the workspaceManager separately in the config
                configurable: {
                    input: input
                }
            });
            
            if (result.error) {
                return {
                    success: false,
                    error: result.error
                };
            }
            
            // Add detailed logging for successful results
            if (result.finalResult) {
                this.logger.log(this.componentName, `Graph execution completed successfully with result (length: ${result.finalResult.length})`);
                this.logger.log(this.componentName, `Response preview: ${result.finalResult.substring(0, 100)}...`);
                
                if (result.finalResult.trim() === '') {
                    this.logger.log(this.componentName, 'WARNING: Empty final result detected after graph execution');
                }
            } else {
                this.logger.log(this.componentName, 'Graph execution completed without a final result');
            }
            
            return {
                success: true,
                response: result.finalResult || 'Task completed but no results were generated'
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
     * Handle file change acceptance or rejection commands directly
     */
    private async handleFileChangeCommand(command: string): Promise<ExecutionResult> {
        try {
            const isAccept = command.startsWith('Accept changes for file:');
            const filePath = command.substring(isAccept ? 'Accept changes for file:'.length : 'Reject changes for file:'.length).trim();
            
            this.logger.log(this.componentName, `${isAccept ? 'Accepting' : 'Rejecting'} changes for file: ${filePath}`);
            this.progressEmitter.fire(`${isAccept ? 'Accepting' : 'Rejecting'} changes for file: ${filePath}...`);
            
            if (!pendingFileChanges.has(filePath)) {
                const errorMessage = `No pending changes found for file: ${filePath}`;
                this.logger.log(this.componentName, errorMessage);
                return {
                    success: false,
                    error: errorMessage
                };
            }
            
            let result: boolean;
            if (isAccept) {
                result = await this.workspaceManager.applyPendingChanges(filePath);
                this.progressEmitter.fire(`Changes applied to: ${filePath}`);
            } else {
                result = this.workspaceManager.rejectPendingChanges(filePath);
                this.progressEmitter.fire(`Changes rejected for: ${filePath}`);
            }
            
            if (result) {
                return {
                    success: true,
                    response: `Changes were successfully ${isAccept ? 'applied to' : 'rejected for'} ${filePath}.`
                };
            } else {
                return {
                    success: false,
                    error: `Could not ${isAccept ? 'apply' : 'reject'} changes for ${filePath}.`
                };
            }
        } catch (error) {
            const errorMessage = `Error handling file change command: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            return {
                success: false,
                error: errorMessage
            };
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
        this.workspaceManager.dispose();
    }
} 