# AI Agent Workshop

A VS Code extension that provides an AI-powered coding assistant using OpenAI API.

## Features

- AI Chat Interface within VS Code
- Context-Aware Responses with file attachments
- Split View Integration
- Secure API key management

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
