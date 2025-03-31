import { AgentStateType } from '../state';
import { Logger } from '../../utils/Logger';
import { END } from '@langchain/langgraph';
import { executeToolBasedTask, createSubtask } from '../../utils/nodeUtils';
import { SubtaskType, TaskType } from '../../../types/agent';
import { ANALYSIS_PROMPT } from '../../prompts';

const logger = Logger.getInstance();
const componentName = 'Agent';

export async function executeAnalysisTask(state: AgentStateType, runtimeConfig?: any): Promise<Partial<AgentStateType>> {
    if (!state.currentSubtask) {
        return {
            error: 'No current subtask to execute',
            nextStep: END
        };
    }
    
    logger.log(componentName, `Executing analysis task: ${state.currentSubtask.description}`);
    
    const workspaceManager = runtimeConfig?.configurable?.input?.workspaceManager;
    
    try {
        const result = await executeToolBasedTask(state.currentSubtask, ANALYSIS_PROMPT, workspaceManager);
        
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
