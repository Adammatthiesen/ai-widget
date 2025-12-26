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
        const timestamp = parsed.timestamp || 0;
        const now = Date.now();
        const eightHours = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

        // Check if storage has expired (older than 8 hours)
        if (now - timestamp > eightHours) {
          // Clear expired storage
          localStorage.removeItem(this.storageKey);
          return {
            messages: [],
            isLoading: false,
            error: null,
            isOpen: false,
          };
        }

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
   * Save chat history to localStorage with timestamp
   */
  private saveStateToStorage(): void {
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          messages: this.state.messages,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.warn('Failed to save chat history:', error);
    }
  }

  /**
   * Get all interactive form fields on the page
   */
  private getPageFormFields(): Array<{ id: string; name: string; type: string; value: string }> {
    const fields: Array<{ id: string; name: string; type: string; value: string }> = [];

    // Get all input, textarea, and select elements
    const inputs = document.querySelectorAll('input, textarea, select');

    inputs.forEach((element) => {
      const el = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const id = el.id || el.name;
      const tagName = el.tagName.toLowerCase();

      // Skip password and hidden inputs
      if (el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'hidden')) {
        return;
      }

      if (id) {
        let fieldType: string;
        if (tagName === 'textarea') {
          fieldType = 'textarea';
        } else if (tagName === 'select') {
          fieldType = 'select';
        } else {
          fieldType = (el as HTMLInputElement).type || 'text';
        }

        fields.push({
          id: id,
          name: el.name || el.id,
          type: fieldType,
          value: el.value || ''
        });
      }
    });

    return fields;
  }

  /**
   * Read content from a form field
   */
  private readFormField(fieldId: string): string | null {
    const element = document.getElementById(fieldId) ||
      document.querySelector(`[name="${fieldId}"]`);

    if (element && (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement)) {
      return element.value;
    }

    return null;
  }

  /**
   * Write content to a form field
   */
  private writeFormField(fieldId: string, content: string): boolean {
    const element = document.getElementById(fieldId) ||
      document.querySelector(`[name="${fieldId}"]`);

    if (element && (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement)) {
      element.value = content;

      // Trigger input and change events for frameworks that rely on them
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    }

    return false;
  }

  /**
   * Build system context message with available form fields
   */
  private buildSystemContext(): string {
    const fields = this.getPageFormFields();

    if (fields.length === 0) {
      return 'You are a helpful AI assistant.';
    }

    const fieldList = fields.map(f =>
      `- ${f.id} (${f.type})${f.value ? `: current value="${f.value.substring(0, 100)}${f.value.length > 100 ? '...' : ''}"` : ''}`
    ).join('\n');

    return `You are a helpful AI assistant with the ability to interact with form fields on the current page.

Available form fields:
${fieldList}

IMPORTANT: To write to fields, you MUST use the exact syntax below. Do not just describe what you will do - actually output the commands.

FIELD WRITE SYNTAX (use this exact format):
[WRITE_FIELD:field-id]
content to write here
[/WRITE_FIELD]

The write commands will be hidden from the user automatically, so include them in your response.

EXAMPLES OF CORRECT USAGE:

User: "Write a blog post about technology in 2025"
Assistant: "I'll create a blog post for you about technology in 2025.

[WRITE_FIELD:title]
Technology in 2025: Trends and Predictions
[/WRITE_FIELD]

[WRITE_FIELD:author]
AI Assistant
[/WRITE_FIELD]

[WRITE_FIELD:category]
technology
[/WRITE_FIELD]

[WRITE_FIELD:excerpt]
Explore the cutting-edge innovations shaping our world in 2025—from quantum computing to autonomous infrastructure.
[/WRITE_FIELD]

[WRITE_FIELD:content]
**Technology in 2025: Trends and Predictions**

The year 2025 marks a pivotal moment in the evolution of technology...
[/WRITE_FIELD]

[WRITE_FIELD:tags]
technology, 2025, AI, innovation, future tech
[/WRITE_FIELD]

I've filled in all the blog post fields with relevant content about technology in 2025."

RULES:
- For select fields, use ONLY the exact option values from the list above
- Always include the [WRITE_FIELD:...] and [/WRITE_FIELD] tags
- Put the actual content between the tags
- You can write to multiple fields in one response
- The commands are automatically hidden from the user`;
  }

  /**
   * Process field read commands in user message before sending
   */
  private processFieldReads(content: string): string {
    const readFieldRegex = /\[READ_FIELD:([^\]]+)\]/g;
    let processedContent = content;
    let match;

    while ((match = readFieldRegex.exec(content)) !== null) {
      const fieldId = match[1].trim();
      const fieldValue = this.readFormField(fieldId);

      if (fieldValue !== null) {
        // Replace the READ_FIELD tag with the actual value
        processedContent = processedContent.replace(
          match[0],
          `[Field "${fieldId}" contains: "${fieldValue}"]`
        );
      } else {
        processedContent = processedContent.replace(
          match[0],
          `[Field "${fieldId}" not found]`
        );
      }
    }

    return processedContent;
  }

  /**
   * Inject current field values into system context
   */
  private injectFieldContext(userMessage: string): string {
    // Check if user is asking about specific fields
    const fields = this.getPageFormFields();
    const mentionedFields: string[] = [];

    fields.forEach(field => {
      // Check if user mentions the field by name or id
      const fieldPattern = new RegExp(`\\b(${field.id}|${field.name})\\b`, 'i');
      if (fieldPattern.test(userMessage)) {
        mentionedFields.push(field.id);
      }
    });

    // If user mentions checking/reviewing/reading fields, auto-inject their values
    const checkingPattern = /\b(check|review|read|see|look at|show|tell me about)\b.*\b(field|content|value)\b/i;
    if (checkingPattern.test(userMessage) && mentionedFields.length > 0) {
      let contextAddition = '\n\n[Auto-fetched field values for context:';
      mentionedFields.forEach(fieldId => {
        const value = this.readFormField(fieldId);
        if (value) {
          contextAddition += `\n- ${fieldId}: "${value.substring(0, 200)}${value.length > 200 ? '...' : ''}"`;
        }
      });
      contextAddition += ']';
      return userMessage + contextAddition;
    }

    return userMessage;
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
          font-family: var(--scms-font-onest, -apple-system), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
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
          cursor: pointer;
          box-shadow: 0 4px 12px var(--shadow);
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: unset;

          & svg {
            height: 28px;
            width: 28px !important;
          }
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
          background: var(--background-step-3);
          color: var(--text-normal);
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
          font-weight: 600;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .messages-container {
          flex: 1;
          overflow-y: scroll;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .message {
          display: flex;
          flex-direction: column;
          max-width: 100%;
          animation: slideIn 0.3s ease-out;
        }

        .message .message-content {
          display: flex;
        }

        .message .message-content-inner {
          max-height: 500px;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 8px;
        }

        /* Custom scrollbar styling */
        .messages-container::-webkit-scrollbar,
        .message .message-content-inner::-webkit-scrollbar {
          width: 6px;
        }

        .messages-container::-webkit-scrollbar-track,
        .message .message-content-inner::-webkit-scrollbar-track {
          background: transparent;
        }

        .messages-container::-webkit-scrollbar-thumb,
        .message .message-content-inner::-webkit-scrollbar-thumb {
          background: var(--default);
          border-radius: var(--radius-sm);
        }

        .messages-container::-webkit-scrollbar-thumb:hover,
        .message .message-content-inner::-webkit-scrollbar-thumb:hover {
          background: var(--default-hover);
        }

        /* Firefox scrollbar */
        .messages-container,
        .message .message-content-inner {
          scrollbar-width: thin;
          scrollbar-color: var(--default) transparent;
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

        .message.user .message-label::after {
          --svg-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16px' height='16px' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='%23000' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M17.982 18.725A7.49 7.49 0 0 0 12 15.75a7.49 7.49 0 0 0-5.982 2.975m11.964 0a9 9 0 1 0-11.963 0m11.962 0A8.97 8.97 0 0 1 12 21a8.97 8.97 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0a3 3 0 0 1 6 0'/%3E%3C/svg%3E");
          content: "";
          display: inline-block;
          width: 16px;
          height: 16px;
          background-color: var(--primary-active);
          -webkit-mask: var(--svg-icon) no-repeat center;
          mask: var(--svg-icon) no-repeat center;
          mask-size: cover;
          -webkit-mask-size: cover;
          vertical-align: middle;
          margin-left: 4px;
        }

        .message.assistant .message-label {
          color: var(--primary-active);
        }

        .message.assistant .message-label::before {
          --svg-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16px' height='16px' viewBox='0 0 24 24'%3E%3Cg fill='none' stroke='%23000' stroke-linecap='round' stroke-linejoin='round' stroke-width='2'%3E%3Cpath d='M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM9.5 9h.01m4.99 0h.01'/%3E%3Cpath d='M9.5 13a3.5 3.5 0 0 0 5 0'/%3E%3C/g%3E%3C/svg%3E");
          content: "";
          display: inline-block;
          width: 16px;
          height: 16px;
          background-color: var(--primary-active);
          -webkit-mask: var(--svg-icon) no-repeat center;
          mask: var(--svg-icon) no-repeat center;
          mask-size: cover;
          -webkit-mask-size: cover;
          vertical-align: middle;
          margin-right: 4px;
        }
          
        .message-content {
          border-radius: 12px;
          line-height: 1.4;
          word-wrap: break-word;
          white-space: pre-wrap;
          max-height: 500px;
          overflow-y: auto;
          overflow-x: auto;
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
          border-radius: 12px;
          border-bottom-left-radius: var(--radius-sm);
          overflow: hidden;
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
        }

        button:hover:not(:disabled):not(.clear-button) {
          box-shadow: 0 4px 12px var(--primary-flat-hover);
          background: linear-gradient(135deg, var(--primary-hover) 0%, var(--primary-vibrant) 100%);
        }

        button:hover:not(:disabled):is(.clear-button) {
          box-shadow: 0 4px 12px var(--danger-flat-hover);
          background: linear-gradient(135deg, var(--danger-flat-hover) 0%, var(--danger-flat-active) 100%);
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

        .field-notification {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: var(--radius-md);
          font-size: 13px;
          margin: 8px 0;
          animation: slideIn 0.3s ease-out;
        }

        .field-notification svg {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        .field-notification.success {
          background: var(--success-flat);
          border: 1px solid var(--success-base);
          color: var(--success-base);
        }

        .field-notification.error {
          background: var(--danger-flat);
          border: 1px solid var(--danger-base);
          color: var(--danger-vibrant);
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

          & svg {
            height: 48px;
            width: 48px;
          }
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
          padding: 4px 14px;
          color: var(--text-normal);
          border: 1px solid var(--danger-flat-active);
          font-size: 12px;
          margin-left: auto;

          background: var(--danger-flat);

          display: flex;
          gap: 6px;
          align-items: center;

          & svg {
            height: 16px;
            width: 16px;
          }

        }

        .clear-button:hover {
          background: var(--danger-flat-hover);
          border-color: var(--danger-vibrant);
          color: var(--danger-vibrant);
        }

        .confirm-dialog {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s;
        }

        .confirm-dialog.show {
          opacity: 1;
          pointer-events: all;
        }

        .confirm-content {
          background: var(--background-step-1);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 24px;
          max-width: 400px;
          box-shadow: 0 8px 32px var(--shadow);
          transform: scale(0.95);
          transition: transform 0.2s;
        }

        .confirm-dialog.show .confirm-content {
          transform: scale(1);
        }

        .confirm-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-normal);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .confirm-title svg {
          width: 24px;
          height: 24px;
          color: var(--danger-base);
        }

        .confirm-message {
          font-size: 14px;
          color: var(--text-dimmed);
          line-height: 1.5;
          margin-bottom: 20px;
        }

        .confirm-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .confirm-btn {
          padding: 8px 20px;
          border-radius: var(--radius-md);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border);
          transition: all 0.2s;
        }

        .confirm-btn.cancel {
          background: var(--background-step-2);
          color: var(--text-normal);
        }

        .confirm-btn.cancel:hover {
          background: var(--background-step-3);
        }

        .confirm-btn.confirm {
          background: var(--danger-base);
          color: var(--text-inverted);
          border-color: var(--danger-base);
        }

        .confirm-btn.confirm:hover {
          background: var(--danger-vibrant);
          border-color: var(--danger-vibrant);
        }
      </style>

      <div class="widget-container">
        <button class="toggle-button" id="toggle-btn" aria-label="Toggle AI Assistant Chat" title="Toggle AI Assistant Chat">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
          </svg>
        </button>
        <div class="chat-container" id="chat-container">
          <div class="chat-header">
            <span>AI Assistant</span>
            <button class="clear-button" id="clear-btn">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              <span>Clear History</span>
            </button>
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

      <!-- Confirmation Dialog -->
      <div class="confirm-dialog" id="confirm-dialog">
        <div class="confirm-content">
          <div class="confirm-title">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            Clear Chat History?
          </div>
          <div class="confirm-message">
            This will permanently delete all your conversation history. This action cannot be undone.
          </div>
          <div class="confirm-actions">
            <button class="confirm-btn cancel" id="confirm-cancel">Cancel</button>
            <button class="confirm-btn confirm" id="confirm-ok">Clear History</button>
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
      this.showConfirmDialog();
    });

    // Confirm dialog buttons
    this.shadow.getElementById('confirm-cancel')?.addEventListener('click', () => {
      this.hideConfirmDialog();
    });

    this.shadow.getElementById('confirm-ok')?.addEventListener('click', () => {
      this.clearHistory();
      this.hideConfirmDialog();
    });

    // Close dialog on backdrop click
    this.shadow.getElementById('confirm-dialog')?.addEventListener('click', (e) => {
      if (e.target === this.shadow.getElementById('confirm-dialog')) {
        this.hideConfirmDialog();
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
          <div class="empty-state-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
          </div>
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
        <div class="message-content"><div class="message-content-inner">${content}</div></div>
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

    // Process any READ_FIELD commands in the user's message
    let processedContent = this.processFieldReads(content);

    // Inject field context if user is asking about fields
    processedContent = this.injectFieldContext(processedContent);

    // Add user message (with processed content)
    this.addMessage({ role: 'user', content: processedContent });

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
        this.toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`;
      } else {
        this.chatContainer.classList.remove('open');
        this.toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>`;
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
      // Build messages array with system context
      const systemContext = this.buildSystemContext();
      const messagesWithContext = [
        { role: 'system' as const, content: systemContext },
        ...this.state.messages
      ];

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesWithContext }),
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
        <div class="message-content"><div class="message-content-inner"></div></div>
      `;
      this.messagesContainer?.appendChild(messageDiv);
      const contentDiv = messageDiv.querySelector('.message-content-inner') as HTMLDivElement;

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

      // Process any field write commands in the response
      const writes = this.processFieldCommands(assistantMessage.content);

      // Remove field commands from displayed content
      let displayContent = this.removeFieldCommands(assistantMessage.content);

      // Add completion summary if fields were written and content is empty/minimal
      if (writes.length > 0 && displayContent.trim().length < 50) {
        const successWrites = writes.filter(w => w.success);
        if (successWrites.length > 0) {
          const fieldNames = successWrites.map(w => w.field).join(', ');
          displayContent = `✓ **Request completed!** I've successfully filled in the following fields: ${fieldNames}.`;
        }
      }

      // Update the message content to the cleaned version for storage
      assistantMessage.content = displayContent;

      contentDiv.innerHTML = this.md.render(displayContent);

      // Save final state
      this.saveStateToStorage();

    } catch (error) {
      loadingDiv.remove();
      throw error;
    }
  }

  /**
   * Remove field commands from content for display
   */
  private removeFieldCommands(content: string): string {
    // Remove WRITE_FIELD commands but keep any surrounding text
    return content.replace(/\[WRITE_FIELD:([^\]]+)\]\s*([\s\S]*?)\s*\[\/WRITE_FIELD\]/g, '');
  }

  /**
   * Process field write commands in AI response
   */
  private processFieldCommands(content: string): Array<{ field: string; content: string; success: boolean }> {
    const writeFieldRegex = /\[WRITE_FIELD:([^\]]+)\]\s*([\s\S]*?)\s*\[\/WRITE_FIELD\]/g;
    let match;
    const writes: Array<{ field: string; content: string; success: boolean }> = [];

    while ((match = writeFieldRegex.exec(content)) !== null) {
      const fieldId = match[1].trim();
      const fieldContent = match[2].trim();

      const success = this.writeFormField(fieldId, fieldContent);
      writes.push({ field: fieldId, content: fieldContent, success });
    }

    // Show feedback if any writes occurred
    if (writes.length > 0) {
      const successWrites = writes.filter(w => w.success);
      const failedWrites = writes.filter(w => !w.success);

      if (successWrites.length > 0) {
        this.showFieldWriteNotification(
          `Updated ${successWrites.length} field${successWrites.length > 1 ? 's' : ''}: ${successWrites.map(w => w.field).join(', ')}`
        );
      }

      if (failedWrites.length > 0) {
        this.showFieldWriteNotification(
          `Failed to update: ${failedWrites.map(w => w.field).join(', ')}`,
          true
        );
      }
    }

    return writes;
  }

  /**
   * Show notification for field writes
   */
  private showFieldWriteNotification(message: string, isError: boolean = false): void {
    if (!this.messagesContainer) return;

    const notification = document.createElement('div');
    notification.className = isError ? 'field-notification error' : 'field-notification success';

    // Add appropriate icon
    const icon = document.createElement('span');
    icon.innerHTML = isError
      ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
           <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
         </svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
           <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
         </svg>`;

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;

    notification.appendChild(icon);
    notification.appendChild(messageSpan);
    this.messagesContainer.appendChild(notification);
    this.scrollToBottom();

    // Auto-remove after 5 seconds
    setTimeout(() => notification.remove(), 5000);
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
   * Show confirmation dialog
   */
  private showConfirmDialog(): void {
    const dialog = this.shadow.getElementById('confirm-dialog');
    if (dialog) {
      // Use setTimeout to ensure the transition animation works
      setTimeout(() => dialog.classList.add('show'), 10);
    }
  }

  /**
   * Hide confirmation dialog
   */
  private hideConfirmDialog(): void {
    const dialog = this.shadow.getElementById('confirm-dialog');
    if (dialog) {
      dialog.classList.remove('show');
    }
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
if (!customElements.get('ai-agent-widget')) {
  customElements.define('ai-agent-widget', AIAgentWidget);
}
