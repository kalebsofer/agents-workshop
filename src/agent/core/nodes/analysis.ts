import { AgentStateType } from '../state';
import { Logger } from '../../utils/Logger';
import { END } from '@langchain/langgraph';
import { ANALYSIS_PROMPT } from '../../prompts';
import { ChatOpenAI } from "@langchain/openai";
import { createAgentTools } from '../../tools/tools';
import * as config from '../../../config';
import { WorkerResponse, SubTask, SubtaskType, TaskType } from '../../../types/agent';

const logger = Logger.getInstance();
const componentName = 'Agent Analysis';

/**
 * Creates a subtask with the specified parameters
 */
function createSubtask(
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

/**
 * Executes a code analysis task using LLM with bound workspace tools
 * 
 * This function:
 * 1. Creates a ChatOpenAI model and binds workspace tools directly
 * 2. Tools are bound to the model using the recommended bindTools() method
 * 3. The model decides when and how to use tools based on the analysis prompt
 * 4. Results from the analysis are stored and used to determine next steps
 * 
 * @param state - Current agent state containing the task and subtask information
 * @param runtimeConfig - Configuration object containing workspace manager
 * @returns Updated agent state with analysis results and next step decision
 */
export async function executeAnalysisTask(state: AgentStateType, runtimeConfig?: any): Promise<Partial<AgentStateType>> {
    if (!state.currentSubtask) {
        return {
            error: 'No current subtask to execute',
            nextStep: END
        };
    }
    
    logger.log(componentName, `Executing analysis task: ${state.currentSubtask.description}`);
    
    const workspaceManager = runtimeConfig?.configurable?.input?.workspaceManager;
    if (!workspaceManager) {
        return {
            error: 'No workspace manager available',
            nextStep: END
        };
    }
    
    try {
        const apiKey = config.getApiKey();
        if (!apiKey) {
            return {
                error: 'No API key found',
                nextStep: END
            };
        }
        
        // Get tools directly
        const tools = Object.values(createAgentTools(workspaceManager));
        
        // Create the base model
        const baseModel = new ChatOpenAI({
            modelName: config.getModel(),
            openAIApiKey: apiKey,
            maxTokens: config.MAX_TOKENS
        });
        
        // Bind tools to the model using the recommended method
        const modelWithTools = baseModel.bindTools(tools);
        
        // Prepare messages
        const messages = [
            { role: 'system', content: ANALYSIS_PROMPT }
        ];
        
        if (state.currentSubtask.context) {
            messages.push({ role: 'user', content: state.currentSubtask.context });
        }
        
        messages.push({ role: 'user', content: state.currentSubtask.task });
        
        logger.log(componentName, `Calling LLM with bound tools for analysis`);
        
        // Invoke the model with tools
        const response = await modelWithTools.invoke(messages);
        
        // Process the response into a standard format
        let result: WorkerResponse;
        
        if (response.tool_calls && response.tool_calls.length > 0) {
            logger.log(componentName, `Analysis used ${response.tool_calls.length} tools`);
            
            const toolInfo = response.tool_calls.map(call => 
                `Tool: ${call.name}\nArguments: ${JSON.stringify(call.args, null, 2)}`
            ).join('\n\n');
            
            const resultContent = `
Analysis Response: ${typeof response.content === 'string' ? response.content : JSON.stringify(response.content)}

Tools Used:
${toolInfo}`;
            
            result = {
                success: true,
                result: resultContent,
                toolsUsed: response.tool_calls.map(call => call.name)
            };
        } else {
            // No tools were used
            const responseContent = typeof response.content === 'string' 
                ? response.content 
                : JSON.stringify(response.content);
                
            result = {
                success: true,
                result: responseContent
            };
        }
        
        // Store the result
        const updatedResults = { [state.currentSubtask.id]: result };
        
        // Determine if we need to go to generation next
        let needsGeneration = false;
        
        // Check if the task was explicitly marked as requiring generation
        if (state.task && state.task.requiresGeneration) {
            needsGeneration = true;
        } else {
            // Otherwise, check the query for generation-related keywords
            const originalQuery = state.task?.query?.toLowerCase() || '';
            needsGeneration = originalQuery.includes('generate') || 
                             originalQuery.includes('create') || 
                             originalQuery.includes('implement') ||
                             originalQuery.includes('write') ||
                             originalQuery.includes('add') ||
                             originalQuery.includes('update') ||
                             originalQuery.includes('modify') ||
                             originalQuery.includes('change') ||
                             originalQuery.includes('fix') ||
                             originalQuery.includes('improve') ||
                             originalQuery.includes('optimize') ||
                             originalQuery.includes('extend');
        }
        
        if (needsGeneration) {
            const generationSubtask = createSubtask(
                SubtaskType.GENERATION,
                'Generate or modify code based on analysis',
                state.task?.query || '',
                `Analysis results:\n${result.result}\n\nOriginal task: ${state.task?.query}`
            );
            
            return {
                results: updatedResults,
                nextStep: TaskType.GENERATION,
                currentSubtask: generationSubtask
            };
        }
        
        return {
            results: updatedResults,
            nextStep: END
        };
    } catch (error) {
        logger.log(componentName, `Error in analysis task: ${error}`);
        return {
            error: `Error in analysis: ${error}`,
            nextStep: END
        };
    }
}
