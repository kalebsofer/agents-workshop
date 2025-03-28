# AI Assistant Expansion Plan: Adding Agentic Features

## Feature 1: Persistent Context ✅

### Overview
Implement chat memory to maintain context between interactions, enabling more coherent and continuous chats with the AI.

### Technical Implementation

1. **Message Storage** ✅
   - Create a `chatManager` class to store chat history
   - Store messages as an array of `{role, content}` objects
   - Implement session persistence (in-memory during runtime)

2. **API Integration Updates** ✅
   - Modify the OpenAI request format to include the full chat history
   - Update the `_callOpenAI` method to send all relevant messages with each request
   - Add appropriate context window management (token counting/truncating) (20000 tokens)

3. **UI Enhancements** ✅
   - Update the webview to display the full chat history
   - Add visual differentiation between user and assistant messages
   - Add chat controls (clear, export, etc.)

4. **Performance Considerations** ✅
   - Implement context window management to prevent token limits
   - Create summarization functions for long chats
   - Add context pruning algorithms for extended chats


## Feature 2: Agent Mode ✅

### Overview
Enable the AI assistant to edit code in the user's workspace by interpreting user requests, generating code changes, and applying them after user approval.

### Architecture: Orchestrator-Workers Pattern ✅

We will implement an orchestrator-workers architecture where:

1. **Orchestrator LLM** ✅
   - Acts as the central coordinator
   - Analyzes the user's request and current workspace context
   - Dynamically determines what subtasks are needed
   - Delegates specialized work to worker LLMs
   - Synthesizes results into a coherent plan

2. **Worker LLMs** ✅
   - Specialized for specific subtasks
   - Can include:
     - Code reading workers (analyze existing code)
     - Code writing workers (generate new code)
     - Testing workers (predict potential issues)
     - Documentation workers (update docs for changes)

3. **Synthesizer** ✅
   - Combines outputs from all workers
   - Resolves conflicts between worker suggestions
   - Presents unified solution to the user

This architecture is optimal for complex coding tasks where the required file changes and modifications cannot be predicted in advance. The orchestrator can dynamically determine which files need attention and coordinate workers to handle each part of the solution.

### Technical Implementation

1. **Workspace Access** ✅
   - Create a `WorkspaceManager` class to handle file operations
   - Implement methods for reading, writing, and modifying files
   - Add safeguards and confirmation steps for file modifications

2. **Agent Framework** ✅
   - Develop an `AgentExecutor` to orchestrate the LLM calls
   - Implement the `Orchestrator` class to coordinate worker LLMs
   - Create worker classes for different specialized tasks
   - Implement a `Synthesizer` to combine worker outputs
   - Create a set of tools/functions the agent can use (file operations, terminal commands)
   - Implement a planning system for multi-step operations

3. **UI for Agent Interactions** ⬜
   - Add an "Agent Mode" toggle in the UI
   - Create a diff view for proposed changes
   - Implement confirmation dialogs for file operations
   - Add progress indicators for ongoing agent operations
   - Add visualization of the orchestration process (optional)

4. **Prompt Engineering** ✅
   - Design specialized system prompts for the orchestrator LLM
   - Create distinct prompts for each worker type
   - Create function calling format for LLMs to request specific actions
   - Add tool descriptions and examples in the system prompts

5. **Security & Safety** ✅
   - Implement workspace isolation (only modify permitted directories)
   - Add request validation and rate limiting
   - Create undo functionality for agent-made changes
   - Create logs of all operations performed by the agent


## Technical Debt Considerations

- Current message handling will need significant refactoring
- Token limits may require implementing compression techniques
- Need to develop clear error handling for failed agent operations
- Consider adding telemetry for feature usage and error tracking

## Next Steps

1. **UI Implementation** ⬜
   - Integrate the agent framework with the main UI
   - Add controls for enabling agent mode
   - Create visualization for agent progress and results

2. **Testing and Refinement** ⬜
   - Implement comprehensive testing for the agent framework
   - Gather user feedback on agent performance
   - Refine the orchestrator-workers interaction based on feedback
