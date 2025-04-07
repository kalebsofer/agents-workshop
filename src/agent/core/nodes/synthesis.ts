/**
 * Synthesis node for the LangGraph agent workflow.
 * Handles combining results from different processing stages.
 */

import * as config from '../../../config';
import { AgentStateType } from '../state';
import { Logger } from '../../utils/Logger';
import { END } from '@langchain/langgraph';
import { ChatOpenAI } from "@langchain/openai";
import { SYNTHESIS_PROMPT } from '../../prompts';

// Logger instance
const logger = Logger.getInstance();
const componentName = 'Agent Synthesis';

/**
 * Synthesizes the results of analysis, generation, and test tasks into a final response
 */
export async function synthesizeResults(state: AgentStateType, runtimeConfig?: any): Promise<Partial<AgentStateType>> {
    logger.log(componentName, 'Synthesizing results...');
    
    try {
        const apiKey = config.getApiKey();
        
        if (!apiKey) {
            return {
                error: 'No API key found',
                finalResult: 'Could not synthesize results: API key missing',
                nextStep: END
            };
        }
        
        // Get workspaceManager from config
        const workspaceManager = runtimeConfig?.configurable?.input?.workspaceManager;
        
        // Gather all results
        const allResults: string[] = [];
        let hasResults = false;
        
        // Check if we have analysis results
        if (state.results.analysis && state.results.analysis.success) {
            allResults.push(`## Analysis Results\n\n${state.results.analysis.result}\n`);
            hasResults = true;
        }
        
        // Check if we have generation results
        if (state.results.generation && state.results.generation.success) {
            allResults.push(`## Generation Results\n\n${state.results.generation.result}\n`);
            hasResults = true;
        }
        
        // Check if we have test results
        if (state.results.test && state.results.test.success) {
            allResults.push(`## Testing Results\n\n${state.results.test.result}\n`);
            hasResults = true;
        }
        
        if (!hasResults) {
            return {
                finalResult: 'No results available to synthesize.',
                nextStep: END
            };
        }
        
        // If there's only one result, use it directly
        if (allResults.length === 1) {
            return {
                finalResult: allResults[0].replace(/^## .*?\n\n/, ''), // Remove the heading
                nextStep: END
            };
        }
        
        const combinedResults = allResults.join('\n---\n\n');
        const userPrompt = `Original request: ${state.task?.query}\n\nTask results to synthesize:\n\n${combinedResults}\n\nPlease synthesize these results into a unified response.`;
        
        // Create the model
        const model = new ChatOpenAI({
            modelName: config.getModel(),
            openAIApiKey: apiKey,
            maxTokens: config.MAX_TOKENS
        });
        
        // Call LLM to synthesize results
        logger.log(componentName, 'Calling LLM to synthesize results');
        const response = await model.invoke([
            { role: 'system', content: SYNTHESIS_PROMPT },
            { role: 'user', content: userPrompt }
        ]);
        
        // Extract content from response
        const content = typeof response.content === 'string' 
            ? response.content 
            : JSON.stringify(response.content);
            
        if (!content) {
            throw new Error('Empty response from LLM API');
        }
        
        logger.log(componentName, `Synthesis complete (${content.length} chars)`);
        
        return {
            finalResult: content,
            nextStep: END
        };
    } catch (error) {
        logger.log(componentName, `Error synthesizing results: ${error}`);
        return {
            error: `Error synthesizing results: ${error}`,
            finalResult: `Failed to synthesize results due to error: ${error}`,
            nextStep: END
        };
    }
}
