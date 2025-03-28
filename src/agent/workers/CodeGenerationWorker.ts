/**
 * CodeGenerationWorker.ts
 * 
 * A specialized worker for generating and modifying code.
 */

import { AgentWorker } from '../AgentWorker';
import { AgentTool, ToolsProvider } from '../AgentTools';

export class CodeGenerationWorker extends AgentWorker {
    constructor(toolsProvider: ToolsProvider) {
        super('CodeGeneration', toolsProvider);
    }
    
    protected getDefaultSystemPrompt(): string {
        return `You are a specialized code generation AI with expertise in software development.
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

You have access to tools that allow you to read files, write files, and search for code patterns.
Use these tools systematically to understand the codebase and make appropriate changes.

Always write production-quality code that is:
- Readable and maintainable
- Follows consistent style
- Well-organized and structured
- Properly handles errors and edge cases
- Documented appropriately`;
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
            case 'writeFile':
                return {
                    type: 'object',
                    required: ['filePath', 'content'],
                    properties: {
                        filePath: {
                            type: 'string',
                            description: 'Path to the file to write'
                        },
                        content: {
                            type: 'string',
                            description: 'Content to write to the file'
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