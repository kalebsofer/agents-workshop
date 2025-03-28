/**
 * WorkspaceManager.ts
 * 
 * Manages workspace file operations for the agent.
 * Provides safe access to read, write, and modify files in the user's workspace.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';

export interface FileChange {
    filePath: string;
    originalContent?: string;
    newContent: string;
    operation: 'create' | 'modify' | 'delete';
}

export class WorkspaceManager {
    private readonly logger = Logger.getInstance();
    private readonly componentName = 'WorkspaceManager';
    private readonly workspaceRoot: string;
    private changeHistory: FileChange[] = [];

    constructor() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            this.logger.log(this.componentName, 'WARNING: No workspace folder found. Agent will have limited functionality.');
            // Set a default value so the class can still initialize, but log warnings when methods are called
            this.workspaceRoot = '';
        } else {
            this.workspaceRoot = folders[0].uri.fsPath;
            this.logger.log(this.componentName, `Workspace root set to: ${this.workspaceRoot}`);
        }
    }

    /**
     * Read a file from the workspace
     */
    public async readFile(filePath: string): Promise<string> {
        this.logger.log(this.componentName, `Reading file: ${filePath}`);
        
        if (!this.workspaceRoot) {
            this.logger.log(this.componentName, 'No workspace folder available. Cannot read files.');
            throw new Error('No workspace folder is open. Please open a folder to use this feature.');
        }
        
        try {
            const fullPath = this.resolveFilePath(filePath);
            const fileContent = await fs.promises.readFile(fullPath, 'utf-8');
            return fileContent;
        } catch (error) {
            const errorMessage = `Error reading file ${filePath}: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            throw new Error(errorMessage);
        }
    }

    /**
     * Write to a file in the workspace (creates if doesn't exist)
     */
    public async writeFile(filePath: string, content: string, requireConfirmation: boolean = true): Promise<boolean> {
        const fullPath = this.resolveFilePath(filePath);
        const operation: FileChange['operation'] = fs.existsSync(fullPath) ? 'modify' : 'create';
        
        this.logger.log(this.componentName, `${operation === 'create' ? 'Creating' : 'Modifying'} file: ${filePath}`);
        
        // Store original content for undo if file exists
        let originalContent: string | undefined;
        if (operation === 'modify') {
            try {
                originalContent = await this.readFile(filePath);
            } catch (error) {
                this.logger.log(this.componentName, `Could not read original content: ${error}`);
            }
        }
        
        // Get user confirmation if required
        if (requireConfirmation) {
            const action = operation === 'create' ? 'Create' : 'Modify';
            const confirmed = await this.confirmOperation(`${action} ${filePath}?`);
            if (!confirmed) {
                this.logger.log(this.componentName, 'Operation canceled by user');
                return false;
            }
        }
        
        try {
            // Ensure directory exists
            const directory = path.dirname(fullPath);
            await fs.promises.mkdir(directory, { recursive: true });
            
            // Write file
            await fs.promises.writeFile(fullPath, content, 'utf-8');
            
            // Record the change for potential undo
            this.changeHistory.push({
                filePath,
                originalContent,
                newContent: content,
                operation
            });
            
            this.logger.log(this.componentName, `Successfully ${operation === 'create' ? 'created' : 'modified'} file: ${filePath}`);
            return true;
        } catch (error) {
            const errorMessage = `Error writing to file ${filePath}: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            throw new Error(errorMessage);
        }
    }

    /**
     * Delete a file from the workspace
     */
    public async deleteFile(filePath: string, requireConfirmation: boolean = true): Promise<boolean> {
        this.logger.log(this.componentName, `Deleting file: ${filePath}`);
        
        const fullPath = this.resolveFilePath(filePath);
        
        if (!fs.existsSync(fullPath)) {
            this.logger.log(this.componentName, `File doesn't exist: ${filePath}`);
            return false;
        }
        
        // Store original content for undo
        let originalContent: string | undefined;
        try {
            originalContent = await this.readFile(filePath);
        } catch (error) {
            this.logger.log(this.componentName, `Could not read original content: ${error}`);
        }
        
        // Get user confirmation if required
        if (requireConfirmation) {
            const confirmed = await this.confirmOperation(`Delete ${filePath}?`);
            if (!confirmed) {
                this.logger.log(this.componentName, 'Delete operation canceled by user');
                return false;
            }
        }
        
        try {
            await fs.promises.unlink(fullPath);
            
            // Record the change for potential undo
            this.changeHistory.push({
                filePath,
                originalContent,
                newContent: '',
                operation: 'delete'
            });
            
            this.logger.log(this.componentName, `Successfully deleted file: ${filePath}`);
            return true;
        } catch (error) {
            const errorMessage = `Error deleting file ${filePath}: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            throw new Error(errorMessage);
        }
    }

    /**
     * List files in a directory
     */
    public async listFiles(directoryPath: string): Promise<string[]> {
        this.logger.log(this.componentName, `Listing files in directory: ${directoryPath}`);
        
        if (!this.workspaceRoot) {
            this.logger.log(this.componentName, 'No workspace folder available. Cannot list files.');
            throw new Error('No workspace folder is open. Please open a folder to use this feature.');
        }
        
        try {
            const fullPath = this.resolveFilePath(directoryPath);
            const files = await fs.promises.readdir(fullPath);
            return files;
        } catch (error) {
            const errorMessage = `Error listing files in directory ${directoryPath}: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            throw new Error(errorMessage);
        }
    }

    /**
     * Undo the most recent file change
     */
    public async undoLastChange(): Promise<boolean> {
        const lastChange = this.changeHistory.pop();
        
        if (!lastChange) {
            this.logger.log(this.componentName, 'No changes to undo');
            return false;
        }
        
        this.logger.log(this.componentName, `Undoing last change to ${lastChange.filePath}`);
        
        try {
            if (lastChange.operation === 'delete' && lastChange.originalContent) {
                // Restore the deleted file
                await this.writeFile(lastChange.filePath, lastChange.originalContent, false);
                this.logger.log(this.componentName, `Restored deleted file: ${lastChange.filePath}`);
                return true;
            } else if (lastChange.operation === 'create') {
                // Delete the created file
                await this.deleteFile(lastChange.filePath, false);
                this.logger.log(this.componentName, `Removed created file: ${lastChange.filePath}`);
                return true;
            } else if (lastChange.operation === 'modify' && lastChange.originalContent) {
                // Restore the original content
                await this.writeFile(lastChange.filePath, lastChange.originalContent, false);
                this.logger.log(this.componentName, `Restored previous version of: ${lastChange.filePath}`);
                return true;
            }
            
            this.logger.log(this.componentName, `Could not undo change to ${lastChange.filePath}`);
            return false;
        } catch (error) {
            const errorMessage = `Error undoing change to ${lastChange.filePath}: ${error}`;
            this.logger.log(this.componentName, errorMessage);
            throw new Error(errorMessage);
        }
    }

    /**
     * Show diff between old and new content
     */
    public async showDiff(filePath: string, originalContent: string, newContent: string): Promise<void> {
        const fileName = path.basename(filePath);
        const uri = vscode.Uri.file(filePath);
        
        // Create URIs for diff editor
        const originalUri = uri.with({ scheme: 'agent-original', path: `${uri.path}.original` });
        const newUri = uri.with({ scheme: 'agent-new', path: `${uri.path}.new` });
        
        // Register content provider
        const contentProvider = vscode.workspace.registerTextDocumentContentProvider('agent-original', {
            provideTextDocumentContent: () => originalContent
        });
        
        const newContentProvider = vscode.workspace.registerTextDocumentContentProvider('agent-new', {
            provideTextDocumentContent: () => newContent
        });
        
        // Show diff
        await vscode.commands.executeCommand('vscode.diff', originalUri, newUri, `${fileName} (Diff)`);
        
        // Dispose content providers
        contentProvider.dispose();
        newContentProvider.dispose();
    }

    /**
     * Confirm an operation with the user
     */
    private async confirmOperation(message: string): Promise<boolean> {
        const yes = 'Yes';
        const no = 'No';
        const response = await vscode.window.showInformationMessage(message, yes, no);
        return response === yes;
    }

    /**
     * Resolve a relative path to a full path
     */
    private resolveFilePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.join(this.workspaceRoot, filePath);
    }
} 