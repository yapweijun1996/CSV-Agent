  const resizer = document.getElementById('resizer');
  const mainLayout = document.getElementById('main-layout');
  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', () => {
      isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
    }, { once: true });
  });

  function handleMouseMove(e) {
    if (!isResizing) return;
    const sidebarWidth = window.innerWidth - e.clientX - (resizer.offsetWidth / 2);
    if (sidebarWidth > 200 && sidebarWidth < window.innerWidth - 300) { // Min/max widths
      mainLayout.style.gridTemplateColumns = `1fr 5px ${sidebarWidth}px`;
    }
  }
  const sendBtn = document.getElementById('send-btn');
  const chatInput = document.getElementById('chat-input');
  const messageList = document.getElementById('message-list');

  function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    // A simple way to prevent HTML injection, though not foolproof for complex cases.
    messageDiv.textContent = text;
    messageList.appendChild(messageDiv);
    messageList.scrollTop = messageList.scrollHeight; // Auto-scroll to bottom
  }

  function handleSend() {
    const text = chatInput.value.trim();
    if (text) {
      addMessage(text, 'user');
      chatInput.value = '';
      
      // Simulate assistant response
      setTimeout(() => {
        addMessage("Thinking...", 'assistant');
      }, 500);
      setTimeout(() => {
        addMessage("This is a simulated response based on your query: '" + text + "'", 'assistant');
      }, 1500);
    }
  }

  sendBtn.addEventListener('click', handleSend);
  chatInput.addEventListener('keydown', (e) => {
    // Send on Enter, but allow new lines with Shift+Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevents adding a new line
      handleSend();
    }
  });
  // Button functionalities
  const settingsBtn = document.getElementById('settings-btn');
  const hideAssistantBtn = document.getElementById('hide-assistant-btn');
  const assistantSidebar = document.getElementById('assistant-sidebar');
  const resizerEl = document.getElementById('resizer');
  const settingsModal = document.getElementById('settings-modal');
  const closeBtn = document.querySelector('.close-btn');

  hideAssistantBtn.addEventListener('click', () => {
    const isHidden = assistantSidebar.style.display === 'none';
    if (isHidden) {
      assistantSidebar.style.display = 'flex';
      resizerEl.style.display = 'block';
      mainLayout.style.gridTemplateColumns = `1fr 5px 400px`;
      hideAssistantBtn.textContent = 'Hide Assistant';
    } else {
      assistantSidebar.style.display = 'none';
      resizerEl.style.display = 'none';
      mainLayout.style.gridTemplateColumns = `1fr`;
      hideAssistantBtn.textContent = 'Show Assistant';
    }
  });

  settingsBtn.addEventListener('click', () => {
    // Load settings from localStorage when the modal is opened
    document.getElementById('api-key-input').value = localStorage.getItem('GEMINI_API_KEY') || '';
    const useLocalKey = localStorage.getItem('USE_LOCAL_KEY');
    document.getElementById('use-local-key-switch').checked = useLocalKey === null || useLocalKey === 'true';
    settingsModal.style.display = 'block';
  });

  closeBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target == settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  const saveSettingsBtn = document.getElementById('save-settings-btn');
  saveSettingsBtn.addEventListener('click', () => {
    const apiKey = document.getElementById('api-key-input').value.trim();
    const useLocalKey = document.getElementById('use-local-key-switch').checked;

    if (apiKey) {
      localStorage.setItem('GEMINI_API_KEY', apiKey);
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
    }
    localStorage.setItem('USE_LOCAL_KEY', useLocalKey);
    
    alert('Settings saved!');
    settingsModal.style.display = 'none';
  });

  const testConnectionBtn = document.getElementById('test-connection-btn');
  testConnectionBtn.addEventListener('click', async () => {
    const apiKey = document.getElementById('api-key-input').value.trim();
    if (!apiKey) {
      alert('Please enter an API key first.');
      return;
    }

    // This is a placeholder for the actual API call.
    // In a real scenario, you would use a library like `google-auth-library`
    // or a direct fetch call to a Gemini endpoint.
    alert('Testing connection...');
    try {
      // Simulate a successful API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      // We'll just hardcode the success message for now.
      alert('Connection successful! Gemini is READY.');
    } catch (error) {
      alert('Connection failed. Please check your API key and network.');
      console.error('Connection test failed:', error);
    }
  });