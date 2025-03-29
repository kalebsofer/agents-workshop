/**
 * tools.ts
 * 
 * Integrates the existing tools with LangGraph.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { 
    ToolsProvider, 
    ReadFileTool, 
    WriteFileTool, 
    ListFilesTool, 
    SearchCodeTool, 
    RunCommandTool 
} from "../types/agent";

/**
 * Create LangGraph compatible tools from our existing tools
 */
export function createLangGraphTools(toolsProvider: ToolsProvider) {
    return {
        readFile: tool(
            async ({ filePath }) => {
                const readFileTool = toolsProvider.getTool('readFile') as ReadFileTool;
                if (!readFileTool) {
                    throw new Error('readFile tool not found');
                }
                
                const result = await readFileTool.execute(filePath);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to read file');
                }
                
                return JSON.stringify(result.data);
            },
            {
                name: "readFile",
                description: "Read the contents of a file in the workspace",
                schema: z.object({
                    filePath: z.string().describe("Path to the file to read")
                })
            }
        ),
        
        writeFile: tool(
            async ({ filePath, content }) => {
                const writeFileTool = toolsProvider.getTool('writeFile') as WriteFileTool;
                if (!writeFileTool) {
                    throw new Error('writeFile tool not found');
                }
                
                const result = await writeFileTool.execute(filePath, content);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to write file');
                }
                
                return JSON.stringify(result.data);
            },
            {
                name: "writeFile",
                description: "Write content to a file in the workspace (creates the file if it doesn't exist)",
                schema: z.object({
                    filePath: z.string().describe("Path to the file to write"),
                    content: z.string().describe("Content to write to the file")
                })
            }
        ),
        
        listFiles: tool(
            async ({ directoryPath }) => {
                const listFilesTool = toolsProvider.getTool('listFiles') as ListFilesTool;
                if (!listFilesTool) {
                    throw new Error('listFiles tool not found');
                }
                
                const result = await listFilesTool.execute(directoryPath);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to list files');
                }
                
                return JSON.stringify(result.data);
            },
            {
                name: "listFiles",
                description: "List files in a directory",
                schema: z.object({
                    directoryPath: z.string().describe("Path to the directory to list")
                })
            }
        ),
        
        searchCode: tool(
            async ({ query, filePattern }) => {
                const searchCodeTool = toolsProvider.getTool('searchCode') as SearchCodeTool;
                if (!searchCodeTool) {
                    throw new Error('searchCode tool not found');
                }
                
                const result = await searchCodeTool.execute(query, filePattern);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to search code');
                }
                
                return JSON.stringify(result.data);
            },
            {
                name: "searchCode",
                description: "Search for code in the workspace using a query",
                schema: z.object({
                    query: z.string().describe("Search query to find in code"),
                    filePattern: z.string().optional().describe("Optional glob pattern to filter files (e.g., \"**/*.ts\" for TypeScript files)")
                })
            }
        ),
        
        runCommand: tool(
            async ({ command }) => {
                const runCommandTool = toolsProvider.getTool('runCommand') as RunCommandTool;
                if (!runCommandTool) {
                    throw new Error('runCommand tool not found');
                }
                
                const result = await runCommandTool.execute(command);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to run command');
                }
                
                return JSON.stringify(result.data);
            },
            {
                name: "runCommand",
                description: "Run a command in the terminal (use with caution)",
                schema: z.object({
                    command: z.string().describe("Command to execute")
                })
            }
        )
    };
} 