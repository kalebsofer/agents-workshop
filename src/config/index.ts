/**
 * config.ts
 * 
 * Loads environment variables and provides access to settings.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

try {
    let envPath = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(envPath)) {
        envPath = path.join(__dirname, '..', '..', '.env');
    }
    
    if (!fs.existsSync(envPath)) {
        envPath = path.join(__dirname, '..', '..', '..', '.env');
    }
    
    if (fs.existsSync(envPath)) {
        console.log(`Loading .env from: ${envPath}`);
        dotenv.config({ path: envPath });
    } else {
        console.warn('.env file not found at any expected location');
    }
} catch (error) {
    console.error('Error loading .env file:', error);
}

export const SECTION = 'agent-workshop';
export const API_KEY = 'openaiApiKey';
export const MODEL = 'gpt-4o-mini-2024-07-18';
export const DEFAULT_MODEL = 'gpt-4o-mini-2024-07-18';
export const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
export const MAX_TOKENS = 4000;

export function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SECTION);
}

export function getApiKey(): string {
    const config = getConfig();
    const configKey = config.get<string>(API_KEY, '');
    const envKey = process.env.OPENAI_API_KEY || '';
    
    if (!configKey && !envKey) {
        console.warn('No API key found in config or environment variables');
    }
    
    return configKey || envKey || '';
}

export function getModel(): string {
    const config = getConfig();
    return config.get<string>(MODEL, DEFAULT_MODEL);
} 