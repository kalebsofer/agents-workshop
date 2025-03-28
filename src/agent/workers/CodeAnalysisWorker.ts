/**
 * CodeAnalysisWorker.ts
 * 
 * A specialized worker for analyzing code in the workspace.
 */

import { AgentWorker } from '../AgentWorker';
import { AgentTool, ToolsProvider } from '../AgentTools';

export class CodeAnalysisWorker extends AgentWorker {
    constructor(toolsProvider: ToolsProvider) {
        super('CodeAnalysis', toolsProvider);
    }
    
    protected getDefaultSystemPrompt(): string {
        return `You are a specialized code analysis AI with deep expertise in software architecture and programming languages.
Your task is to analyze code files and provide detailed insights about:

1. The purpose and functionality of the code
2. Key architectural patterns or design choices
3. Potential issues, bugs, or areas for improvement
4. Dependencies and relationships with other parts of the codebase

You have access to tools that allow you to read files, list directories, and search for code patterns.
Use these tools systematically to build a comprehensive understanding of the code you're analyzing.

When analyzing a codebase, follow these steps:
1. Identify key files and directories to understand the overall structure
2. Examine important files to understand core functionality
3. Look for patterns and relationships between different components
4. Identify potential issues or improvement areas

Always provide concrete, specific observations based on the actual code. 
Be precise and technical in your analysis.`;
    }
    
    protected getToolParametersSchema(tool: AgentTool): Record<string, any> {
        switch (tool.name) {
            case 'readFile':
                return {
                    type: 'object',
                    required: ['filePath'],
                    properties: {
                        filePath: {
                            type: 'string',
                            description: 'Path to the file to read'
                        }
                    }
                };
            case 'listFiles':
                return {
                    type: 'object',
                    required: ['directoryPath'],
                    properties: {
                        directoryPath: {
                            type: 'string',
                            description: 'Path to the directory to list'
                        }
                    }
                };
            case 'searchCode':
                return {
                    type: 'object',
                    required: ['query'],
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query to find in code'
                        },
                        filePattern: {
                            type: 'string',
                            description: 'Optional glob pattern to filter files (e.g., "**/*.ts" for TypeScript files)'
                        }
                    }
                };
            default:
                return {
                    type: 'object',
                    properties: {}
                };
        }
    }
} 