document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const messageList = document.getElementById('message-list');
  const thinkingLogList = document.getElementById('thinking-log-list');
  const toolPlanContent = document.getElementById('tool-plan-content');
  const toolPlanText = document.getElementById('tool-plan-text') || toolPlanContent;
  const toolPlanSpinner = document.getElementById('tool-plan-spinner');
  if (toolPlanSpinner) {
    toolPlanSpinner.setAttribute('aria-hidden', 'true');
  }
  const resizer = document.getElementById('resizer');
  const assistantSidebar = document.getElementById('assistant-sidebar');
  const rootStyle = document.documentElement;

  // --- Tool Registry & State ---
  const TOOL_ALIASES = {
    'get_current_date': 'get_current_date',
    'clock.now': 'get_current_date',
    'time.now': 'get_current_date',
    'get_time': 'get_current_date'
  };

  const TIME_INTENT_KEYWORDS = [
    'time',
    'date',
    'today',
    'now',
    '現在',
    '時間',
    '日期',
    '今天',
    'what time',
    'clock'
  ];

  const TOOL_REGISTRY = {
    get_current_date: {
      label: 'get_current_date',
      async run() {
        const now = new Date();
        return {
          iso: now.toISOString(),
          local: now.toLocaleString(),
          epochMs: now.getTime()
        };
      }
    }
  };

  let activeTurn = null;
  const turnHistory = [];
  
  // --- Settings Modal Elements ---
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeBtn = document.querySelector('.modal-content .close-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const apiKeyInput = document.getElementById('api-key-input');
  const modelInput = document.getElementById('model-input');

  // --- Resizer State ---
  const MIN_ASSISTANT_WIDTH = 280;
  const MAX_ASSISTANT_WIDTH = 640;
  const KEYBOARD_RESIZE_STEP = 24;
  const resizeState = {
    active: false,
    pointerId: null,
    startX: 0,
    startWidth: 0,
    latestWidth: getCurrentAssistantWidth()
  };

  if (resizer && assistantSidebar) {
    resizer.setAttribute('aria-valuemin', String(MIN_ASSISTANT_WIDTH));
    resizer.setAttribute('aria-valuemax', String(MAX_ASSISTANT_WIDTH));
    resizer.setAttribute('aria-valuenow', String(resizeState.latestWidth));

    resizer.addEventListener('pointerdown', handleResizeStart);
    resizer.addEventListener('pointermove', handlePointerMove);
    resizer.addEventListener('pointerup', handleResizeEnd);
    resizer.addEventListener('lostpointercapture', handleResizeCancel);
    resizer.addEventListener('keydown', handleResizerKeypress);
    window.addEventListener('pointerup', handleResizeEnd);
  }

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

  // --- Resizer Functions ---

  function handleResizeStart(event) {
    if (!assistantSidebar || !resizer) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    resizeState.active = true;
    resizeState.pointerId = event.pointerId;
    resizeState.startX = event.clientX;
    resizeState.startWidth = assistantSidebar.getBoundingClientRect().width;
    resizer.classList.add('is-active');
    document.body.classList.add('is-resizing');
    resizer.setPointerCapture(event.pointerId);
    logUiEvent(`[layout] 開始調整側欄（${Math.round(resizeState.startWidth)}px）`);
  }

  function handlePointerMove(event) {
    if (!resizeState.active || !assistantSidebar) return;
    const delta = event.clientX - resizeState.startX;
    const desiredWidth = resizeState.startWidth - delta;
    updateAssistantWidth(desiredWidth);
  }

  function handleResizeEnd() {
    if (!resizeState.active) return;
    finalizeResize(false);
  }

  function handleResizeCancel() {
    if (!resizeState.active) return;
    finalizeResize(true);
  }

  function finalizeResize(cancelled) {
    if (!resizer) return;
    if (resizeState.pointerId !== null) {
      try {
        resizer.releasePointerCapture(resizeState.pointerId);
      } catch (error) {
        console.warn('Pointer capture release failed:', error);
      }
    }

    resizeState.active = false;
    resizeState.pointerId = null;
    resizer.classList.remove('is-active');
    document.body.classList.remove('is-resizing');

    if (cancelled) {
      logUiEvent('[layout] 已取消側欄調整');
      return;
    }

    logUiEvent(`[layout] 側欄寬度設定為 ${Math.round(resizeState.latestWidth)}px`);
  }

  function handleResizerKeypress(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
    const nextWidth = updateAssistantWidth(resizeState.latestWidth + delta);
    logUiEvent(`[layout] 鍵盤調整至 ${Math.round(nextWidth)}px`);
  }

  function updateAssistantWidth(width) {
    const clampedWidth = clamp(width, MIN_ASSISTANT_WIDTH, MAX_ASSISTANT_WIDTH);
    rootStyle.style.setProperty('--assistant-width', `${clampedWidth}px`);
    resizeState.latestWidth = clampedWidth;
    if (resizer) {
      resizer.setAttribute('aria-valuenow', String(Math.round(clampedWidth)));
    }
    return clampedWidth;
  }

  function getCurrentAssistantWidth() {
    const raw = getComputedStyle(rootStyle).getPropertyValue('--assistant-width');
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return 400;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function logUiEvent(message) {
    appendThinkingLogEntry(message);
  }

  function appendThinkingLogEntry(text) {
    if (!thinkingLogList) return;
    const li = document.createElement('li');
    li.textContent = text;
    thinkingLogList.appendChild(li);
    thinkingLogList.scrollTop = thinkingLogList.scrollHeight;
  }

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
      await renderLlmResponse(llmResponse, userInput);
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
Your entire output MUST be a single JSON object (no prose, no markdown fences). Use this schema exactly:
{
  "restatement": "string",
  "visible_reply": "string",
  "thinking_log": ["string", "..."],
  "tool_plan": [
    { "need_tool": boolean, "tool": "string (optional)", "reason": "string" }
  ]
}

Guidelines:
1. Restate the user's intent in 'restatement'.
2. 'visible_reply' must be what the user will read. When you expect a tool result, reference placeholders so the host can inject data, e.g. "Current time is {{tool_result.local}} (ISO: {{tool_result.iso}})."
3. 'thinking_log' is a concise step-by-step trace using bracketed tags such as "[read] ...", "[intent] ...", "[plan] ...", "[decide] ...".
4. 'tool_plan' ALWAYS contains at least one object describing your next action.

About tools:
- Any tool you list WILL be executed by the host system. Do not claim you lack real-time capabilities; rely on the tool output instead.
- Supported tool ids: "get_current_date", "clock.now", "time.now", "get_time" (these are aliases of the same clock tool). Pick one of them whenever the user asks for the current date/time.
- When no tool is needed, set "need_tool": false and clearly explain why in "reason".
- When a tool is needed, set "need_tool": true, specify the tool id, and describe what data you expect to place into the visible reply via {{tool_result.local}} / {{tool_result.iso}} / {{tool_result.epochMs}} placeholders.

Never return explanatory text outside the JSON object.`;
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
   * Safely walks nested properties/indices on the Gemini response.
   * @param {object} root - The value to traverse.
   * @param {Array<string|number>} path - Ordered list of keys/indices.
   * @param {string} [label] - Human readable path for error messaging.
   * @returns {*} - The resolved value.
   */
  function safeGet(root, path, label) {
    if (!Array.isArray(path) || path.length === 0) {
      throw new Error('非預期回應：path 參數無效');
    }

    let current = root;
    for (const rawKey of path) {
      const key = typeof rawKey === 'number' ? rawKey : String(rawKey);
      if (current === null || current === undefined || !(key in current)) {
        const humanReadable = label || path.join('.');
        throw new Error(`非預期回應：缺少 ${humanReadable}`);
      }
      current = current[key];
    }
    return current;
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

    let jsonString;
    try {
      // In JSON mode, the response is a string that needs to be parsed.
      jsonString = safeGet(
        responseData,
        ['candidates', 0, 'content', 'parts', 0, 'text'],
        'candidates[0].content.parts[0].text'
      );
    } catch (structureError) {
      console.error('Gemini response missing required fields:', structureError, responseData);
      throw new Error('非預期回應：請稍後再試。');
    }

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
   * Renders the complete response from the LLM and optionally executes tools.
   * @param {object} response - The JSON response from the LLM.
   * @param {string} userInput - The original user prompt.
   */
  async function renderLlmResponse(response, userInput) {
    const turn = startNewTurn();

    // 1. Render the main chat message (restatement + visible reply)
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';

    const restatementDiv = document.createElement('div');
    restatementDiv.className = 'restatement';
    restatementDiv.textContent = response.restatement;

    const replyDiv = document.createElement('div');
    replyDiv.className = 'visible-reply';
    replyDiv.textContent = response.visible_reply;
    replyDiv.dataset.template = response.visible_reply || '';

    const toolResultDiv = document.createElement('div');
    toolResultDiv.className = 'tool-result';
    toolResultDiv.dataset.visible = 'false';

    messageDiv.appendChild(restatementDiv);
    messageDiv.appendChild(replyDiv);
    messageDiv.appendChild(toolResultDiv);
    messageList.appendChild(messageDiv);
    scrollToBottom();

    // 2. Render the thinking log
    thinkingLogList.innerHTML = '';
    (response.thinking_log || []).forEach(log => {
      const li = document.createElement('li');
      li.textContent = log;
      thinkingLogList.appendChild(li);
    });

    // 3. Render the tool plan + execution
    const planEntry = Array.isArray(response.tool_plan) ? response.tool_plan[0] : null;
    if (!planEntry) {
      setToolPlanMessage('No next step determined.');
      finishTurn(turn);
      return;
    }

    if (!planEntry.need_tool) {
      setToolPlanMessage(`No tool needed. Reason: ${planEntry.reason || 'No specific reason provided.'}`);
      finishTurn(turn);
      return;
    }

    const resolvedTool = resolveToolFromPlan(planEntry, response, userInput);
    if (!resolvedTool) {
      handleUnsupportedTool(planEntry);
      finishTurn(turn);
      return;
    }

    if (resolvedTool.inferred) {
      appendThinkingLogEntry('[plan] 推斷時間意圖，改用 get_current_date');
    }

    await executeToolWithUi(resolvedTool.name, planEntry.reason, {
      turn,
      toolResultDiv,
      replyElement: replyDiv
    });
    finishTurn(turn);
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
    setToolPlanMessage('Awaiting plan...');
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

  async function executeToolWithUi(toolName, reason, context) {
    const tool = TOOL_REGISTRY[toolName];
    if (!tool) {
      handleUnsupportedTool({ tool: toolName, reason });
      return;
    }

    showToolPlanExecuting(toolName, reason);
    context.turn.toolRuns.push({ tool: toolName, status: 'started' });

    try {
      const result = await tool.run();
      const readable = formatToolResult(result);
      context.turn.toolRuns[context.turn.toolRuns.length - 1] = {
        tool: toolName,
        status: 'succeeded',
        result
      };
      appendThinkingLogEntry(`[tool] ${toolName} → ${readable}`);
      appendThinkingLogEntry('[decide] fulfilled');
      revealToolResult(context.toolResultDiv, readable, false);
      showToolPlanExecuted(toolName);
      updateVisibleReplyWithToolResult(context.replyElement, result);
    } catch (error) {
      console.error(`Tool ${toolName} failed:`, error);
      context.turn.toolRuns[context.turn.toolRuns.length - 1] = {
        tool: toolName,
        status: 'failed',
        error: error.message || 'unknown error'
      };
      appendThinkingLogEntry(`[error] ${toolName} failed`);
      revealToolResult(context.toolResultDiv, 'unavailable', true);
      showToolPlanFailure(toolName);
      updateVisibleReplyWithToolResult(context.replyElement, null, { fallbackValue: 'unavailable' });
    }
  }

  function resolveToolFromPlan(planEntry, response, userInput) {
    const normalized = normalizeToolName(planEntry.tool);
    if (normalized) {
      return { name: normalized, inferred: false };
    }
    if (!planEntry.need_tool) {
      return null;
    }

    const text = aggregateIntentText(planEntry, response, userInput);
    const matchesIntent = TIME_INTENT_KEYWORDS.some(keyword => text.includes(keyword));
    if (matchesIntent) {
      return { name: 'get_current_date', inferred: true };
    }
    return null;
  }

  function normalizeToolName(rawName) {
    if (!rawName || typeof rawName !== 'string') {
      return null;
    }
    const key = rawName.trim().toLowerCase();
    return TOOL_ALIASES[key] || null;
  }

  function aggregateIntentText(planEntry, response, userInput) {
    return [
      planEntry.reason,
      response?.restatement,
      response?.visible_reply,
      userInput
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function handleUnsupportedTool(planEntry) {
    const label = planEntry.tool || 'unspecified';
    appendThinkingLogEntry(`[warn] unsupported tool: ${label}`);
    const suffix = planEntry.reason ? ` - ${planEntry.reason}` : '';
    setToolPlanMessage(`Unsupported tool: ${label}${suffix}`);
  }

  function showToolPlanExecuting(toolName, reason) {
    const suffix = reason ? ` - ${reason}` : '';
    setToolPlanMessage(`Tool: ${toolName}${suffix}`, { spinner: true });
  }

  function showToolPlanExecuted(toolName) {
    setToolPlanMessage(`Executed: ${toolName}`);
  }

  function showToolPlanFailure(toolName) {
    setToolPlanMessage(`Failed: ${toolName}`);
  }

  function setToolPlanMessage(text, options = {}) {
    if (toolPlanText) {
      toolPlanText.textContent = text;
    } else if (toolPlanContent) {
      toolPlanContent.textContent = text;
    }
    if (toolPlanSpinner) {
      const showSpinner = Boolean(options.spinner);
      toolPlanSpinner.classList.toggle('is-visible', showSpinner);
      toolPlanSpinner.setAttribute('aria-hidden', showSpinner ? 'false' : 'true');
    }
  }

  function revealToolResult(element, value, isError = false) {
    if (!element) return;
    element.textContent = `Result: ${value}`;
    element.dataset.visible = 'true';
    if (isError) {
      element.classList.add('is-error');
    } else {
      element.classList.remove('is-error');
    }
  }

  function updateVisibleReplyWithToolResult(element, toolResult, options = {}) {
    if (!element) return;
    const template = element.dataset.template || element.textContent || '';
    if (typeof template !== 'string' || template.length === 0) {
      return;
    }
    const fallbackValue = options.fallbackValue || 'unavailable';
    const hydrated = applyToolResultPlaceholders(template, toolResult, fallbackValue);
    element.textContent = hydrated;
  }

  function applyToolResultPlaceholders(template, toolResult, fallbackValue = 'unavailable') {
    if (typeof template !== 'string' || template.length === 0) {
      return template;
    }
    const safeResult = toolResult || {};
    const PLACEHOLDER_REGEX = /\{\{\s*tool_result\.([a-zA-Z0-9_]+)\s*\}\}/g;
    return template.replace(PLACEHOLDER_REGEX, (_, rawKey) => {
      const key = rawKey.trim();
      if (!key) {
        return fallbackValue;
      }
      const value = safeResult[key];
      if (value === undefined || value === null) {
        return fallbackValue;
      }
      return String(value);
    });
  }

  function formatToolResult(result) {
    if (!result) return 'unavailable';
    return result.local || result.iso || String(result.epochMs);
  }

  function startNewTurn() {
    const turn = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      toolRuns: []
    };
    activeTurn = turn;
    turnHistory.push(turn);
    if (turnHistory.length > 10) {
      turnHistory.shift();
    }
    return turn;
  }

  function finishTurn(turn) {
    if (activeTurn && activeTurn.id === turn.id) {
      activeTurn = null;
    }
  }
});
