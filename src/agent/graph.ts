/**
 * graph.ts
 * 
 * Defines the agent graph structure using LangGraph.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./state";
import * as nodes from "./nodes";
import { Logger } from "./Logger";

/**
 * Create the agent graph
 */
export function createAgentGraph() {
    const logger = Logger.getInstance();
    const componentName = 'AgentGraph';

    // Create the graph builder
    const builder = new StateGraph(AgentState)
        .addNode("planExecution", nodes.planExecution)
        .addNode("selectNextSubtask", nodes.selectNextSubtask)
        .addNode("executeAnalysisTask", nodes.executeAnalysisTask)
        .addNode("executeGenerationTask", nodes.executeGenerationTask)
        .addNode("executeTestTask", nodes.executeTestTask)
        .addNode("synthesizeResults", nodes.synthesizeResults);
    
    // Define the conditional routing function
    function routeNextStep(state: AgentStateType): string {
        return state.nextStep;
    }
    
    // Add edges
    builder
        .addEdge(START, "planExecution")
        .addConditionalEdges(
            "planExecution",
            routeNextStep,
            [
                "selectNextSubtask",
                END
            ]
        )
        .addConditionalEdges(
            "selectNextSubtask",
            routeNextStep,
            [
                "executeAnalysisTask",
                "executeGenerationTask",
                "executeTestTask",
                "synthesizeResults"
            ]
        )
        .addConditionalEdges(
            "executeAnalysisTask",
            routeNextStep,
            [
                "selectNextSubtask"
            ]
        )
        .addConditionalEdges(
            "executeGenerationTask",
            routeNextStep,
            [
                "selectNextSubtask"
            ]
        )
        .addConditionalEdges(
            "executeTestTask",
            routeNextStep,
            [
                "selectNextSubtask"
            ]
        )
        .addConditionalEdges(
            "synthesizeResults",
            routeNextStep,
            [
                END
            ]
        );
    
    // Compile the graph
    return builder.compile();
} 