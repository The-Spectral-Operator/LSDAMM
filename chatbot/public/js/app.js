/**
 * LSDAMM Chatbot Application
 * Full-featured web chatbot with session management, memories, and chain of thought
 */

class LSDammChatbot {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.conversationId = null;
    this.currentSession = null;
    this.messages = [];
    this.attachments = [];
    this.isConnected = false;
    this.isLoading = false;
    this.showChainOfThought = false;
    this.extendedThinking = false;
    
    this.stats = {
      tokensUsed: 0,
      latency: 0,
      activeNodes: 0
    };

    this.models = {
      anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
      openai: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
      google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
      xai: ['grok-beta', 'grok-2'],
      ollama: ['llama3.2', 'mistral', 'codellama', 'deepseek-r1']
    };

    this.settings = this.loadSettings();
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadConversations();
    this.changeProvider(this.settings.defaultProvider || 'anthropic');
    
    if (this.settings.autoConnect) {
      this.connect();
    }

    // Apply theme
    this.changeTheme(this.settings.theme || 'dark');
  }

  setupEventListeners() {
    // Auto-resize textarea
    const input = document.getElementById('messageInput');
    input.addEventListener('input', () => this.autoResize(input));
  }

  loadSettings() {
    const defaults = {
      serverUrl: 'ws://localhost:3000/ws',
      apiKey: '',
      clientId: 'chatbot-' + Math.random().toString(36).substr(2, 9),
      systemPrompt: 'You are a helpful AI assistant.',
      theme: 'dark',
      defaultProvider: 'anthropic',
      saveMemories: true,
      autoConnect: true
    };

    try {
      const saved = localStorage.getItem('lsdamm-settings');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  }

  saveSettings() {
    const settings = {
      serverUrl: document.getElementById('serverUrl').value,
      apiKey: document.getElementById('apiKey').value,
      clientId: document.getElementById('clientId').value,
      systemPrompt: document.getElementById('systemPrompt').value,
      theme: document.getElementById('theme').value,
      saveMemories: document.getElementById('saveMemories').checked,
      autoConnect: document.getElementById('autoConnect').checked
    };

    this.settings = settings;
    localStorage.setItem('lsdamm-settings', JSON.stringify(settings));
    this.closeSettings();
    
    // Reconnect if server URL changed
    if (this.ws) {
      this.disconnect();
      this.connect();
    }
  }

  openSettings() {
    const modal = document.getElementById('settingsModal');
    
    // Populate fields
    document.getElementById('serverUrl').value = this.settings.serverUrl || '';
    document.getElementById('apiKey').value = this.settings.apiKey || '';
    document.getElementById('clientId').value = this.settings.clientId || '';
    document.getElementById('systemPrompt').value = this.settings.systemPrompt || '';
    document.getElementById('theme').value = this.settings.theme || 'dark';
    document.getElementById('saveMemories').checked = this.settings.saveMemories !== false;
    document.getElementById('autoConnect').checked = this.settings.autoConnect !== false;
    
    modal.classList.add('open');
  }

  closeSettings() {
    document.getElementById('settingsModal').classList.remove('open');
  }

  changeTheme(theme) {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  // WebSocket Connection
  async connect() {
    if (!this.settings.serverUrl) {
      console.error('No server URL configured');
      return;
    }

    try {
      this.ws = new WebSocket(this.settings.serverUrl);

      this.ws.onopen = () => {
        console.log('Connected to server');
        this.isConnected = true;
        this.updateConnectionStatus(true);
        this.register();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.updateConnectionStatus(false);
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.updateConnectionStatus(false);
  }

  register() {
    const message = {
      messageId: this.generateId(),
      version: '1.0',
      type: 'REGISTER',
      source: { clientId: this.settings.clientId, sessionId: 'pending' },
      timestamp: Date.now(),
      priority: 10,
      payload: {
        clientId: this.settings.clientId,
        authToken: this.settings.apiKey,
        clientType: 'web-chatbot',
        capabilities: {
          supportsStreaming: true,
          supportsExtendedThinking: true,
          supportsVision: true,
          supportsTTS: true,
          supportsAttachments: true
        }
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('span:last-child');

    if (connected) {
      dot.classList.add('connected');
      dot.classList.remove('disconnected');
      text.textContent = 'Connected';
    } else {
      dot.classList.remove('connected');
      dot.classList.add('disconnected');
      text.textContent = 'Disconnected';
    }
  }

  attemptReconnect() {
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, 5000);
  }

  handleMessage(message) {
    switch (message.type) {
      case 'REGISTER_ACK':
        if (message.payload.success) {
          this.sessionId = message.payload.sessionId;
          console.log('Registered with session:', this.sessionId);
        }
        break;

      case 'RESPONSE':
        this.handleResponse(message);
        break;

      case 'STREAM':
        this.handleStreamChunk(message);
        break;

      case 'ERROR':
        this.showError(message.payload.errorMessage);
        break;

      case 'EVENT':
        this.handleEvent(message);
        break;
    }
  }

  handleResponse(message) {
    this.isLoading = false;
    this.updateSendButton();

    const response = message.payload;
    
    // Add assistant message
    this.addMessage('assistant', response.content, {
      thinking: response.thinking,
      tokens: response.usage?.totalTokens,
      latency: response.latencyMs
    });

    // Update stats
    if (response.usage) {
      this.stats.tokensUsed += response.usage.totalTokens || 0;
      document.getElementById('tokensUsed').textContent = this.stats.tokensUsed;
    }
    if (response.latencyMs) {
      this.stats.latency = response.latencyMs;
      document.getElementById('latency').textContent = response.latencyMs + 'ms';
    }

    // Handle chain of thought
    if (response.thinking && this.showChainOfThought) {
      this.displayChainOfThought(response.thinking);
    }
  }

  handleStreamChunk(message) {
    // Handle streaming responses
    const chunk = message.payload;
    const lastMessage = this.messages[this.messages.length - 1];

    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
      lastMessage.content += chunk.content || '';
      this.updateMessageContent(lastMessage.id, lastMessage.content);
    }
  }

  handleEvent(message) {
    const event = message.payload;
    if (event.eventType === 'node_update') {
      this.stats.activeNodes = event.nodeCount || 0;
      document.getElementById('activeNodes').textContent = this.stats.activeNodes;
    }
  }

  // Message Handling
  async sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();

    if (!content && this.attachments.length === 0) return;
    if (this.isLoading) return;

    // Hide welcome message
    const welcome = document.getElementById('welcomeMessage');
    if (welcome) {
      welcome.style.display = 'none';
    }

    // Add user message
    this.addMessage('user', content);

    // Clear input
    input.value = '';
    this.autoResize(input);

    // Show loading
    this.isLoading = true;
    this.updateSendButton();
    this.addTypingIndicator();

    // Send to server
    if (this.isConnected && this.ws) {
      this.sendToServer(content);
    } else {
      // Simulate response for demo
      setTimeout(() => {
        this.removeTypingIndicator();
        this.isLoading = false;
        this.updateSendButton();
        this.addMessage('assistant', 'I\'m currently disconnected from the server. Please check your connection settings.');
      }, 1000);
    }
  }

  sendToServer(content) {
    const provider = document.getElementById('providerSelect').value;
    const model = document.getElementById('modelSelect').value;

    const message = {
      messageId: this.generateId(),
      version: '1.0',
      type: 'MESSAGE',
      source: { clientId: this.settings.clientId, sessionId: this.sessionId || '' },
      timestamp: Date.now(),
      priority: 5,
      payload: {
        content,
        provider,
        model,
        stream: false,
        systemPrompt: this.settings.systemPrompt,
        extendedThinking: this.extendedThinking,
        attachments: this.attachments.map(a => ({ id: a.id, type: a.type }))
      }
    };

    this.ws.send(JSON.stringify(message));
    this.attachments = [];
    this.updateAttachmentsPreview();
  }

  addMessage(role, content, options = {}) {
    const id = this.generateId();
    const message = {
      id,
      role,
      content,
      timestamp: Date.now(),
      ...options
    };

    this.messages.push(message);
    this.renderMessage(message);
    this.scrollToBottom();

    return message;
  }

  renderMessage(message) {
    const container = document.getElementById('messagesContainer');
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.role}`;
    messageEl.id = `message-${message.id}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = message.role === 'user' ? 'U' : 'AI';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content';
    contentWrapper.innerHTML = this.formatContent(message.content);

    if (message.tokens || message.latency) {
      const meta = document.createElement('div');
      meta.className = 'message-meta';
      if (message.tokens) {
        meta.innerHTML += `<span>${message.tokens} tokens</span>`;
      }
      if (message.latency) {
        meta.innerHTML += `<span>${message.latency}ms</span>`;
      }
      contentWrapper.appendChild(meta);
    }

    messageEl.appendChild(avatar);
    messageEl.appendChild(contentWrapper);
    container.appendChild(messageEl);
  }

  updateMessageContent(id, content) {
    const el = document.querySelector(`#message-${id} .message-content`);
    if (el) {
      el.innerHTML = this.formatContent(content);
    }
  }

  formatContent(content) {
    // Basic markdown-like formatting
    let formatted = content
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    return formatted;
  }

  addTypingIndicator() {
    const container = document.getElementById('messagesContainer');
    const indicator = document.createElement('div');
    indicator.className = 'message assistant';
    indicator.id = 'typing-indicator';

    indicator.innerHTML = `
      <div class="message-avatar">AI</div>
      <div class="message-content">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;

    container.appendChild(indicator);
    this.scrollToBottom();
  }

  removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
  }

  // Conversations
  async newConversation() {
    this.conversationId = this.generateId();
    this.messages = [];
    this.clearMessages();

    // Show welcome message
    const welcome = document.getElementById('welcomeMessage');
    if (welcome) {
      welcome.style.display = 'block';
    }

    document.getElementById('chatTitle').textContent = 'New Conversation';
    this.saveConversation();
  }

  clearMessages() {
    const container = document.getElementById('messagesContainer');
    const welcome = document.getElementById('welcomeMessage');
    container.innerHTML = '';
    if (welcome) {
      container.appendChild(welcome);
    }
  }

  loadConversations() {
    try {
      const saved = localStorage.getItem('lsdamm-conversations');
      const conversations = saved ? JSON.parse(saved) : [];
      this.renderConversationsList(conversations);
    } catch {
      this.renderConversationsList([]);
    }
  }

  saveConversation() {
    if (!this.conversationId || this.messages.length === 0) return;

    const conversations = this.getConversations();
    const existingIndex = conversations.findIndex(c => c.id === this.conversationId);

    const conversation = {
      id: this.conversationId,
      title: this.messages[0]?.content.slice(0, 50) || 'New Conversation',
      messages: this.messages,
      provider: document.getElementById('providerSelect').value,
      model: document.getElementById('modelSelect').value,
      updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
      conversations[existingIndex] = conversation;
    } else {
      conversations.unshift(conversation);
    }

    // Keep only last 50 conversations
    const trimmed = conversations.slice(0, 50);
    localStorage.setItem('lsdamm-conversations', JSON.stringify(trimmed));
    this.renderConversationsList(trimmed);
  }

  getConversations() {
    try {
      const saved = localStorage.getItem('lsdamm-conversations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  loadConversation(id) {
    const conversations = this.getConversations();
    const conversation = conversations.find(c => c.id === id);

    if (conversation) {
      this.conversationId = conversation.id;
      this.messages = conversation.messages || [];

      // Hide welcome, render messages
      const welcome = document.getElementById('welcomeMessage');
      if (welcome) {
        welcome.style.display = 'none';
      }

      this.clearMessages();
      this.messages.forEach(msg => this.renderMessage(msg));

      document.getElementById('chatTitle').textContent = conversation.title;

      // Set provider/model
      if (conversation.provider) {
        document.getElementById('providerSelect').value = conversation.provider;
        this.changeProvider(conversation.provider);
      }
      if (conversation.model) {
        document.getElementById('modelSelect').value = conversation.model;
      }
    }
  }

  deleteConversation(id, event) {
    event.stopPropagation();

    const conversations = this.getConversations().filter(c => c.id !== id);
    localStorage.setItem('lsdamm-conversations', JSON.stringify(conversations));
    this.renderConversationsList(conversations);

    if (this.conversationId === id) {
      this.newConversation();
    }
  }

  renderConversationsList(conversations) {
    const list = document.getElementById('conversationsList');
    list.innerHTML = '';

    conversations.forEach(conv => {
      const item = document.createElement('div');
      item.className = `conversation-item ${conv.id === this.conversationId ? 'active' : ''}`;
      item.onclick = () => this.loadConversation(conv.id);

      item.innerHTML = `
        <span class="title">${this.escapeHtml(conv.title)}</span>
        <button class="delete-btn" onclick="app.deleteConversation('${conv.id}', event)">✕</button>
      `;

      list.appendChild(item);
    });
  }

  // Provider/Model Selection
  changeProvider(provider) {
    const modelSelect = document.getElementById('modelSelect');
    const models = this.models[provider] || [];

    modelSelect.innerHTML = '';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
  }

  // Extended Features
  toggleExtendedThinking() {
    this.extendedThinking = document.getElementById('extendedThinking').checked;
  }

  toggleShowChainOfThought() {
    this.showChainOfThought = document.getElementById('showChainOfThought').checked;
    if (this.showChainOfThought) {
      document.getElementById('thinkingPanel').classList.add('open');
    }
  }

  toggleThinkingPanel() {
    document.getElementById('thinkingPanel').classList.toggle('open');
  }

  displayChainOfThought(thinking) {
    const container = document.getElementById('thinkingContent');
    container.innerHTML = '';

    // Parse thinking into steps (simplified)
    const steps = thinking.split('\n\n').filter(s => s.trim());
    
    steps.forEach((step, i) => {
      const stepEl = document.createElement('div');
      stepEl.className = 'thought-step';
      stepEl.innerHTML = `
        <div class="step-type">Step ${i + 1}</div>
        <div class="step-content">${this.escapeHtml(step)}</div>
      `;
      container.appendChild(stepEl);
    });

    document.getElementById('thinkingPanel').classList.add('open');
  }

  // File Attachments
  attachFile() {
    document.getElementById('fileInput').click();
  }

  handleFileSelect(event) {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
      const attachment = {
        id: this.generateId(),
        name: file.name,
        type: file.type,
        size: file.size,
        file: file
      };

      this.attachments.push(attachment);
    });

    this.updateAttachmentsPreview();
    event.target.value = '';
  }

  updateAttachmentsPreview() {
    const container = document.getElementById('attachmentsPreview');
    container.innerHTML = '';

    this.attachments.forEach(att => {
      const preview = document.createElement('div');
      preview.className = 'attachment-preview';
      preview.innerHTML = `
        <span>📎 ${this.escapeHtml(att.name)}</span>
        <button class="remove-attachment" onclick="app.removeAttachment('${att.id}')">✕</button>
      `;
      container.appendChild(preview);
    });
  }

  removeAttachment(id) {
    this.attachments = this.attachments.filter(a => a.id !== id);
    this.updateAttachmentsPreview();
  }

  // UI Helpers
  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.getElementById('sidebar').classList.toggle('open');
  }

  handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }

  updateSendButton() {
    const btn = document.getElementById('sendBtn');
    btn.disabled = this.isLoading;
  }

  startWithPrompt(prompt) {
    document.getElementById('messageInput').value = prompt;
    document.getElementById('messageInput').focus();
  }

  showError(message) {
    this.removeTypingIndicator();
    this.isLoading = false;
    this.updateSendButton();
    this.addMessage('assistant', `Error: ${message}`);
  }

  // Utilities
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app
const app = new LSDammChatbot();
