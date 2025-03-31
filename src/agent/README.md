# LangGraph Agent Architecture

### Key Components

1. **Agent** (`Agent.ts`)
   - Main entry point for the agent
   - Initializes all components
   - Manages execution lifecycle
   - Provides progress reporting

2. **WorkspaceManager** (`WorkspaceManager.ts`)
   - Manages workspace file operations
   - Provides safe access to read/write/modify files
   - Tracks file changes for potential undo operations
   - Requires user confirmation for file operations
   - Displays diffs between original and modified files

3. **ToolsImplementation** (`ToolsImplementation.ts`)
   - Implements tools that can be used by agent workers
   - Provides file operations, code search, and command execution
   - Wraps WorkspaceManager functionality for agent use

4. **Graph** (`graph.ts`)
   - Defines the workflow structure using LangGraph
   - Creates a directed graph of execution steps
   - Manages conditional routing between nodes

5. **Nodes** (`nodes.ts`)
   - Implements individual steps in the agent workflow
   - Handles task planning, subtask execution, and result synthesis
   - Contains the core LLM interaction logic

6. **State** (`state.ts`)
   - Defines the state model for the graph
   - Tracks task progress, subtasks, and results
   - Manages data flow between nodes

7. **Tools** (`tools.ts`)
   - Bridges between ToolsImplementation and LangGraph tools interface
   - Provides tooling for LLM to interact with the workspace

## Execution Flow

1. User submits a task query through VS Code extension
2. LangGraphAgent initializes and passes the query to the graph
3. **planExecution** node breaks down task into subtasks
4. **selectNextSubtask** node chooses the next subtask to execute
5. Subtask is executed by appropriate node (analysis, generation, or test)
6. Results are collected and stored in state
7. Process repeats until all subtasks are complete
8. **synthesizeResults** node combines all results into a final response
9. Result is returned to the user

## State Management

The agent state includes:
- Original task details
- Execution plan
- List of subtasks
- Currently executing subtask
- Results from completed subtasks
- Error information
- Routing information for next steps



