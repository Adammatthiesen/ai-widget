/**
 * AI Agent Chat Widget Web Component
 * 
 * A self-contained chat interface that integrates with OpenAI's API
 * through the Astro API endpoint. Features include:
 * - Real-time streaming responses
 * - Conversation history management
 * - localStorage persistence
 * - Clean, responsive UI with Shadow DOM
 */

import MarkdownIt from 'markdown-it';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface ChatState {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    isOpen: boolean;
}

class AIAgentWidget extends HTMLElement {
    private shadow: ShadowRoot;
    private state: ChatState;
    private storageKey = 'ai-chat-history';
    private md: MarkdownIt;

    // Element references
    private chatContainer: HTMLDivElement | null = null;
    private inputField: HTMLTextAreaElement | null = null;
    private sendButton: HTMLButtonElement | null = null;
    private messagesContainer: HTMLDivElement | null = null;
    private toggleButton: HTMLButtonElement | null = null;

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });

        // Initialize markdown-it with safe defaults
        this.md = new MarkdownIt({
            html: true,         // Allow HTML tags for proper rendering
            breaks: true,       // Convert \n to <br>
            linkify: true,      // Auto-convert URLs to links
            typographer: true,  // Enable smartquotes and other typographic replacements
            xhtmlOut: true,     // Use XHTML-style tags (e.g., <br />)
        });

        // Initialize state with optional localStorage persistence
        this.state = this.loadStateFromStorage();

        this.render();
        this.attachEventListeners();
        this.updateWidgetState();
    }

    /**
     * Load chat history from localStorage if available
     */
    private loadStateFromStorage(): ChatState {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                return {
                    messages: parsed.messages || [],
                    isLoading: false,
                    error: null,
                    isOpen: false,
                };
            }
        } catch (error) {
            console.warn('Failed to load chat history:', error);
        }

        return {
            messages: [],
            isLoading: false,
            error: null,
            isOpen: false,
        };
    }

    /**
     * Save chat history to localStorage
     */
    private saveStateToStorage(): void {
        try {
            localStorage.setItem(
                this.storageKey,
                JSON.stringify({ messages: this.state.messages })
            );
        } catch (error) {
            console.warn('Failed to save chat history:', error);
        }
    }

    /**
     * Render the component HTML and styles
     */
    private render(): void {
        this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 1000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .widget-container {
          position: relative;
        }

        .toggle-button {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 60px;
          height: 60px;
          border-radius: var(--radius-full);
          background: linear-gradient(135deg, var(--primary-base) 0%, var(--primary-active) 100%);
          border: none;
          color: var(--text-inverted);
          font-size: 28px;
          cursor: pointer;
          box-shadow: 0 4px 12px var(--shadow);
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .toggle-button:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 20px var(--shadow);
          background: linear-gradient(135deg, var(--primary-hover) 0%, var(--primary-vibrant) 100%);
        }

        .toggle-button:active {
          transform: scale(0.95);
        }

        .chat-container {
          position: absolute;
          bottom: 80px;
          right: 0;
          width: 500px;
          height: 600px;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          background: var(--background-base);
          box-shadow: 0 8px 24px var(--shadow);
          opacity: 0;
          transform: translateY(20px) scale(0.95);
          pointer-events: none;
          transition: opacity 0.3s, transform 0.3s;
        }

        .chat-container.open {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: all;
        }

        .chat-header {
          padding: 8px 20px;
          background: var(--primary-base);
          color: var(--text-inverted);
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
          font-weight: 600;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .message {
          display: flex;
          flex-direction: column;
          max-width: 80%;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .message.user {
          align-self: flex-end;
        }

        .message.assistant {
          align-self: flex-start;
        }

        .message-label {
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 3px;
          opacity: 0.7;
        }

        .message.user .message-label {
          text-align: right;
          color: var(--primary-active);
        }

        .message.assistant .message-label {
          color: var(--primary-active);
        }
          
        .message-content {
          padding: 10px 14px;
          border-radius: 12px;
          line-height: 1.4;
          word-wrap: break-word;
          white-space: pre-wrap;
        }

        .message.user .message-content {
          background: var(--primary-base);
          color: var(--text-inverted);
          border-bottom-right-radius: var(--radius-sm);
        }

        .message.assistant .message-content {
          background: var(--background-step-1);
          color: var(--text-normal);
          border: 1px solid var(--border);
          border-bottom-left-radius: var(--radius-sm);
          max-height: 500px;
          overflow-y: auto;
          overflow-x: hidden;
        }

        /* Custom scrollbar styling */
        .message.assistant .message-content::-webkit-scrollbar {
          width: 6px;
        }

        .message.assistant .message-content::-webkit-scrollbar-track {
          background: transparent;
        }

        .message.assistant .message-content::-webkit-scrollbar-thumb {
          background: var(--background-step-3);
          border-radius: var(--radius-sm);
        }

        .message.assistant .message-content::-webkit-scrollbar-thumb:hover {
          background: var(--default-hover);
        }

        /* Firefox scrollbar */
        .message.assistant .message-content {
          scrollbar-width: thin;
          scrollbar-color: var(--background-step-3) transparent;
        }

        /* Markdown styling for assistant messages */
        .message.assistant .message-content h1,
        .message.assistant .message-content h2,
        .message.assistant .message-content h3 {
          margin-top: 4px;
          margin-bottom: 2px;
          font-weight: 600;
          line-height: 1.25;
        }

        .message.assistant .message-content h1 { font-size: 1.5em; }
        .message.assistant .message-content h2 { font-size: 1.3em; }
        .message.assistant .message-content h3 { font-size: 1.1em; }

        .message.assistant .message-content h1:first-child,
        .message.assistant .message-content h2:first-child,
        .message.assistant .message-content h3:first-child {
          margin-top: 0;
        }

        .message.assistant .message-content p {
          margin: 0;
        }

        .message.assistant .message-content p:first-child {
          margin-top: 0;
        }

        .message.assistant .message-content p:last-child {
          margin-bottom: 0;
        }

        .message.assistant .message-content code {
          background: var(--background-step-3);
          color: var(--text-normal);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 0.9em;
        }

        .message.assistant .message-content pre {
          background: var(--background-step-3);
          color: var(--text-normal);
          padding: 12px;
          border-radius: var(--radius-md);
          overflow-x: auto;
          margin: 4px 0;
        }        
          
        .message.assistant .message-content pre code {
          background: none;
          padding: 0;
          font-size: 0.9em;
        }

        .message.assistant .message-content strong {
          font-weight: 600;
          color: var(--text-normal);
        }

        .message.assistant .message-content em {
          font-style: italic;
        }

        .message.assistant .message-content a {
          color: var(--primary-base);
          text-decoration: underline;
        }

        .message.assistant .message-content a:hover {
          color: var(--primary-hover);
        }        
          
        .message.assistant .message-content ul,
        .message.assistant .message-content ol {
          margin: 2px 0;
          padding-left: 24px;
        }

        .message.assistant .message-content li {
          margin: 0;
        }

        .message.assistant .message-content blockquote {
          border-left: 3px solid var(--primary-base);
          padding-left: 12px;
          margin: 4px 0;
          color: var(--text-muted);
          font-style: italic;
        }

        .message.assistant .message-content hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 6px 0;
        }        
          
        .message.assistant .message-content table {
          width: 100%;
          max-width: 100%;
          border-collapse: collapse;
          margin: 8px 0;
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          overflow: hidden;
          display: table;
        }

        .message.assistant .message-content table th,
        .message.assistant .message-content table td {
          padding: 10px 12px;
          text-align: left;
          word-wrap: break-word;
        }

        .message.assistant .message-content table th {
          background: var(--background-step-3);
          color: var(--text-normal);
          font-weight: 600;
          font-size: 0.85em;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .message.assistant .message-content table td {
          background: var(--background-base);
          border-bottom: 1px solid var(--border);
        }

        .message.assistant .message-content table tbody tr:nth-child(even) td {
          background: var(--background-step-1);
        }

        .message.assistant .message-content table tbody tr:hover td {
          background: var(--background-step-2);
        }

        .message.assistant .message-content table tbody tr:last-child td {
          border-bottom: none;
        }

        .input-container {
          padding: 16px 16px;
          border-top: 1px solid var(--border);
          display: flex;
          gap: 12px;
          background: var(--background-step-1);
          border-radius: 0 0 var(--radius-lg) var(--radius-lg);
        }

        textarea {
          flex: 1;
          padding: 8px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-family: inherit;
          font-size: 14px;
          resize: none;
          min-height: 44px;
          max-height: 120px;
          transition: border-color 0.2s;
          background: var(--background-base);
          color: var(--text-normal);
        }

        textarea:focus {
          outline: none;
          border-color: var(--primary-base);
        }

        textarea:disabled {
          background: var(--background-step-2);
          cursor: not-allowed;
        }

        button {
          padding: 0 24px;
          background: linear-gradient(135deg, var(--primary-base) 0%, var(--primary-active) 100%);
          color: var(--text-inverted);
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.2s, opacity 0.2s;
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px var(--primary-flat-hover);
        }

        button:hover:not(:disabled):not(.clear-button) {
          background: linear-gradient(135deg, var(--primary-hover) 0%, var(--primary-vibrant) 100%);
        }

        button:active:not(:disabled) {
          transform: translateY(0);
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading-indicator {
          display: flex;
          gap: 4px;
          padding: 12px 16px;
        }

        .loading-dot {
          width: 8px;
          height: 8px;
          border-radius: var(--radius-full);
          background: var(--primary-base);
          animation: bounce 1.4s infinite ease-in-out;
        }

        .loading-dot:nth-child(1) {
          animation-delay: -0.32s;
        }

        .loading-dot:nth-child(2) {
          animation-delay: -0.16s;
        }

        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0);
            opacity: 0.5;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .error-message {
          padding: 12px;
          background: var(--danger-flat);
          border: 1px solid var(--danger-base);
          border-radius: var(--radius-md);
          color: var(--danger-vibrant);
          font-size: 14px;
          margin: 8px 0;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          text-align: center;
          padding: 20px;
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-state-text {
          font-size: 16px;
          margin-bottom: 8px;
        }

        .empty-state-subtext {
          font-size: 14px;
          opacity: 0.7;
        }

        .clear-button {
          padding: 6px 14px;
          color: var(--text-inverted);
          border: 1px solid var(--danger-flat-active);
          font-size: 12px;
          margin-left: auto;

          background: var(--danger-flat);
        }

        .clear-button:hover {
          background: var(--danger-flat-hover);
          border-color: var(--danger-base);
          color: var(--danger-vibrant);
        }
      </style>

      <div class="widget-container">
        <button class="toggle-button" id="toggle-btn" aria-label="Toggle chat">
          💬
        </button>
        <div class="chat-container" id="chat-container">
          <div class="chat-header">
            <span>AI Assistant</span>
            <button class="clear-button" id="clear-btn">Clear History</button>
          </div>
          <div class="messages-container" id="messages"></div>
          <div class="input-container">
            <textarea 
              id="input" 
              placeholder="Type your message..."
              rows="1"
            ></textarea>
            <button id="send-btn">Send</button>
          </div>
        </div>
      </div>
    `;

        // Cache element references
        this.toggleButton = this.shadow.getElementById('toggle-btn') as HTMLButtonElement;
        this.chatContainer = this.shadow.getElementById('chat-container') as HTMLDivElement;
        this.messagesContainer = this.shadow.getElementById('messages') as HTMLDivElement;
        this.inputField = this.shadow.getElementById('input') as HTMLTextAreaElement;
        this.sendButton = this.shadow.getElementById('send-btn') as HTMLButtonElement;

        // Render existing messages
        this.renderMessages();
    }

    /**
     * Attach event listeners to interactive elements
     */
    private attachEventListeners(): void {
        // Toggle button click
        this.toggleButton?.addEventListener('click', () => this.toggleWidget());

        // Send button click
        this.sendButton?.addEventListener('click', () => this.handleSend());

        // Enter key to send (Shift+Enter for new line)
        this.inputField?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        // Auto-resize textarea
        this.inputField?.addEventListener('input', () => {
            if (this.inputField) {
                this.inputField.style.height = 'auto';
                this.inputField.style.height = `${this.inputField.scrollHeight}px`;
            }
        });

        // Clear history button
        this.shadow.getElementById('clear-btn')?.addEventListener('click', () => {
            if (confirm('Clear all chat history?')) {
                this.clearHistory();
            }
        });
    }

    /**
     * Render all messages in the chat
     */
    private renderMessages(): void {
        if (!this.messagesContainer) return;

        if (this.state.messages.length === 0) {
            this.messagesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div class="empty-state-text">Start a conversation</div>
          <div class="empty-state-subtext">Ask me anything!</div>
        </div>
      `;
            return;
        }

        this.messagesContainer.innerHTML = this.state.messages
            .map((msg) => this.createMessageHTML(msg))
            .join('');

        // Scroll to bottom
        this.scrollToBottom();
    }

    /**
     * Create HTML for a single message
     */
    private createMessageHTML(message: ChatMessage): string {
        const label = message.role === 'user' ? 'You' : 'AI Assistant';
        const content = message.role === 'assistant'
            ? this.md.render(message.content)
            : this.escapeHtml(message.content);

        return `
      <div class="message ${message.role}">
        <div class="message-label">${label}</div>
        <div class="message-content">${content}</div>
      </div>
    `;
    }

    /**
     * Add a new message to the chat
     */
    private addMessage(message: ChatMessage): void {
        this.state.messages.push(message);
        this.saveStateToStorage();

        if (this.messagesContainer) {
            // Remove empty state if present
            const emptyState = this.messagesContainer.querySelector('.empty-state');
            if (emptyState) {
                this.messagesContainer.innerHTML = '';
            }

            // Add new message
            this.messagesContainer.insertAdjacentHTML(
                'beforeend',
                this.createMessageHTML(message)
            );
            this.scrollToBottom();
        }
    }

    /**
     * Handle sending a message
     */
    private async handleSend(): Promise<void> {
        if (!this.inputField || !this.sendButton) return;

        const content = this.inputField.value.trim();
        if (!content || this.state.isLoading) return;

        // Add user message
        this.addMessage({ role: 'user', content });

        // Clear input
        this.inputField.value = '';
        this.inputField.style.height = 'auto';

        // Update loading state
        this.state.isLoading = true;
        this.state.error = null;
        this.updateLoadingState();

        try {
            await this.streamChatResponse();
        } catch (error) {
            console.error('Chat error:', error);
            this.state.error = error instanceof Error ? error.message : 'An error occurred';
            this.showError(this.state.error);
        } finally {
            this.state.isLoading = false;
            this.updateLoadingState();
        }
    }

    /**
     * Toggle widget open/closed
     */
    private toggleWidget(): void {
        this.state.isOpen = !this.state.isOpen;
        this.updateWidgetState();

        // Focus input when opening
        if (this.state.isOpen && this.inputField) {
            setTimeout(() => this.inputField?.focus(), 300);
        }
    }

    /**
     * Update widget UI based on open state
     */
    private updateWidgetState(): void {
        if (this.chatContainer && this.toggleButton) {
            if (this.state.isOpen) {
                this.chatContainer.classList.add('open');
                this.toggleButton.innerHTML = '✕';
            } else {
                this.chatContainer.classList.remove('open');
                this.toggleButton.innerHTML = '💬';
            }
        }
    }

    /**
     * Stream chat response from the API
     */
    private async streamChatResponse(): Promise<void> {
        // Show loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant';
        loadingDiv.innerHTML = `
      <div class="message-label">AI Assistant</div>
      <div class="message-content">
        <div class="loading-indicator">
          <div class="loading-dot"></div>
          <div class="loading-dot"></div>
          <div class="loading-dot"></div>
        </div>
      </div>
    `;
        this.messagesContainer?.appendChild(loadingDiv);
        this.scrollToBottom();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: this.state.messages }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Remove loading indicator
            loadingDiv.remove();

            // Create assistant message placeholder
            const assistantMessage: ChatMessage = { role: 'assistant', content: '' };
            this.state.messages.push(assistantMessage);

            const messageDiv = document.createElement('div');
            messageDiv.className = 'message assistant';
            messageDiv.innerHTML = `
        <div class="message-label">AI Assistant</div>
        <div class="message-content"></div>
      `;
            this.messagesContainer?.appendChild(messageDiv);
            const contentDiv = messageDiv.querySelector('.message-content') as HTMLDivElement;

            // Process streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('No response body reader available');
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            break;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.content) {
                                assistantMessage.content += parsed.content;
                                // Render markdown in real-time for assistant messages
                                contentDiv.innerHTML = this.md.render(assistantMessage.content);
                                this.scrollToBottom();
                            }
                        } catch (e) {
                            // Ignore JSON parse errors for partial chunks
                        }
                    }
                }
            }

            // Save final state
            this.saveStateToStorage();

        } catch (error) {
            loadingDiv.remove();
            throw error;
        }
    }

    /**
     * Update UI based on loading state
     */
    private updateLoadingState(): void {
        if (this.inputField && this.sendButton) {
            this.inputField.disabled = this.state.isLoading;
            this.sendButton.disabled = this.state.isLoading;
            this.sendButton.textContent = this.state.isLoading ? 'Sending...' : 'Send';
        }
    }

    /**
     * Show error message
     */
    private showError(message: string): void {
        if (!this.messagesContainer) return;

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = `Error: ${message}`;
        this.messagesContainer.appendChild(errorDiv);
        this.scrollToBottom();

        // Auto-remove after 5 seconds
        setTimeout(() => errorDiv.remove(), 5000);
    }

    /**
     * Clear chat history
     */
    private clearHistory(): void {
        this.state.messages = [];
        this.saveStateToStorage();
        this.renderMessages();
    }

    /**
     * Scroll to bottom of messages
     */
    private scrollToBottom(): void {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Register the custom element
customElements.define('ai-agent-widget', AIAgentWidget);
