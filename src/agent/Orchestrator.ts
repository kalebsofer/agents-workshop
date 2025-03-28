/**
 * Orchestrator.ts
 * 
 * Coordinates worker LLMs to execute complex tasks by breaking them down
 * into subtasks and synthesizing the results.
 */

import * as vscode from 'vscode';
import * as config from '../config';
import { ToolsProvider } from './AgentTools';
import { WorkspaceManager } from './WorkspaceManager';
import { CodeAnalysisWorker } from './workers/CodeAnalysisWorker';
import { CodeGenerationWorker } from './workers/CodeGenerationWorker';
import { WorkerRequest, WorkerResponse } from './AgentWorker';
import { Logger } from './Logger';

export interface SubTask {
    id: string;
    type: 'analysis' | 'generation' | 'test';
    description: string;
    task: string;
    context?: string;
    assigned: boolean;
    completed: boolean;
    result?: string;
    dependsOn?: string[];
}

export interface OrchestratorRequest {
    userQuery: string;
    workspaceContext?: string;
}

export interface OrchestratorResponse {
    success: boolean;
    plan?: string;
    subTasks?: SubTask[];
    results?: string;
    error?: string;
}

export class Orchestrator {
    private readonly logger = Logger.getInstance();
    private readonly componentName = 'Orchestrator';
    private readonly toolsProvider: ToolsProvider;
    private readonly workspaceManager: WorkspaceManager;
    private readonly codeAnalysisWorker: CodeAnalysisWorker;
    private readonly codeGenerationWorker: CodeGenerationWorker;
    
    constructor(toolsProvider: ToolsProvider, workspaceManager: WorkspaceManager) {
        this.toolsProvider = toolsProvider;
        this.workspaceManager = workspaceManager;
        this.codeAnalysisWorker = new CodeAnalysisWorker(toolsProvider);
        this.codeGenerationWorker = new CodeGenerationWorker(toolsProvider);
    }
    
    /**
     * Execute a task using the orchestrator-workers pattern
     */
    public async execute(request: OrchestratorRequest): Promise<OrchestratorResponse> {
        try {
            this.logger.log(this.componentName, 'Starting orchestration for task: ' + request.userQuery);
            
            // 1. Plan the execution by breaking down the task
            const plan = await this.planExecution(request);
            
            if (!plan.success || !plan.subTasks || plan.subTasks.length === 0) {
                return {
                    success: false,
                    error: plan.error || 'Failed to create execution plan'
                };
            }
            
            this.logger.log(this.componentName, `Created plan with ${plan.subTasks.length} subtasks`);
            
            // 2. Execute the subtasks
            for (const subTask of plan.subTasks) {
                if (subTask.dependsOn && subTask.dependsOn.length > 0) {
                    // Check if all dependencies are completed
                    const allDependenciesCompleted = subTask.dependsOn.every(depId => {
                        const dependency = plan.subTasks?.find(t => t.id === depId);
                        return dependency?.completed;
                    });
                    
                    if (!allDependenciesCompleted) {
                        this.logger.log(this.componentName, `Skipping subtask ${subTask.id} as dependencies are not completed`);
                        continue;
                    }
                }
                
                this.logger.log(this.componentName, `Executing subtask ${subTask.id}: ${subTask.description}`);
                
                // Create context from completed dependent tasks
                let context = '';
                if (subTask.dependsOn) {
                    for (const depId of subTask.dependsOn) {
                        const dependency = plan.subTasks.find(t => t.id === depId);
                        if (dependency?.completed && dependency.result) {
                            context += `Result from ${dependency.description}:\n${dependency.result}\n\n`;
                        }
                    }
                }
                
                // Add original task context if available
                if (subTask.context) {
                    context += subTask.context;
                }
                
                const subTaskRequest: WorkerRequest = {
                    task: subTask.task,
                    context: context || undefined,
                };
                
                // Execute the subtask with the appropriate worker
                let response: WorkerResponse;
                switch (subTask.type) {
                    case 'analysis':
                        response = await this.codeAnalysisWorker.execute(subTaskRequest);
                        break;
                    case 'generation':
                        response = await this.codeGenerationWorker.execute(subTaskRequest);
                        break;
                    default:
                        this.logger.log(this.componentName, `Unknown subtask type: ${subTask.type}`);
                        response = {
                            success: false,
                            result: '',
                            error: `Unknown subtask type: ${subTask.type}`
                        };
                }
                
                // Update the subtask with the result
                subTask.completed = response.success;
                subTask.result = response.result;
                
                if (!response.success) {
                    this.logger.log(this.componentName, `Failed to execute subtask ${subTask.id}: ${response.error}`);
                }
            }
            
            // 3. Synthesize the results
            const synthesizedResult = await this.synthesizeResults(plan.subTasks, request.userQuery);
            
            return {
                success: true,
                plan: plan.plan,
                subTasks: plan.subTasks,
                results: synthesizedResult
            };
        } catch (error) {
            const errorMessage = `Error in orchestration: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    
    /**
     * Plan the execution by breaking down the task into subtasks
     */
    private async planExecution(request: OrchestratorRequest): Promise<{
        success: boolean;
        plan?: string;
        subTasks?: SubTask[];
        error?: string;
    }> {
        const apiKey = config.getApiKey();
        
        if (!apiKey) {
            return {
                success: false,
                error: 'No API key found'
            };
        }
        
        this.logger.log(this.componentName, 'Creating execution plan...');
        
        try {
            // Prepare context about the workspace
            let workspaceContext = request.workspaceContext || '';
            if (!workspaceContext) {
                workspaceContext = await this.getWorkspaceContext();
            }
            
            // Create planning prompt
            const systemPrompt = `You are an AI orchestrator responsible for breaking down complex coding tasks into subtasks.
Your job is to analyze a user's request and create a structured plan to fulfill it by dividing it into smaller, manageable subtasks.

For each subtask, specify:
1. A unique ID
2. The type of subtask (analysis, generation, test)
3. A brief description
4. The detailed task instruction
5. Any dependencies on other subtasks (by ID)

The available subtask types are:
- analysis: For understanding code, finding patterns, or identifying issues
- generation: For writing or modifying code files
- test: For validating that code works as expected

Think step-by-step about the logical order of operations needed. Some tasks may depend on the results of others.
Your output must be in JSON format with the following structure:
{
  "plan": "Overall plan description in a few sentences",
  "subTasks": [
    {
      "id": "task1",
      "type": "analysis",
      "description": "Brief description",
      "task": "Detailed instructions for the worker",
      "dependsOn": []
    },
    {
      "id": "task2",
      "type": "generation",
      "description": "Brief description",
      "task": "Detailed instructions for the worker",
      "dependsOn": ["task1"]
    }
  ]
}`;

            const userPrompt = `Task: ${request.userQuery}

Workspace context:
${workspaceContext}

Create a detailed execution plan for this task, breaking it down into appropriate subtasks.`;

            // Call LLM to create plan
            const response = await fetch(config.OPENAI_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: config.getModel(),
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: config.MAX_TOKENS
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json() as { error?: { message?: string } };
                throw new Error(errorData.error?.message || 'API error');
            }
            
            const data = await response.json() as { 
                choices?: Array<{ message?: { content?: string } }> 
            };
            
            if (!data.choices || !data.choices[0]?.message?.content) {
                throw new Error('Invalid response from LLM API');
            }
            
            const content = data.choices[0].message.content;
            
            // Parse the JSON response
            // Find the first JSON block in the response
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                              content.match(/{[\s\S]*}/);
            
            if (!jsonMatch) {
                throw new Error('Could not find JSON in response');
            }
            
            const jsonContent = jsonMatch[1] || jsonMatch[0];
            const plan = JSON.parse(jsonContent) as {
                plan: string;
                subTasks: SubTask[];
            };
            
            // Validate and initialize the plan
            if (!plan.subTasks || !Array.isArray(plan.subTasks)) {
                throw new Error('Invalid plan format: subTasks is missing or not an array');
            }
            
            // Initialize each subtask
            for (const task of plan.subTasks) {
                task.assigned = false;
                task.completed = false;
            }
            
            return {
                success: true,
                plan: plan.plan,
                subTasks: plan.subTasks
            };
        } catch (error) {
            const errorMessage = `Error planning execution: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    
    /**
     * Synthesize the results of the subtasks
     */
    private async synthesizeResults(subTasks: SubTask[], originalQuery: string): Promise<string> {
        const apiKey = config.getApiKey();
        
        if (!apiKey) {
            return 'Could not synthesize results: No API key found';
        }
        
        this.logger.log(this.componentName, 'Synthesizing results...');
        
        // Collect the results from completed subtasks
        const completedTasks = subTasks.filter(task => task.completed && task.result);
        
        if (completedTasks.length === 0) {
            return 'No completed subtasks to synthesize.';
        }
        
        try {
            // Create synthesis prompt
            const systemPrompt = `You are an AI synthesizer responsible for combining the results of multiple subtasks into a coherent response.
Your job is to analyze the results of various coding tasks and create a comprehensive answer that addresses the user's original query.

Your response should:
1. Directly address the user's original question
2. Synthesize information from all completed subtasks
3. Explain what changes were made to the codebase, if any
4. Provide a clear summary of findings or solutions
5. Use technical, concise language appropriate for developers

Make your response well-structured and easy to follow. Focus on providing a complete and accurate answer to the user's query.`;

            let userPrompt = `Original query: ${originalQuery}\n\nResults from subtasks:\n\n`;
            
            for (const task of completedTasks) {
                userPrompt += `## ${task.description}\n\n${task.result}\n\n---\n\n`;
            }
            
            userPrompt += 'Please synthesize these results into a comprehensive response that addresses the original query.';
            
            // Call LLM to synthesize results
            const response = await fetch(config.OPENAI_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: config.getModel(),
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: config.MAX_TOKENS
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json() as { error?: { message?: string } };
                throw new Error(errorData.error?.message || 'API error');
            }
            
            const data = await response.json() as { 
                choices?: Array<{ message?: { content?: string } }> 
            };
            
            if (!data.choices || !data.choices[0]?.message?.content) {
                throw new Error('Invalid response from LLM API');
            }
            
            return data.choices[0].message.content;
        } catch (error) {
            const errorMessage = `Error synthesizing results: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            return `Failed to synthesize results: ${error}`;
        }
    }
    
    /**
     * Get context about the workspace for planning
     */
    private async getWorkspaceContext(): Promise<string> {
        try {
            // Get workspace folders
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.logger.log(this.componentName, 'No workspace folder is open');
                return 'No workspace folder is open. Please open a folder in VS Code to use the agent features. The agent needs access to workspace files to function properly.';
            }
            
            const rootPath = workspaceFolders[0].uri.fsPath;
            let context = `Workspace root: ${rootPath}\n\n`;
            
            // List top-level directories and files
            try {
                const files = await this.workspaceManager.listFiles('');
                if (files && files.length > 0) {
                    context += `Top-level files and directories: ${files.join(', ')}\n\n`;
                } else {
                    context += 'Workspace appears to be empty.\n\n';
                }
            } catch (error) {
                this.logger.log(this.componentName, `Error listing files: ${error}`);
                context += 'Could not access workspace files. The agent may have limited functionality.\n\n';
            }
            
            // Check for package.json
            try {
                const packageJson = await this.workspaceManager.readFile('package.json');
                const pkg = JSON.parse(packageJson);
                context += `Project name: ${pkg.name}\n`;
                context += `Description: ${pkg.description || 'No description'}\n`;
                context += `Dependencies: ${Object.keys(pkg.dependencies || {}).join(', ') || 'None'}\n`;
                context += `Dev Dependencies: ${Object.keys(pkg.devDependencies || {}).join(', ') || 'None'}\n\n`;
            } catch (error) {
                context += 'No package.json found or could not parse it.\n\n';
            }
            
            return context;
        } catch (error) {
            this.logger.log(this.componentName, `Error getting workspace context: ${error}`);
            if (error instanceof Error && error.message.includes('workspace folder')) {
                return 'Could not access workspace files. Please ensure you have opened a folder in VS Code.';
            }
            return 'Could not gather workspace context.';
        }
    }
} 