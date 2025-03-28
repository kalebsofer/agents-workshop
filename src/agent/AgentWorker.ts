/**
 * AgentWorker.ts
 * 
 * Base class for agent workers in the orchestrator-workers pattern.
 * Each worker is specialized for a specific task and can use a set of tools.
 */

import * as vscode from 'vscode';
import * as config from '../config';
import { ToolsProvider, AgentTool, ToolResult } from './AgentTools';
import { Logger } from './Logger';

export interface WorkerRequest {
    task: string;
    context?: string;
    systemPrompt?: string;
    additionalData?: Record<string, any>;
}

export interface WorkerResponse {
    result: string;
    success: boolean;
    error?: string;
    toolsUsed?: string[];
    additionalData?: Record<string, any>;
}

export interface ToolCall {
    name: string;
    id: string;
    arguments: Record<string, any>;
}

export interface LLMResponse {
    content: string;
    toolCalls?: ToolCall[];
}

export interface WorkerMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolName?: string;
    toolCallId?: string;
}

export abstract class AgentWorker {
    protected readonly logger = Logger.getInstance();
    protected readonly componentName: string;
    protected readonly toolsProvider: ToolsProvider;
    protected readonly name: string;
    
    constructor(name: string, toolsProvider: ToolsProvider) {
        this.name = name;
        this.componentName = `AgentWorker:${name}`;
        this.toolsProvider = toolsProvider;
    }
    
    /**
     * Execute a worker task
     */
    public async execute(request: WorkerRequest): Promise<WorkerResponse> {
        try {
            this.logger.log(this.componentName, `Worker ${this.name} executing task: ${request.task}`);
            const systemPrompt = request.systemPrompt || this.getDefaultSystemPrompt();
            
            const messages: WorkerMessage[] = [
                { role: 'system', content: systemPrompt }
            ];
            
            if (request.context) {
                messages.push({ role: 'user', content: request.context });
            }
            
            messages.push({ role: 'user', content: request.task });
            
            return await this.executeWithToolLoop(messages);
        } catch (error) {
            const errorMessage = `Error in worker ${this.name}: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            return {
                result: '',
                success: false,
                error: errorMessage
            };
        }
    }
    
    /**
     * Execute a worker task with a tool use loop
     */
    protected async executeWithToolLoop(messages: WorkerMessage[], maxToolCalls: number = 10): Promise<WorkerResponse> {
        let toolsUsed: string[] = [];
        
        for (let i = 0; i < maxToolCalls; i++) {
            // Call LLM with current messages
            const llmResponse = await this.callLLM(messages);
            
            // Add LLM response to messages
            messages.push({ role: 'assistant', content: llmResponse.content });
            
            // Check if there are tool calls to execute
            if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
                // No tool calls, we're done
                return {
                    result: llmResponse.content,
                    success: true,
                    toolsUsed
                };
            }
            
            // Execute tool calls
            for (const toolCall of llmResponse.toolCalls) {
                const toolName = toolCall.name;
                const tool = this.toolsProvider.getTool(toolName);
                
                if (!tool) {
                    const errorMessage = `Tool "${toolName}" not found`;
                    this.logger.log(this.componentName, errorMessage);
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify({ error: errorMessage }),
                        toolName,
                        toolCallId: toolCall.id
                    });
                    continue;
                }
                
                toolsUsed.push(toolName);
                
                try {
                    // Fix: Directly call the tool with the arguments object
                    const result = await this.executeToolWithArgs(tool, toolCall.arguments);
                    
                    // Add tool result to messages
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify(result),
                        toolName,
                        toolCallId: toolCall.id
                    });
                    
                    this.logger.log(this.componentName, `Tool "${toolName}" executed successfully`);
                } catch (error) {
                    const errorMessage = `Error executing tool "${toolName}": ${error}`;
                    this.logger.log(this.componentName, errorMessage);
                    
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify({ error: errorMessage }),
                        toolName,
                        toolCallId: toolCall.id
                    });
                }
            }
        }
        
        // If we've reached here, we've exceeded the maximum number of tool calls
        return {
            result: "Maximum number of tool calls exceeded. Task could not be completed.",
            success: false,
            toolsUsed,
            error: "Max tool calls exceeded"
        };
    }
    
    /**
     * Helper method to execute a tool with the correct arguments based on its name
     */
    private async executeToolWithArgs(tool: AgentTool, args: Record<string, any>): Promise<ToolResult> {
        switch (tool.name) {
            case 'readFile':
                return await tool.execute(args.filePath);
            case 'writeFile':
                return await tool.execute(args.filePath, args.content);
            case 'listFiles':
                return await tool.execute(args.directoryPath);
            case 'searchCode':
                return await tool.execute(args.query, args.filePattern);
            case 'runCommand':
                return await tool.execute(args.command);
            default:
                // Use a type assertion to fix the TypeScript error
                const unknownTool = tool as { name: string };
                throw new Error(`Unknown tool: ${unknownTool.name}`);
        }
    }
    
    /**
     * Call the LLM API with messages
     */
    protected async callLLM(messages: WorkerMessage[]): Promise<LLMResponse> {
        this.logger.log(this.componentName, `Calling LLM for worker ${this.name}...`);
        
        const apiMessages = messages.map(msg => {
            return {
                role: msg.role,
                content: msg.content,
                ...(msg.toolName && { tool_name: msg.toolName }),
                ...(msg.toolCallId && { tool_call_id: msg.toolCallId })
            };
        });
        
        const requestBody = {
            model: config.getModel(),
            messages: apiMessages,
            max_tokens: config.MAX_TOKENS,
            tools: this.getToolsForLLM(),
            tool_choice: "auto"
        };
        
        try {
            const response = await fetch(config.OPENAI_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.getApiKey()}`
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorData = await response.json() as { error?: { message?: string } };
                const errorMessage = errorData.error?.message || JSON.stringify(errorData);
                throw new Error(`API error: ${errorMessage}`);
            }
            
            const data = await response.json() as { 
                choices?: Array<{ message?: { content?: string, tool_calls?: Array<any> } }> 
            };
            
            if (!data.choices || !data.choices[0]?.message) {
                throw new Error('Invalid response from LLM API');
            }
            
            const message = data.choices[0].message;
            
            return {
                content: message.content || '',
                toolCalls: message.tool_calls?.map((tc: any) => ({
                    name: tc.function.name,
                    id: tc.id,
                    arguments: JSON.parse(tc.function.arguments)
                }))
            };
        } catch (error) {
            this.logger.log(this.componentName, `LLM API error: ${error}`);
            throw error;
        }
    }
    
    /**
     * Get JSON schema definitions of available tools for the LLM API
     */
    protected getToolsForLLM(): any[] {
        return this.toolsProvider.getTools().map(tool => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: this.getToolParametersSchema(tool)
            }
        }));
    }
    
    /**
     * Get default system prompt for this worker
     */
    protected abstract getDefaultSystemPrompt(): string;
    
    /**
     * Get JSON schema for tool parameters
     */
    protected abstract getToolParametersSchema(tool: AgentTool): Record<string, any>;
} 