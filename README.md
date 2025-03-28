# IDE Assistant with Cloud LLMs

A VS Code extension that provides an AI-powered coding assistant, using cloud LLM providers (Anthropic Claude, OpenAI, or Deepseek).

## Features

- AI Chat Interface within VS Code
- Context-Aware Responses with file attachments
- Split View Integration
- Multiple AI Provider support (Anthropic, OpenAI, Deepseek)

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

* `soft-assist.provider`: Choose "anthropic", "openai", or "deepseek"
* `soft-assist.anthropicApiKey`: Your Anthropic API key
* `soft-assist.anthropicModel`: Model to use (default: 'claude-3-haiku-20240307')
* `soft-assist.openaiApiKey`: Your OpenAI API key
* `soft-assist.openaiModel`: Model to use (default: 'gpt-3.5-turbo')
* `soft-assist.deepseekApiKey`: Your Deepseek API key
* `soft-assist.deepseekModel`: Model to use (default: 'deepseek-coder')

API keys can also be set via environment variables:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`

## Usage

1. Open the AI Assistant panel:
   - Click the AI icon in the activity bar, or
   - Use the command palette (`Ctrl+Shift+P`) and search for "Open AI Assistant Panel"

2. Ask questions and add file context as needed

## Extension Settings

This extension contributes the following settings:

* `soft-assist.provider`: The AI provider to use (default: 'anthropic')
* `soft-assist.anthropicApiKey`: API key for Anthropic Claude
* `soft-assist.anthropicModel`: Anthropic model to use (default: 'claude-3-haiku-20240307')
* `soft-assist.openaiApiKey`: API key for OpenAI
* `soft-assist.openaiModel`: OpenAI model to use (default: 'gpt-3.5-turbo')
* `soft-assist.deepseekApiKey`: API key for Deepseek
* `soft-assist.deepseekModel`: Deepseek model to use (default: 'deepseek-coder')

## Known Issues

- API keys should be stored securely
- Large files may take longer to process
- Currently only supports text-based files for context
- Token limits vary by provider and model

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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## **License**

This project is licensed under the MIT License - see the LICENSE file for details.

## Release Notes

### 0.0.3

- Added support for cloud LLM providers (Anthropic, OpenAI, Deepseek)
- Configuration options for API providers

### 0.0.1

Initial release of Assistant:
- Basic chat interface
- File context support
- Split view integration


## Acknowledgments

- Anthropic Claude, OpenAI GPT, and Deepseek API integrations


### Tips
<a href="https://www.buymeacoffee.com/kalebsofer" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>