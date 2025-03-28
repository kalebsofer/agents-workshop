(function() {
    try {
        if (typeof acquireVsCodeApi === 'undefined') {
            throw new Error('acquireVsCodeApi is not defined');
        }

        const vscode = acquireVsCodeApi();
        
        // Get DOM elements
        const chatContainer = document.getElementById('chat-container');
        const questionInput = document.getElementById('question-input');
        const addContextBtn = document.getElementById('add-context-btn');
        const sendBtn = document.getElementById('send-btn');
        const attachedFiles = new Set();
        let isLoading = false;

        if (!chatContainer || !questionInput || !addContextBtn || !sendBtn) {
            throw new Error('Required DOM elements not found');
        }

        // Add messages to the chat
        function addMessage(type, content) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type + '-message';
            messageDiv.textContent = content;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // Show loading indicator
        function showLoading() {
            if (isLoading) return;
            isLoading = true;
            
            // Disable input and buttons while loading
            questionInput.disabled = true;
            sendBtn.disabled = true;
            addContextBtn.disabled = true;
            
            // Create loading element
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading';
            loadingDiv.id = 'loading-indicator';
            
            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            
            const loadingText = document.createElement('span');
            loadingText.className = 'loading-text';
            loadingText.textContent = 'Assistant is thinking...';
            
            loadingDiv.appendChild(spinner);
            loadingDiv.appendChild(loadingText);
            chatContainer.appendChild(loadingDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        // Hide loading indicator
        function hideLoading() {
            if (!isLoading) return;
            isLoading = false;
            
            // Re-enable input and buttons
            questionInput.disabled = false;
            sendBtn.disabled = false;
            addContextBtn.disabled = false;
            
            // Remove loading indicator
            const loadingIndicator = document.getElementById('loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        }

        // Send a message
        function sendMessage() {
            const question = questionInput.value.trim();
            if (question) {
                addMessage('user', question);
                showLoading();
                vscode.postMessage({ 
                    command: 'askQuestion',
                    text: question 
                });
                questionInput.value = '';
            }
        }

        // Update file display
        function updateAttachedFiles() {
            const filesDiv = document.getElementById('attached-files');
            const filesList = document.getElementById('files-list');
            
            filesList.innerHTML = '';
            
            if (attachedFiles.size > 0) {
                filesDiv.classList.add('has-files');
                
                attachedFiles.forEach((file) => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    
                    const fileIcon = document.createElement('span');
                    fileIcon.className = 'file-icon';
                    fileIcon.textContent = '📄';
                    
                    const fileName = document.createElement('span');
                    fileName.className = 'file-name';
                    fileName.textContent = file.split(/[\\/]/).pop() || file;
                    
                    const removeButton = document.createElement('button');
                    removeButton.className = 'remove-file';
                    removeButton.title = 'Remove file';
                    removeButton.textContent = '×';
                    removeButton.onclick = () => removeFile(file);
                    
                    fileItem.appendChild(fileIcon);
                    fileItem.appendChild(fileName);
                    fileItem.appendChild(removeButton);
                    filesList.appendChild(fileItem);
                });
            } else {
                filesDiv.classList.remove('has-files');
            }
        }

        // Clear all files
        function clearAllFiles() {
            attachedFiles.clear();
            updateAttachedFiles();
            vscode.postMessage({ command: 'clearFiles' });
        }

        // Add removeFile function
        function removeFile(file) {
            attachedFiles.delete(file);
            updateAttachedFiles();
            vscode.postMessage({ 
                command: 'removeFile', 
                fileName: file 
            });
        }

        // Make clearAllFiles function available in global scope for onclick
        window.clearAllFiles = function() {
            attachedFiles.clear();
            updateAttachedFiles();
            vscode.postMessage({ command: 'clearFiles' });
        };

        // Add click handlers
        sendBtn.addEventListener('click', () => {
            sendMessage();
        });

        addContextBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'pickFiles' });
        });

        // Add enter key handler
        questionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.type === 'response') {
                hideLoading();
                addMessage('ai', message.content);
            } else if (message.type === 'fileAttached') {
                attachedFiles.add(message.fileName);
                updateAttachedFiles();
            } else if (message.type === 'error') {
                hideLoading();
                addMessage('ai', `Error: ${message.content}`);
            }
        });

        // Add initial message
        addMessage('ai', 'Assistant is ready. How can I help you?');

    } catch (error) {
        console.error('Failed to initialize webview:', error);
    }
})(); 