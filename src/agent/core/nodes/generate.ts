/**
 * Generation node for the LangGraph agent workflow.
 * Handles code generation and modification tasks.
 */

import { AgentStateType } from '../state';
import { Logger } from '../../utils/Logger';
import { executeToolBasedTask } from '../../utils/nodeUtils';
import { GENERATION_PROMPT } from '../../prompts';

// Logger instance
const logger = Logger.getInstance();
const componentName = 'Agent';

/**
 * Executes a code generation subtask
 */
export async function executeGenerationTask(state: AgentStateType, runtimeConfig?: any): Promise<Partial<AgentStateType>> {
    if (!state.currentSubtask) {
        return {
            error: 'No current subtask to execute',
            nextStep: 'synthesizeResults'
        };
    }
    
    logger.log(componentName, `Executing generation task: ${state.currentSubtask.description}`);
    
    // Get workspaceManager from config
    const workspaceManager = runtimeConfig?.configurable?.input?.workspaceManager;
    
    try {
        const result = await executeToolBasedTask(state.currentSubtask, GENERATION_PROMPT, workspaceManager);
        
        // Store the result
        const updatedResults = { [state.currentSubtask.id]: result };
        
        // Always go to test after generation in our graph structure
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
