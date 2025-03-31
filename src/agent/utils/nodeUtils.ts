/**
 * Common utilities for node functions
 */

import * as config from '../../config';
import { Logger } from './Logger';
import { WorkerResponse } from '../../types';
import { AgentStateType, SubTask } from '../core/state';
import { ChatOpenAI } from "@langchain/openai";
import { WorkspaceManager } from './WorkspaceManager';
import { createAgentTools } from '../tools/tools';
import { SubtaskType } from '../../types/agent';

const logger = Logger.getInstance();
const componentName = 'Agent';

export function createSubtask(
    type: SubtaskType, 
    description: string, 
    task: string, 
    context?: string
): SubTask {
    return {
        id: type,
        type: type as 'analysis' | 'generation' | 'test',
        description,
        task,
        context
    };
}

export async function executeToolBasedTask(
    subtask: AgentStateType['currentSubtask'], 
    systemPrompt: string, 
    workspaceManager?: WorkspaceManager
): Promise<WorkerResponse> {
    if (!subtask) {
        return {
            success: false,
            result: '',
            error: 'No subtask provided'
        };
    }
    
    try {
        const apiKey = config.getApiKey();
        if (!apiKey) {
            return {
                success: false,
                result: '',
                error: 'No API key found'
            };
        }
        
        logger.log(componentName, `Executing subtask: ${subtask.id} (${subtask.type})`);
        
        // Use the provided workspaceManager or create a new one if not provided
        const wsManager = workspaceManager || new WorkspaceManager();
        
        // Get all available tools using our createAgentTools function
        const tools = Object.values(createAgentTools(wsManager));
        
        // Create a ChatOpenAI model with tools
        const model = new ChatOpenAI({
            modelName: config.getModel(),
            openAIApiKey: apiKey,
            maxTokens: config.MAX_TOKENS
        }).bind({
            tools: tools
        });
        
        // Initialize messages
        const messages: any[] = [
            { role: 'system', content: systemPrompt }
        ];
        
        if (subtask.context) {
            messages.push({ role: 'user', content: subtask.context });
        }
        
        messages.push({ role: 'user', content: subtask.task });
        
        logger.log(componentName, `Calling LLM with tools for subtask: ${subtask.id}`);
        
        // Call the model with the messages and tools
        const response = await model.invoke(messages);
        
        // Process tool calls if they exist
        if (response.tool_calls && response.tool_calls.length > 0) {
            logger.log(componentName, `Received ${response.tool_calls.length} tool calls`);
            
            // Execute each tool call
            const toolResults = [];
            for (const toolCall of response.tool_calls) {
                try {
                    // Find the requested tool
                    const requestedTool = tools.find(t => t.name === toolCall.name);
                    if (!requestedTool) {
                        toolResults.push(`Tool ${toolCall.name} not found`);
                        continue;
                    }
                    
                    // Parse the arguments
                    const args = typeof toolCall.args === 'string' 
                        ? JSON.parse(toolCall.args) 
                        : toolCall.args;
                    
                    // Call the tool
                    logger.log(componentName, `Executing tool: ${toolCall.name} with args: ${JSON.stringify(args)}`);
                    const toolResult = await requestedTool.invoke(args);
                    toolResults.push(`Tool ${toolCall.name} result: ${JSON.stringify(toolResult)}`);
                    
                    // Check if the tool returned a Command
                    if (toolResult && typeof toolResult === 'object' && 'goto' in toolResult) {
                        // This is a special case where a tool wants to control the graph flow
                        // In a real implementation, you would handle this appropriately
                        logger.log(componentName, `Tool returned a Command to go to node: ${toolResult.goto}`);
                    }
                } catch (error) {
                    logger.log(componentName, `Error executing tool call: ${error}`);
                    toolResults.push(`Error executing tool ${toolCall.name}: ${error}`);
                }
            }
            
            // Combine tool results with the LLM response
            const responseContent = typeof response.content === 'string' 
                ? response.content 
                : JSON.stringify(response.content);
            
            const result = `
LLM Response: ${responseContent || ''}

Tool Execution Results:
${toolResults.join('\n')}
`;
            
            return {
                success: true,
                result: result
            };
        }
        
        // If no tool calls, just return the LLM response
        const responseContent = typeof response.content === 'string' 
            ? response.content 
            : JSON.stringify(response.content);
        
        return {
            success: true,
            result: responseContent || ''
        };
    } catch (error) {
        logger.log(componentName, `Error executing task: ${error}`);
        return {
            success: false,
            result: '',
            error: `Error executing task: ${error}`
        };
    }
} 