# AI Agent Workshop

A VS Code extension that provides an AI-powered coding assistant using OpenAI API.

## Features

- AI Chat Interface within VS Code
- Context-Aware Responses with file attachments
- Split View Integration
- Secure API key management
- Interactive AI Assistant panel
- Context-aware code assistance
- File attachment for better context
- Persistent conversation memory
- Agent Mode for code editing and workspace manipulation

## Setup

1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run compile
   ```

3. Run the extension:
   - Press F5 in VS Code to start debugging
   - Or run the extension directly with:
     ```bash
     code --extensionDevelopmentPath=/path/to/this/folder
     ```

## Configuration

Set the following in VS Code settings:

* `agent-workshop.openaiApiKey`: Your OpenAI API key
* `agent-workshop.openaiModel`: Model to use (default: 'gpt-o3-mini')

The API key can also be set via environment variable:
- `OPENAI_API_KEY`

Or in a `.env` file at the root of your project:
```
OPENAI_API_KEY=your_api_key_here
```

## Usage

1. Open the AI Assistant panel:
   - Click the AI icon in the activity bar, or
   - Use the command palette (`Ctrl+Shift+P`) and search for "Open AI Assistant Panel"

2. Ask questions and add file context as needed

## Extension Settings

This extension contributes the following settings:

* `agent-workshop.openaiApiKey`: API key for OpenAI
* `agent-workshop.openaiModel`: OpenAI model to use (default: 'gpt-o3-mini')

## Agent Mode

The AI Assistant now includes an Agent Mode that allows the AI to directly edit your code and manipulate your workspace. When Agent Mode is enabled, the AI can:

- Analyze your codebase
- Generate new code files
- Modify existing code
- Run terminal commands (with your approval)
- Perform complex multi-step coding tasks

Agent Mode works by breaking down complex tasks into smaller, manageable subtasks. It uses an orchestrator-workers pattern:

1. The orchestrator analyzes your request and plans the execution
2. Specialized workers handle different aspects of the task (code analysis, generation, etc.)
3. Results are synthesized into a coherent solution

To use Agent Mode:

1. Toggle the Agent Mode switch in the AI Assistant panel
2. Ask the AI to perform a coding task
3. The AI will analyze the task and create a plan
4. You'll see progress updates as the AI works
5. The AI will ask for confirmation before making changes to your workspace

## Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run compile
   ```
4. Press F5 to start debugging
