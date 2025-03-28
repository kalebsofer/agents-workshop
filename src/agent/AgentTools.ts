/**
 * AgentTools.ts
 * 
 * Defines the tools that agent workers can use to perform tasks.
 */

export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

export interface Tool {
    name: string;
    description: string;
    execute: (...args: any[]) => Promise<ToolResult>;
}

export interface ReadFileTool extends Tool {
    name: 'readFile';
    execute: (filePath: string) => Promise<ToolResult>;
}

export interface WriteFileTool extends Tool {
    name: 'writeFile';
    execute: (filePath: string, content: string) => Promise<ToolResult>;
}

export interface ListFilesTool extends Tool {
    name: 'listFiles';
    execute: (directoryPath: string) => Promise<ToolResult>;
}

export interface SearchCodeTool extends Tool {
    name: 'searchCode';
    execute: (query: string, filePattern?: string) => Promise<ToolResult>;
}

export interface RunCommandTool extends Tool {
    name: 'runCommand';
    execute: (command: string) => Promise<ToolResult>;
}

export type AgentTool = ReadFileTool | WriteFileTool | ListFilesTool | SearchCodeTool | RunCommandTool;

export interface ToolsProvider {
    getTools(): AgentTool[];
    getTool(name: string): AgentTool | undefined;
} 