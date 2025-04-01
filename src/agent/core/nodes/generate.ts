import { AgentStateType } from '../state';
import { Logger } from '../../utils/Logger';
import { GENERATION_PROMPT } from '../../prompts';
import { ChatOpenAI } from "@langchain/openai";
import { createAgentTools } from '../../tools/tools';
import * as config from '../../../config';
import { WorkerResponse } from '../../../types';

const logger = Logger.getInstance();
const componentName = 'Agent Generate';

/**
 * Executes a code generation task using LLM with bound workspace tools
 * 
 * This function:
 * 1. Creates a ChatOpenAI model and binds workspace tools directly
 * 2. Tools are bound to the model using the recommended bindTools() method
 * 3. The model decides when and how to use tools based on the generation prompt
 * 4. Commonly used tools include readFile, writeFile, editAndShowDiff for code changes
 * 5. Results from generation are stored before moving to the test phase
 * 
 * @param state - Current agent state containing the task and subtask information
 * @param runtimeConfig - Configuration object containing workspace manager
 * @returns Updated agent state with generation results and next step set to testing
 */
export async function executeGenerationTask(state: AgentStateType, runtimeConfig?: any): Promise<Partial<AgentStateType>> {
    if (!state.currentSubtask) {
        return {
            error: 'No current subtask to execute',
            nextStep: 'synthesizeResults'
        };
    }
    
    logger.log(componentName, `Executing generation task: ${state.currentSubtask.description}`);
    
    const workspaceManager = runtimeConfig?.configurable?.input?.workspaceManager;
    if (!workspaceManager) {
        return {
            error: 'No workspace manager available',
            nextStep: 'synthesizeResults'
        };
    }
    
    try {
        const apiKey = config.getApiKey();
        if (!apiKey) {
            return {
                error: 'No API key found',
                nextStep: 'synthesizeResults'
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
            { role: 'system', content: GENERATION_PROMPT }
        ];
        
        if (state.currentSubtask.context) {
            messages.push({ role: 'user', content: state.currentSubtask.context });
        }
        
        messages.push({ role: 'user', content: state.currentSubtask.task });
        
        logger.log(componentName, `Calling LLM with bound tools for code generation`);
        
        // Invoke the model with tools
        const response = await modelWithTools.invoke(messages);
        
        // Process the response into a standard format
        let result: WorkerResponse;
        
        if (response.tool_calls && response.tool_calls.length > 0) {
            logger.log(componentName, `Generation used ${response.tool_calls.length} tools`);
            
            const toolInfo = response.tool_calls.map(call => 
                `Tool: ${call.name}\nArguments: ${JSON.stringify(call.args, null, 2)}`
            ).join('\n\n');
            
            const resultContent = `
Generation Response: ${typeof response.content === 'string' ? response.content : JSON.stringify(response.content)}

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
        
        const updatedResults = { [state.currentSubtask.id]: result };
        
        return {
            results: updatedResults,
            nextStep: 'executeTestTask'
        };
    } catch (error) {
        logger.log(componentName, `Error in generation task: ${error}`);
        return {
            error: `Error in generation: ${error}`,
            nextStep: 'synthesizeResults'
        };
    }
}
