/**
 * Defines the agent graph structure using LangGraph.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./state";
import { planExecution, executeAnalysisTask, executeGenerationTask, executeTestTask, synthesizeResults } from "./nodes/index";
import { Logger } from "../utils/Logger";
import { TaskType } from '../../types/agent';


export function createAgentGraph() {

    const builder = new StateGraph(AgentState)
        .addNode("planExecution", planExecution)
        .addNode("executeAnalysisTask", executeAnalysisTask)
        .addNode("executeGenerationTask", executeGenerationTask)
        .addNode("executeTestTask", executeTestTask)
        .addNode("synthesizeResults", synthesizeResults);
    
    // Define the conditional routing function from orchestrator
    function routeFromOrchestrator(state: AgentStateType): string {
        // Check if this is an irrelevant question first
        if (state.nextStep === 'handleIrrelevantQuery') {
            return END;
        }
        
        // Route based on task type determined by planExecution
        const taskType = state.nextStep as TaskType;
        
        // Map the task routes
        switch (taskType) {
            case 'executeAnalysisTask':
                return 'executeAnalysisTask';
            case 'executeGenerationTask':
                return 'executeGenerationTask';
            case 'executeAnalysisWithGeneration':
                // For mixed tasks, always start with analysis
                return 'executeAnalysisTask';
            default:
                // For unrecognized or irrelevant queries
                return END;
        }
    }
    
    function routeFromAnalysis(state: AgentStateType): string {
        // If analysis should be followed by generation (A -> G -> T flow)
        if (state.nextStep === 'executeGenerationTask') {
            return 'executeGenerationTask';
        }
        // Otherwise, go to synthesize results
        return 'synthesizeResults';
    }
    
    // Edges
    builder
        .addEdge(START, "planExecution")
        .addConditionalEdges(
            "planExecution",
            routeFromOrchestrator,
            [
                "executeAnalysisTask",
                "executeGenerationTask",
                END
            ]
        )
        .addConditionalEdges(
            "executeAnalysisTask",
            routeFromAnalysis,
            [
                "executeGenerationTask",
                "synthesizeResults"
            ]
        )
        // We always go to test after generation
        .addEdge("executeGenerationTask", "executeTestTask")
        // We always go to synthesize after test
        .addEdge("executeTestTask", "synthesizeResults")
        // We always end after synthesize
        .addEdge("synthesizeResults", END);
    
    return builder.compile();
} 