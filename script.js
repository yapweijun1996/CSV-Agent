document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const messageList = document.getElementById('message-list');
  const thinkingLogList = document.getElementById('thinking-log-list');
  const toolPlanContent = document.getElementById('tool-plan-content');
  
  // --- Settings Modal Elements ---
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeBtn = document.querySelector('.modal-content .close-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const apiKeyInput = document.getElementById('api-key-input');
  const modelInput = document.getElementById('model-input');

  // --- Event Listeners ---
  sendBtn.addEventListener('click', handleSend);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  
  settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'block';
    const currentKey = localStorage.getItem('gemini-api-key');
    const currentModel = localStorage.getItem('gemini-model');
    if (currentKey) {
      apiKeyInput.value = currentKey;
    }
    if (currentModel) {
      modelInput.value = currentModel;
    }
  });

  closeBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target == settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  saveSettingsBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const selectedModel = modelInput.value.trim();
    if (apiKey) {
      localStorage.setItem('gemini-api-key', apiKey);
      localStorage.setItem('gemini-model', selectedModel);
      settingsModal.style.display = 'none';
      alert('Settings saved successfully!');
    } else {
      alert('Please enter a valid API Key.');
    }
  });

  // --- Core Functions ---

  /**
   * Handles the sending of a user's message.
   */
  async function handleSend() {
    const userInput = chatInput.value.trim();
    if (!userInput) return;

    // Add user message to UI
    addUserMessage(userInput);
    chatInput.value = '';
    toggleInput(false); // Disable input

    // Clear previous thinking logs and plans
    clearThinkingPanel();

    // Call the real LLM and render the response
    try {
      const llmResponse = await callGeminiApi(userInput);
      renderLlmResponse(llmResponse);
    } catch (error) {
      console.error("Error from LLM:", error);
      renderError(error.message || "Sorry, something went wrong.");
    } finally {
      toggleInput(true); // Re-enable input
    }
  }

  /**
   * Retrieves the Gemini API key from local storage.
   * @returns {string|null} The API key or null if not found.
   */
  function getApiKey() {
    // For this task, we'll pull from localStorage. A real app might use a more secure store.
    return localStorage.getItem('gemini-api-key');
  }

  /**
   * Constructs the system prompt to enforce the JSON contract.
   * @returns {string} The system prompt.
   */
  function getSystemPrompt() {
    return `You are the dialogue layer for an "ERP CSV Analyses Agent".
Your response MUST be a single, valid JSON object. Do not include any other text, explanations, or markdown formatting like \`\`\`json.

Your task is to:
1.  Restate the user's request in the 'restatement' field.
2.  Produce a user-readable reply in the 'visible_reply' field.
3.  Generate a brief, step-by-step thinking process in the 'thinking_log' array (e.g., "[read]...", "[intent]...", "[plan]...", "[decide]...").
4.  Create a tool plan in the 'tool_plan' array. This plan is for display only and will not be executed. Indicate if a tool is needed ('need_tool': true/false) and provide a reason.

The JSON structure must strictly follow this format:
{
  "restatement": "string",
  "visible_reply": "string",
  "thinking_log": ["string", "string", ...],
  "tool_plan": [
    { "need_tool": boolean, "tool": "string (optional)", "reason": "string" }
  ]
}`;
  }

  /**
   * Attempts to repair a malformed JSON string by extracting the content between the first '{' and last '}'.
   * @param {string} malformedJson - The potentially malformed JSON string.
   * @returns {object|null} The parsed JSON object or null if repair fails.
   */
  function repairJson(malformedJson) {
    try {
      const startIndex = malformedJson.indexOf('{');
      const endIndex = malformedJson.lastIndexOf('}');
      if (startIndex > -1 && endIndex > -1 && endIndex > startIndex) {
        const jsonSubstring = malformedJson.substring(startIndex, endIndex + 1);
        return JSON.parse(jsonSubstring);
      }
      return null;
    } catch (e) {
      console.error("JSON repair failed:", e);
      return null;
    }
  }

  /**
   * Calls the Gemini API with the user's input and a JSON contract.
   * @param {string} text - The user's input text.
   * @returns {Promise<object>} A promise that resolves with the LLM's parsed JSON response.
   */
  async function callGeminiApi(text) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("Gemini API key not found. Please set it in Settings.");
    }

    const model = localStorage.getItem('gemini-model') || 'gemini-pro';
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const systemPrompt = getSystemPrompt();

    const requestBody = {
      "contents": [
        {
          "parts": [
            { "text": systemPrompt },
            { "text": "User input: " + text }
          ]
        }
      ],
      "generationConfig": {
        "response_mime_type": "application/json",
      }
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error("Gemini API Error:", errorBody);
      throw new Error(`API request failed: ${errorBody.error?.message || response.statusText}`);
    }

    const responseData = await response.json();
    // In JSON mode, the response is a string that needs to be parsed.
    const jsonString = responseData.candidates[0].content.parts[0].text;

    try {
      return JSON.parse(jsonString);
    } catch (e) {
      console.warn("Initial JSON.parse failed, attempting to repair.", e);
      const repaired = repairJson(jsonString);
      if (repaired) {
        return repaired;
      }
      throw new Error("The model returned an invalid JSON response. Please try again.");
    }
  }

  // --- UI Rendering Functions ---

  /**
   * Adds a user's message to the message list.
   * @param {string} text - The text of the user's message.
   */
  function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.textContent = text;
    messageList.appendChild(messageDiv);
    scrollToBottom();
  }

  /**
   * Renders the complete response from the LLM.
   * @param {object} response - The JSON response from the LLM.
   */
  function renderLlmResponse(response) {
    // 1. Render the main chat message (restatement + visible reply)
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';

    const restatementDiv = document.createElement('div');
    restatementDiv.className = 'restatement';
    restatementDiv.textContent = response.restatement;

    const replyDiv = document.createElement('div');
    replyDiv.className = 'visible-reply';
    replyDiv.textContent = response.visible_reply;

    messageDiv.appendChild(restatementDiv);
    messageDiv.appendChild(replyDiv);
    messageList.appendChild(messageDiv);
    scrollToBottom();

    // 2. Render the thinking log
    thinkingLogList.innerHTML = ''; // Clear previous logs
    response.thinking_log.forEach(log => {
      const li = document.createElement('li');
      li.textContent = log;
      thinkingLogList.appendChild(li);
    });

    // 3. Render the tool plan
    const firstPlan = response.tool_plan && response.tool_plan[0];
    if (firstPlan) {
      if (firstPlan.need_tool && firstPlan.tool) {
        toolPlanContent.textContent = `Tool: ${firstPlan.tool} - Reason: ${firstPlan.reason}`;
      } else {
        toolPlanContent.textContent = `No tool needed. Reason: ${firstPlan.reason || 'No specific reason provided.'}`;
      }
    } else {
      toolPlanContent.textContent = 'No next step determined.';
    }
  }

  /**
   * Renders an error message in the chat.
   * @param {string} text - The error message to display.
   */
  function renderError(text) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message assistant error';
    errorDiv.textContent = text;
    messageList.appendChild(errorDiv);
    scrollToBottom();
  }

  /**
   * Clears the thinking log and tool plan displays.
   */
  function clearThinkingPanel() {
    thinkingLogList.innerHTML = '';
    toolPlanContent.textContent = '';
  }

  /**
   * Toggles the disabled state of the chat input and send button.
   * @param {boolean} isEnabled - Whether to enable or disable the inputs.
   */
  function toggleInput(isEnabled) {
    chatInput.disabled = !isEnabled;
    sendBtn.disabled = !isEnabled;
    chatInput.placeholder = isEnabled ? "Ask a question about your data..." : "Thinking...";
  }

  /**
   * Scrolls the message list to the bottom.
   */
  function scrollToBottom() {
    messageList.scrollTop = messageList.scrollHeight;
  }
});