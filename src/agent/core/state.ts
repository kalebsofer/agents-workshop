/**
 * state.ts
 * 
 * Defines the state model for the LangGraph agent workflow.
 */

import { Annotation } from "@langchain/langgraph";
import { Task, SubTask, WorkerMessage, WorkerResponse } from "../../types/agent";

export const AgentState = Annotation.Root({
    // The original task from the user
    task: Annotation<Task>({
        reducer: (prev, next) => next ?? prev,
    }),
    
    // The execution plan with subtasks
    plan: Annotation<string>({
        reducer: (prev, next) => next ?? prev,
    }),
    
    // List of subtasks to be executed
    subtasks: Annotation<SubTask[]>({
        reducer: (prev, next) => next ?? prev,
    }),
    
    // Current subtask being processed
    currentSubtask: Annotation<SubTask | null>({
        reducer: (prev, next) => next ?? prev,
    }),
    
    // Messages for the current LLM conversation
    messages: Annotation<WorkerMessage[]>({
        reducer: (prev, next) => next ?? prev,
    }),
    
    // Results from completed subtasks
    results: Annotation<Record<string, WorkerResponse>>({
        reducer: (prev, next) => ({ ...prev, ...next }),
    }),
    
    // Final synthesized result
    finalResult: Annotation<string>({
        reducer: (prev, next) => next ?? prev,
    }),
    
    // Routing decision for the next step
    nextStep: Annotation<string>({
        reducer: (prev, next) => next ?? prev,
    }),
    
    // Error information
    error: Annotation<string | null>({
        reducer: (prev, next) => next ?? prev,
    }),
});

export type AgentStateType = typeof AgentState.State; 