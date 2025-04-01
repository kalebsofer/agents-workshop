import { END } from '@langchain/langgraph';
import { ChatOpenAI } from "@langchain/openai";
import * as config from '../../../config';
import { ToolsProvider, TaskType, SubtaskType } from '../../../types/agent';
import { AgentStateType, SubTask } from '../state';
import { Logger } from '../../utils/Logger';
import { createAgentTools } from '../../tools/tools';
import { WorkspaceManager } from '../../utils/WorkspaceManager';
import { ORCHESTRATION_PROMPT } from '../../prompts';

const logger = Logger.getInstance();
const componentName = 'Agent Orchestrate';

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

export function initialiseState(
    state: AgentStateType, 
    { task, toolsProvider }: { task: { query: string, context?: string }, toolsProvider: ToolsProvider }
): Partial<AgentStateType> {
    // Check if task is defined
    if (!task || !task.query) {
        logger.log(componentName, "Error: Task or task query is undefined");
        return {
            error: "Task information is missing or invalid",
            nextStep: END
        };
    }

    logger.log(componentName, `Initialising agent with task: ${task.query}`);
    
    return {
        task: task,
        currentSubtask: null,
        results: {},
        error: null,
        nextStep: 'planExecution',
    };
}

export async function planExecution(
    state: AgentStateType, 
    runtimeConfig?: {
        configurable?: {
            input?: {
                workspaceManager?: WorkspaceManager
            }
        }
    }
): Promise<Partial<AgentStateType>> {
    logger.log(componentName, 'Analysing task and determining execution path...');
    
    try {
        const workspaceManager = runtimeConfig?.configurable?.input?.workspaceManager;
        
        // Log access to workspaceManager
        if (workspaceManager) {
            logger.log(componentName, 'WorkspaceManager available from config');
        } else {
            logger.log(componentName, 'WorkspaceManager not found in config');
        }
        
        if (!state.task || !state.task.query) {
            logger.log(componentName, 'Error: Task is missing or invalid');
            return {
                error: 'Task is missing or invalid',
                nextStep: END
            };
        }
        
        const apiKey = config.getApiKey();
        
        if (!apiKey) {
            return {
                error: 'No API key found',
                nextStep: END
            };
        }

        const userPrompt = `Task: ${state.task.query}
${state.task.context ? `\nContext:\n${state.task.context}` : ''}

Determine the task type for this query.`;

        const tools = workspaceManager ? Object.values(createAgentTools(workspaceManager)) : [];
        
        const model = new ChatOpenAI({
            modelName: config.getModel(),
            openAIApiKey: apiKey,
            maxTokens: config.MAX_TOKENS
        });
        
        // Call LLM to determine task type
        const response = await model.invoke([
            { role: 'system', content: ORCHESTRATION_PROMPT },
            { role: 'user', content: userPrompt }
        ]);
        
        // Extract content from response
        const content = typeof response.content === 'string' 
            ? response.content.trim() 
            : JSON.stringify(response.content);
            
        if (!content) {
            throw new Error('Empty response from LLM API');
        }
        
        logger.log(componentName, `Task type determined: ${content}`);
        
        // Define task handlers using object literal instead of if/else chain
        const taskHandlers: Record<string, () => { subtask: SubTask | null; nextStep: string }> = {
            [TaskType.ANALYSIS]: () => ({
                subtask: createSubtask(
                    SubtaskType.ANALYSIS,
                    'Analyse code and provide insights',
                    state.task!.query,
                    state.task!.context
                ),
                nextStep: TaskType.ANALYSIS
            }),
            
            [TaskType.GENERATION]: () => ({
                subtask: createSubtask(
                    SubtaskType.GENERATION,
                    'Generate or modify code',
                    state.task!.query,
                    state.task!.context
                ),
                nextStep: TaskType.GENERATION
            }),
            
            [TaskType.ANALYSIS_WITH_GENERATION]: () => {
                // Set a flag in the task to indicate generation should follow
                if (state.task) {
                    state.task.requiresGeneration = true;
                }
                
                return {
                    subtask: createSubtask(
                        SubtaskType.ANALYSIS,
                        'Analyse code before making changes',
                        state.task!.query,
                        state.task!.context
                    ),
                    nextStep: TaskType.ANALYSIS
                };
            },
            
            [TaskType.IRRELEVANT]: () => ({
                subtask: null,
                nextStep: TaskType.IRRELEVANT
            })
        };
        
        // Get the handler for the current task type or use a default
        const handler = taskHandlers[content] || (() => ({ subtask: null, nextStep: END }));
        const { subtask, nextStep } = handler();
        
        return {
            currentSubtask: subtask,
            nextStep,
            task: state.task // Pass the updated task with the requiresGeneration flag
        };
    } catch (error) {
        logger.log(componentName, `Error in task analysis: ${error}`);
        return {
            error: `Error analysing task: ${error}`,
            nextStep: END
        };
    }
}
