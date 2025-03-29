/**
 * nodes.ts
 * 
 * Implements the nodes for the LangGraph agent workflow.
 * Each node represents a step in the agent execution process.
 */

import * as config from '../config';
import { AgentStateType } from './state';
import { ToolsProvider } from '../types/agent';
import { Logger } from './Logger';
import { WorkerMessage, WorkerResponse } from '../types';
import { END } from '@langchain/langgraph';
import { ChatOpenAI } from "@langchain/openai";
import { createLangGraphTools } from './tools';

// Logger instance
const logger = Logger.getInstance();
const componentName = 'LangGraphAgent';

/**
 * Helper function to enforce JSON format in OpenAI API calls
 */
function getOpenAIRequestOptions(messages: any[], model: string, apiKey: string) {
    return {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            max_tokens: config.MAX_TOKENS,
            response_format: { type: "json_object" }
        })
    };
}

/**
 * Initializes the agent state with the user task
 */
export function initializeState(
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

    logger.log(componentName, `Initializing agent with task: ${task.query}`);
    
    return {
        task: task,
        currentSubtask: null,
        results: {},
        error: null,
        nextStep: 'planExecution',
    };
}

/**
 * Plans the execution by breaking down the task into subtasks
 */
export async function planExecution(state: AgentStateType, runtimeConfig?: any): Promise<Partial<AgentStateType>> {
    logger.log(componentName, 'Creating execution plan...');
    
    try {
        // Try to get toolsProvider from config
        const toolsProvider = runtimeConfig?.configurable?.input?.toolsProvider;
        
        // Log access to toolsProvider
        if (toolsProvider) {
            logger.log(componentName, 'ToolsProvider available from config');
        } else {
            logger.log(componentName, 'ToolsProvider not found in config');
        }
        
        // Check if task is valid
        if (!state.task || !state.task.query) {
            logger.log(componentName, 'Error: Task is missing or invalid');
            return {
                error: 'Task is missing or invalid',
                nextStep: END
            };
        }
        
        // Use the imported config module
        const apiKey = config.getApiKey();
        
        if (!apiKey) {
            return {
                error: 'No API key found',
                nextStep: END
            };
        }
        
        // Create planning prompt
        const systemPrompt = `You are an AI orchestrator responsible for breaking down complex coding tasks into subtasks.
Your job is to analyze a user's request and create a structured plan to fulfill it by dividing it into smaller, manageable subtasks.

IMPORTANT: You MUST respond with valid JSON ONLY in the exact format specified below. Do not include any explanatory text, markdown formatting, or additional content.

JSON Response Format:
{
  "plan": "Brief summary of overall approach",
  "subTasks": [
    {
      "id": "subtask1",
      "type": "analysis", 
      "description": "Short description of subtask",
      "task": "Detailed instructions for completing this subtask",
      "dependsOn": []
    },
    {
      "id": "subtask2",
      "type": "generation",
      "description": "Another subtask description",
      "task": "Detailed instructions",
      "dependsOn": ["subtask1"]
    }
  ]
}

The available subtask types are:
- analysis: For understanding code, finding patterns, or identifying issues
- generation: For writing or modifying code files
- test: For validating that code works as expected

Think step-by-step about the logical order of operations needed. Some tasks may depend on the results of others.`;

        const userPrompt = `Task: ${state.task.query}
${state.task.context ? `\nContext:\n${state.task.context}` : ''}

Create a detailed execution plan for this task, breaking it down into appropriate subtasks.

IMPORTANT: Respond with ONLY the requested JSON object, with no additional text, explanation, or formatting.`;

        // Call LLM to create plan
        const response = await fetch(config.OPENAI_API_ENDPOINT, 
            getOpenAIRequestOptions([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ], 
            config.getModel(), 
            apiKey)
        );
        
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
        logger.log(componentName, `Received response from LLM: ${content.substring(0, 100)}...`);
        
        // More robust JSON parsing
        try {
            // First try direct JSON parsing of the whole content
            try {
                const parsedJson = JSON.parse(content);
                if (parsedJson && parsedJson.subTasks && Array.isArray(parsedJson.subTasks)) {
                    logger.log(componentName, `Successfully parsed JSON plan with ${parsedJson.subTasks.length} subtasks`);
                    return {
                        plan: parsedJson.plan || "No plan summary provided",
                        subtasks: parsedJson.subTasks,
                        nextStep: 'selectNextSubtask'
                    };
                }
            } catch (directJsonError) {
                // Direct parsing failed, continue to other methods
                logger.log(componentName, `Direct JSON parsing failed: ${directJsonError}`);
            }
            
            // Try to extract JSON from markdown code blocks (```json ... ```)
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsedJson = JSON.parse(jsonMatch[1]);
                    if (parsedJson && parsedJson.subTasks && Array.isArray(parsedJson.subTasks)) {
                        logger.log(componentName, `Successfully parsed JSON from code block with ${parsedJson.subTasks.length} subtasks`);
                        return {
                            plan: parsedJson.plan || "No plan summary provided",
                            subtasks: parsedJson.subTasks,
                            nextStep: 'selectNextSubtask'
                        };
                    }
                } catch (codeBlockJsonError) {
                    logger.log(componentName, `Code block JSON parsing failed: ${codeBlockJsonError}`);
                }
            }
            
            // Try to extract the first JSON-like structure in the response
            const potentialJson = content.match(/{[\s\S]*?}/);
            if (potentialJson && potentialJson[0]) {
                try {
                    const parsedJson = JSON.parse(potentialJson[0]);
                    if (parsedJson && parsedJson.subTasks && Array.isArray(parsedJson.subTasks)) {
                        logger.log(componentName, `Successfully parsed JSON from extracted structure with ${parsedJson.subTasks.length} subtasks`);
                        return {
                            plan: parsedJson.plan || "No plan summary provided",
                            subtasks: parsedJson.subTasks,
                            nextStep: 'selectNextSubtask'
                        };
                    }
                } catch (extractedJsonError) {
                    logger.log(componentName, `Extracted JSON parsing failed: ${extractedJsonError}`);
                }
            }
            
            // If we get here, we couldn't find valid JSON in any expected format
            // Log the raw content for debugging
            logger.log(componentName, `Failed to parse JSON from response. Raw content: ${content.substring(0, 200)}...`);
            
            // As a last resort, try to manually create a plan from text content
            return {
                error: "Could not parse a valid JSON plan from the LLM response. Try running the query again.",
                nextStep: END
            };
        } catch (jsonError: any) {
            logger.log(componentName, `JSON parsing error: ${jsonError}`);
            throw new Error(`Could not parse JSON: ${jsonError.message}`);
        }
    } catch (error) {
        logger.log(componentName, `Error planning execution: ${error}`);
        return {
            error: `Error planning execution: ${error}`,
            nextStep: END
        };
    }
}

/**
 * Selects the next subtask to execute based on dependencies
 */
export function selectNextSubtask(state: AgentStateType): Partial<AgentStateType> {
    logger.log(componentName, 'Selecting next subtask...');
    
    if (!state.subtasks || state.subtasks.length === 0) {
        return {
            nextStep: 'synthesizeResults'
        };
    }
    
    // Find subtasks that have not yet been executed
    const pendingSubtasks = state.subtasks.filter(task => !state.results[task.id]);
    
    if (pendingSubtasks.length === 0) {
        return {
            nextStep: 'synthesizeResults'
        };
    }
    
    // Find subtasks where all dependencies have been completed
    const eligibleSubtasks = pendingSubtasks.filter(task => {
        if (!task.dependsOn || task.dependsOn.length === 0) {
            return true;
        }
        
        return task.dependsOn.every(depId => state.results[depId]);
    });
    
    if (eligibleSubtasks.length === 0) {
        return {
            error: 'No eligible subtasks to execute. There may be a dependency cycle.',
            nextStep: 'synthesizeResults'
        };
    }
    
    // Select the first eligible subtask
    const selectedSubtask = eligibleSubtasks[0];
    
    // Create context from completed dependent tasks
    let context = '';
    if (selectedSubtask.dependsOn) {
        for (const depId of selectedSubtask.dependsOn) {
            const dependencyResult = state.results[depId];
            if (dependencyResult?.success && dependencyResult.result) {
                context += `Result from ${depId}:\n${dependencyResult.result}\n\n`;
            }
        }
    }
    
    // Add original task context if available
    if (selectedSubtask.context) {
        context += selectedSubtask.context;
    }
    
    // Update the subtask with the context
    const updatedSubtask = {
        ...selectedSubtask,
        context: context || undefined
    };
    
    logger.log(componentName, `Selected subtask ${updatedSubtask.id}: ${updatedSubtask.description}`);
    
    return {
        currentSubtask: updatedSubtask,
        nextStep: getNodeForSubtaskType(updatedSubtask.type)
    };
}

/**
 * Maps subtask type to the appropriate node
 */
function getNodeForSubtaskType(type: string): string {
    switch (type) {
        case 'analysis':
            return 'executeAnalysisTask';
        case 'generation':
            return 'executeGenerationTask';
        case 'test':
            return 'executeTestTask';
        default:
            return 'executeAnalysisTask';
    }
}

/**
 * Executes an analysis subtask
 */
export async function executeAnalysisTask(state: AgentStateType): Promise<Partial<AgentStateType>> {
    if (!state.currentSubtask) {
        return {
            error: 'No current subtask to execute',
            nextStep: 'selectNextSubtask'
        };
    }
    
    logger.log(componentName, `Executing analysis subtask ${state.currentSubtask.id}: ${state.currentSubtask.description}`);
    
    // Get system prompt for code analysis
    const systemPrompt = `You are a specialized code analysis AI with deep expertise in software architecture and programming languages.
Your task is to analyze code files and provide detailed insights about:

1. The purpose and functionality of the code
2. Key architectural patterns or design choices
3. Potential issues, bugs, or areas for improvement
4. Dependencies and relationships with other parts of the codebase

When analyzing a codebase, follow these steps:
1. Identify key files and directories to understand the overall structure
2. Examine important files to understand core functionality
3. Look for patterns and relationships between different components
4. Identify potential issues or improvement areas

Always provide concrete, specific observations based on the actual code. 
Be precise and technical in your analysis.`;
    
    const result = await executeToolBasedTask(state.currentSubtask, systemPrompt);
    
    return {
        results: { [state.currentSubtask.id]: result },
        nextStep: 'selectNextSubtask'
    };
}

/**
 * Executes a code generation subtask
 */
export async function executeGenerationTask(state: AgentStateType): Promise<Partial<AgentStateType>> {
    if (!state.currentSubtask) {
        return {
            error: 'No current subtask to execute',
            nextStep: 'selectNextSubtask'
        };
    }
    
    logger.log(componentName, `Executing generation subtask ${state.currentSubtask.id}: ${state.currentSubtask.description}`);
    
    // Get system prompt for code generation
    const systemPrompt = `You are a specialized code generation AI with expertise in software development.
Your task is to write high-quality, well-structured code based on requirements.

You should:
1. Generate code that is clear, efficient, and follows best practices
2. Include appropriate error handling and edge cases
3. Follow language-specific conventions and patterns
4. Write code that integrates well with the existing codebase
5. Include comments to explain complex or non-obvious parts

When asked to modify existing code:
1. First read and understand the current implementation
2. Make focused changes that preserve the original intent and style
3. Ensure your changes integrate well with the surrounding code
4. Maintain or improve error handling and edge case coverage

Always write production-quality code that is:
- Readable and maintainable
- Follows consistent style
- Well-organized and structured
- Properly handles errors and edge cases
- Documented appropriately`;
    
    const result = await executeToolBasedTask(state.currentSubtask, systemPrompt);
    
    return {
        results: { [state.currentSubtask.id]: result },
        nextStep: 'selectNextSubtask'
    };
}

/**
 * Executes a test subtask
 */
export async function executeTestTask(state: AgentStateType): Promise<Partial<AgentStateType>> {
    if (!state.currentSubtask) {
        return {
            error: 'No current subtask to execute',
            nextStep: 'selectNextSubtask'
        };
    }
    
    logger.log(componentName, `Executing test subtask ${state.currentSubtask.id}: ${state.currentSubtask.description}`);
    
    // Get system prompt for code testing
    const systemPrompt = `You are a specialized test engineer AI with expertise in software testing and quality assurance.
Your task is to validate code works as expected and identify potential issues.

You should:
1. Create thorough test cases that cover both normal and edge cases
2. Verify the functionality meets the requirements
3. Identify potential bugs or areas of improvement
4. Ensure proper error handling and input validation

When testing code:
1. First understand the expected behavior and requirements
2. Design test cases that cover all important scenarios
3. Execute the tests and analyze the results
4. Report any issues found in clear, actionable language

Always provide detailed, specific observations about what you tested and what you found.`;
    
    const result = await executeToolBasedTask(state.currentSubtask, systemPrompt);
    
    return {
        results: { [state.currentSubtask.id]: result },
        nextStep: 'selectNextSubtask'
    };
}

/**
 * Common function to execute a tool-based task
 */
async function executeToolBasedTask(subtask: AgentStateType['currentSubtask'], systemPrompt: string): Promise<WorkerResponse> {
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
        
        // Create a ChatOpenAI model instance
        const model = new ChatOpenAI({
            modelName: config.getModel(),
            openAIApiKey: apiKey,
            maxTokens: config.MAX_TOKENS
        });
        
        // Get tools for the model from our existing tools
        const tools = createLangGraphTools({
            getTools: () => [],  // Not used in this context
            getTool: (name: string) => {
                // This would be replaced with a real getTool implementation
                // that accesses the real tools provider
                // This is a simplified placeholder
                return undefined;
            }
        });
        
        // This would be replaced with a full agent implementation using LangGraph
        // For now, we're just making a simple LLM call
        
        // Initialize messages
        const messages: WorkerMessage[] = [
            { role: 'system', content: systemPrompt }
        ];
        
        if (subtask.context) {
            messages.push({ role: 'user', content: subtask.context });
        }
        
        messages.push({ role: 'user', content: subtask.task });
        
        logger.log(componentName, `Calling LLM for subtask: ${subtask.id}`);
        
        // Call the LLM directly for now
        const response = await fetch(config.OPENAI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: config.getModel(),
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
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
        
        const result = data.choices[0].message.content;
        
        logger.log(componentName, `Subtask ${subtask.id} completed - response length: ${result.length} characters`);
        logger.log(componentName, `Response preview: ${result.substring(0, 100)}...`);
        
        return {
            success: true,
            result: result
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

/**
 * Synthesizes the results of all subtasks
 */
export async function synthesizeResults(state: AgentStateType): Promise<Partial<AgentStateType>> {
    logger.log(componentName, 'Synthesizing results...');
    
    try {
        const apiKey = config.getApiKey();
        
        if (!apiKey) {
            return {
                error: 'No API key found',
                finalResult: 'Could not synthesize results: No API key found',
                nextStep: END
            };
        }
        
        // Collect the results from completed subtasks
        const completedTasks = Object.entries(state.results)
            .filter(([_, result]) => result.success && result.result)
            .map(([id, result]) => {
                const subtask = state.subtasks?.find(task => task.id === id);
                return {
                    id,
                    description: subtask?.description || id,
                    result: result.result
                };
            });
        
        if (completedTasks.length === 0) {
            return {
                finalResult: 'No completed subtasks to synthesize.',
                nextStep: END
            };
        }
        
        // Create synthesis prompt
        const systemPrompt = `You are an AI synthesizer responsible for combining the results of multiple subtasks into a coherent response.
Your job is to analyze the results of various coding tasks and create a comprehensive answer that addresses the user's original query.

Your response should:
1. Directly address the user's original question
2. Synthesize information from all completed subtasks
3. Explain what changes were made to the codebase, if any
4. Provide a clear summary of findings or solutions
5. Use technical, concise language appropriate for developers

Make your response well-structured and easy to follow.`;

        let userPrompt = `Original query: ${state.task.query}\n\nResults from subtasks:\n\n`;
        
        for (const task of completedTasks) {
            userPrompt += `## ${task.description}\n\n${task.result}\n\n---\n\n`;
        }
        
        userPrompt += 'Please synthesize these results into a comprehensive response that addresses the original query.';
        
        // Call LLM to synthesize results
        const response = await fetch(config.OPENAI_API_ENDPOINT, 
            getOpenAIRequestOptions([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            config.getModel(),
            apiKey)
        );
        
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
        
        const finalResult = data.choices[0].message.content;
        
        // Add detailed logging of the response
        logger.log(componentName, `Final response generated - length: ${finalResult.length} characters`);
        logger.log(componentName, `Response preview: ${finalResult.substring(0, 200)}...`);
        
        if (finalResult.trim() === '') {
            logger.log(componentName, 'WARNING: Empty response received from LLM');
            return {
                error: 'Empty response received from LLM',
                finalResult: 'The AI assistant generated an empty response. Please try your query again.',
                nextStep: END
            };
        }
        
        return {
            finalResult: finalResult,
            nextStep: END
        };
    } catch (error) {
        logger.log(componentName, `Error synthesizing results: ${error}`);
        return {
            error: `Error synthesizing results: ${error}`,
            finalResult: `Failed to synthesize results: ${error}`,
            nextStep: END
        };
    }
} 