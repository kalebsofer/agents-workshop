/**
 * Test node for the LangGraph agent workflow.
 * Handles code testing tasks to validate code functionality.
 */

import { AgentStateType } from '../state';
import { Logger } from '../../utils/Logger';
import { executeToolBasedTask } from '../../utils/nodeUtils';
import { TEST_PROMPT } from '../../prompts';

// Logger instance
const logger = Logger.getInstance();
const componentName = 'Agent';

/**
 * Executes a test subtask
 */
export async function executeTestTask(state: AgentStateType, runtimeConfig?: any): Promise<Partial<AgentStateType>> {
    if (!state.currentSubtask) {
        return {
            error: 'No current subtask to execute',
            nextStep: 'synthesizeResults'
        };
    }
    
    logger.log(componentName, `Executing test task: ${state.currentSubtask.description}`);
    
    // Get workspaceManager from config
    const workspaceManager = runtimeConfig?.configurable?.input?.workspaceManager;
    
    try {
        const result = await executeToolBasedTask(state.currentSubtask, TEST_PROMPT, workspaceManager);
        
        // Store the result
        const updatedResults = { [state.currentSubtask.id]: result };
        
        // Always go to synthesize results after testing
        return {
            results: updatedResults,
            nextStep: 'synthesizeResults'
        };
    } catch (error) {
        logger.log(componentName, `Error in test task: ${error}`);
        return {
            error: `Error in testing: ${error}`,
            nextStep: 'synthesizeResults'
        };
    }
}
