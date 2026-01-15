/**
 * LSDAMM Chat Panel - Client-side JavaScript
 * Handles webview interactions
 */

(function() {
  const vscode = acquireVsCodeApi();

  const messagesContainer = document.getElementById('messagesContainer');
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const extendedThinkingCheckbox = document.getElementById('extendedThinking');
  const modelSelect = document.getElementById('modelSelect');

  let isConnected = false;

  // Handle messages from extension
  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
      case 'statusUpdate':
        updateStatus(message.connected);
        break;
      case 'thinking':
        addThinkingMessage(message.messageId);
        break;
      case 'response':
        removeThinkingMessage();
        addMessage('assistant', message.content);
        break;
      case 'error':
        removeThinkingMessage();
        addMessage('error', message.content);
        break;
    }
  });

  // Send button click
  sendButton.addEventListener('click', () => {
    sendMessage();
  });

  // Input keydown
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Initialize status check
  vscode.postMessage({ type: 'getStatus' });

  function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;

    if (!isConnected) {
      addMessage('error', 'Not connected to mesh server. Use command palette to connect.');
      return;
    }

    // Add user message to UI
    addMessage('user', content);
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Send to extension
    vscode.postMessage({
      type: 'sendMessage',
      content: content,
      options: {
        extendedThinking: extendedThinkingCheckbox.checked,
        provider: modelSelect.value || undefined
      }
    });
  }

  function updateStatus(connected) {
    isConnected = connected;
    if (connected) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected';
      sendButton.disabled = false;
    } else {
      statusDot.className = 'status-dot';
      statusText.textContent = 'Disconnected';
      sendButton.disabled = true;
    }
  }

  function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    roleDiv.textContent = role === 'user' ? 'You' : 
                          role === 'assistant' ? 'AI' : 
                          role === 'error' ? 'Error' : role;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Simple markdown-like formatting
    const formattedContent = formatContent(content);
    contentDiv.innerHTML = formattedContent;
    
    messageDiv.appendChild(roleDiv);
    messageDiv.appendChild(contentDiv);
    
    // Remove welcome message if present
    const welcomeMsg = messagesContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
      welcomeMsg.remove();
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function addThinkingMessage(messageId) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-thinking';
    messageDiv.id = `thinking-${messageId}`;
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    roleDiv.textContent = 'AI';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content thinking-animation';
    contentDiv.innerHTML = '<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span> Thinking...';
    
    messageDiv.appendChild(roleDiv);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function removeThinkingMessage() {
    const thinkingMessages = messagesContainer.querySelectorAll('.message-thinking');
    thinkingMessages.forEach(msg => msg.remove());
  }

  function formatContent(content) {
    // Escape HTML
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Format code blocks
    let formatted = escaped.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });
    
    // Format inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Format bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Format italic
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Format newlines
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }

  // Auto-resize textarea
  messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
  });
})();
