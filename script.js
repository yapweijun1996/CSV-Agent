document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const messageList = document.getElementById('message-list');
  const thinkingLogList = document.getElementById('thinking-log-list');
  const thinkingLogToggle = document.getElementById('thinking-log-toggle');
  const thinkingLogBody = document.getElementById('thinking-log-body');
  const toolPlanContent = document.getElementById('tool-plan-content');
  const toolPlanText = document.getElementById('tool-plan-text') || toolPlanContent;
  const toolPlanSpinner = document.getElementById('tool-plan-spinner');
  const toolDetailsToggle = document.getElementById('tool-details-toggle');
  const toolDetailsBody = document.getElementById('tool-details-body');
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
    'get_time': 'get_current_date',
    'js.run_sandbox': 'js.run_sandbox'
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
    },
    'js.run_sandbox': {
      label: 'js.run_sandbox',
      /**
       * Runs untrusted math/array snippets inside an isolated worker.
       * @param {object} payload - Sanitized args from the LLM plan.
       */
      async run(payload) {
        return runSandboxSnippet(payload || {});
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

  initializeCollapsible(thinkingLogBody, thinkingLogToggle, true);
  initializeCollapsible(toolDetailsBody, toolDetailsToggle, false);

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

  function initializeCollapsible(container, toggleBtn, expandedByDefault) {
    if (!container || !toggleBtn) return;
    toggleBtn.addEventListener('click', () => handleCollapsibleToggle(container, toggleBtn));
    setCollapsibleState(container, toggleBtn, expandedByDefault);
  }

  function handleCollapsibleToggle(container, toggleBtn) {
    if (!container || !toggleBtn) return;
    const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    setCollapsibleState(container, toggleBtn, !isExpanded);
  }

  function setCollapsibleState(container, toggleBtn, expanded) {
    if (!container || !toggleBtn) return;
    container.classList.toggle('is-collapsed', !expanded);
    container.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggleBtn.textContent = expanded ? 'Hide' : 'Show';
  }

  function clearToolDetails() {
    if (!toolDetailsBody) return;
    toolDetailsBody.innerHTML = '<p class="tool-details-empty">No tool executions yet.</p>';
    if (toolDetailsToggle) {
      setCollapsibleState(toolDetailsBody, toolDetailsToggle, false);
    } else {
      toolDetailsBody.classList.add('is-collapsed');
      toolDetailsBody.setAttribute('aria-hidden', 'true');
    }
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
5. 'visible_reply' must NEVER say you lack real-time data; rely on {{tool_result.*}} placeholders instead of refusing.

About tools:
- Any tool you list WILL be executed by the host system. Do not claim you lack real-time capabilities; rely on the tool output instead.
- Supported tool ids: "get_current_date", "clock.now", "time.now", "get_time" (these are aliases of the same clock tool) and "js.run_sandbox" for pure math/array/date snippets that must run inside a compute-only worker.
- When you use "js.run_sandbox", include an "args" object with: { "code": "string <=500 chars", "args": { ...optional data... }, "timeoutMs": number <=1500 }. The snippet can use Math/Date/JSON/etc, must be synchronous, and should "return" the value you want to show via {{tool_result.result}}.
- Snippets cannot touch DOM, storage, network, or browser APIs such as fetch/XMLHttpRequest/WebSocket/importScripts/indexedDB/caches/navigator.*; attempting to do so will raise a forbidden_api error.
- When no tool is needed, set "need_tool": false and clearly explain why in "reason".
- When a tool is needed, set "need_tool": true, specify the tool id, and describe what data you expect to place into the visible reply via {{tool_result.local}} / {{tool_result.iso}} / {{tool_result.epochMs}} / {{tool_result.result}} placeholders as appropriate.

Contract enforcement:
- The host strictly validates this schema. Missing fields, wrong types, or empty tool plans will terminate the turn.
- Any user request for current date/time/clock (English or Chinese) MUST set "need_tool": true, choose one of the supported tool ids, and explain how its output will be used. Saying you cannot provide real-time data counts as a breach.
- Whenever "need_tool" is true you must include the supported tool id ("get_current_date", "clock.now", "time.now", "get_time"). No other ids will run.
- If you truly do not need a tool, set "need_tool": false and provide a concrete, referenceable reason in "reason".

Never return explanatory text outside the JSON object.`;
  }

  /**
   * Attempts to repair a malformed JSON string by extracting the content between the first '{' and last '}'
   * and then applying light heuristics (dangling comma removal, inferred commas inside arrays).
   * @param {string} malformedJson - The potentially malformed JSON string.
   * @returns {object|null} The parsed JSON object or null if repair fails.
   */
  function repairJson(malformedJson) {
    if (typeof malformedJson !== 'string') {
      return null;
    }

    const startIndex = malformedJson.indexOf('{');
    const endIndex = malformedJson.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return null;
    }

    const candidate = malformedJson.substring(startIndex, endIndex + 1);
    const attempts = [candidate, ...generateJsonRepairCandidates(candidate)];
    let lastError = null;

    for (const attempt of attempts) {
      if (!attempt) continue;
      try {
        return JSON.parse(attempt);
      } catch (parseError) {
        lastError = parseError;
        continue;
      }
    }

    if (lastError) {
      console.error('JSON repair failed:', lastError);
    }
    return null;
  }

  /**
   * Validates the LLM response against the enforced schema so UI rendering never runs bad data.
   * @param {object} payload - Raw JSON parsed from Gemini.
   * @returns {object} Sanitized payload guaranteed to match the contract.
   */
  function validateGeminiResponse(payload) {
    const errors = [];
    const sanitized = {
      restatement: '',
      visible_reply: '',
      thinking_log: [],
      tool_plan: []
    };

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      errors.push('response 必須為物件');
    }

    const restatement = typeof payload?.restatement === 'string' ? payload.restatement.trim() : '';
    if (restatement) {
      sanitized.restatement = restatement;
    } else {
      errors.push('restatement 缺少或非字串');
    }

    const visibleReply = typeof payload?.visible_reply === 'string' ? payload.visible_reply.trim() : '';
    if (visibleReply) {
      sanitized.visible_reply = visibleReply;
    } else {
      errors.push('visible_reply 缺少或非字串');
    }

    if (Array.isArray(payload?.thinking_log)) {
      const sanitizedLogs = [];
      payload.thinking_log.forEach((entry, index) => {
        if (typeof entry !== 'string') {
          errors.push(`thinking_log[${index}] 必須為字串`);
          return;
        }
        sanitizedLogs.push(entry.trim() || entry);
      });
      sanitized.thinking_log = sanitizedLogs;
    } else {
      errors.push('thinking_log 必須為字串陣列');
    }

    if (Array.isArray(payload?.tool_plan) && payload.tool_plan.length > 0) {
      const sanitizedPlan = [];
      payload.tool_plan.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push(`tool_plan[${index}] 必須為物件`);
          return;
        }

        if (typeof entry.need_tool !== 'boolean') {
          errors.push(`tool_plan[${index}].need_tool 必須為布林值`);
        }

        const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
        if (!reason) {
          errors.push(`tool_plan[${index}].reason 缺少或為空`);
        }

        const toolId = typeof entry.tool === 'string' ? entry.tool.trim() : '';
        const sanitizedEntry = {
          need_tool: entry.need_tool === true,
          reason
        };
        if (toolId) {
          sanitizedEntry.tool = toolId;
        }
        if (entry.hasOwnProperty('args')) {
          if (entry.args && typeof entry.args === 'object' && !Array.isArray(entry.args)) {
            try {
              sanitizedEntry.args = JSON.parse(JSON.stringify(entry.args));
            } catch (cloneError) {
              errors.push(`tool_plan[${index}].args 無法序列化`);
            }
          } else if (entry.args === null) {
            sanitizedEntry.args = null;
          } else {
            errors.push(`tool_plan[${index}].args 必須為物件或省略`);
          }
        }
        sanitizedPlan.push(sanitizedEntry);
      });
      sanitized.tool_plan = sanitizedPlan;
    } else {
      errors.push('tool_plan 必須為至少一個項目的陣列');
    }

    if (errors.length) {
      console.warn('Gemini schema violation:', errors, payload);
      throw new Error(`合約錯誤：${errors.join('；')}`);
    }

    return sanitized;
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

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(jsonString);
    } catch (e) {
      console.warn("Initial JSON.parse failed, attempting to repair.", e);
      const repaired = repairJson(jsonString);
      if (repaired) {
        return validateGeminiResponse(repaired);
      }
      throw new Error("The model returned an invalid JSON response. Please try again.");
    }

    return validateGeminiResponse(parsedPayload);
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
      replyElement: replyDiv,
      planEntry
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
    if (thinkingLogList) {
      thinkingLogList.innerHTML = '';
    }
    setToolPlanMessage('Awaiting plan...');
    clearToolDetails();
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

    let toolInput;
    try {
      toolInput = prepareToolInput(toolName, context.planEntry);
    } catch (inputError) {
      console.error(`Tool ${toolName} input error:`, inputError);
      appendThinkingLogEntry(`[error] ${toolName} args invalid`);
      revealToolResult(context.toolResultDiv, 'unavailable', true);
      showToolPlanFailure(toolName);
      setToolPlanMessage(`Failed: ${toolName} - ${inputError.message}`);
      return;
    }

    showToolPlanExecuting(toolName, reason);
    appendThinkingLogEntry(`[tool] ${toolName} start`);
    context.turn.toolRuns.push({ tool: toolName, status: 'started', args: toolInput });

    try {
      const result = await tool.run(toolInput);
      const readable = formatToolResult(toolName, result);
      context.turn.toolRuns[context.turn.toolRuns.length - 1] = {
        tool: toolName,
        status: 'succeeded',
        result
      };
      appendThinkingLogEntry(`[tool] ${toolName} → ${readable}`);
      if (Array.isArray(result?.logs) && result.logs.length) {
        appendThinkingLogEntry(`[log] ${JSON.stringify(result.logs).slice(0, 200)}`);
      }
      if (result?.stringified) {
        appendThinkingLogEntry('[guard] stringified result');
      }
      appendThinkingLogEntry('[decide] fulfilled');
      revealToolResult(context.toolResultDiv, readable, false);
      showToolPlanExecuted(toolName);
      updateVisibleReplyWithToolResult(context.replyElement, result);
      renderToolDetails({
        tool: toolName,
        status: 'succeeded',
        reason,
        input: toolInput,
        result,
        logs: result?.logs,
        timeMs: typeof result?.timeMs === 'number' ? result.timeMs : undefined,
        timeoutMs: toolInput?.timeoutMs,
        stringified: Boolean(result?.stringified)
      });
    } catch (error) {
      console.error(`Tool ${toolName} failed:`, error);
      const errorCode = error?.code || 'runtime_error';
      const detailMessage = error?.message || 'unknown error';
      context.turn.toolRuns[context.turn.toolRuns.length - 1] = {
        tool: toolName,
        status: 'failed',
        error: detailMessage,
        code: errorCode
      };
      appendThinkingLogEntry(`[error] ${toolName} ${errorCode}`);
      revealToolResult(context.toolResultDiv, 'unavailable', true);
      showToolPlanFailure(`${toolName} (${errorCode})`);
      updateVisibleReplyWithToolResult(context.replyElement, null, { fallbackValue: 'unavailable' });
      renderToolDetails({
        tool: toolName,
        status: 'failed',
        reason,
        input: toolInput,
        error: {
          code: errorCode,
          detail: detailMessage
        },
        timeoutMs: toolInput?.timeoutMs
      });
    }
  }

  function prepareToolInput(toolName, planEntry = {}) {
    if (toolName === 'js.run_sandbox') {
      return sanitizeSandboxArgs(planEntry.args);
    }
    return {};
  }

  function sanitizeSandboxArgs(rawArgs) {
    const source = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {};
    const code = typeof source.code === 'string' ? source.code.trim() : '';
    if (!code) {
      throw new Error('js.run_sandbox 需要 code 字串');
    }
    if (code.length > 500) {
      throw new Error('code 必須 <= 500 字元');
    }

    let argsPayload = {};
    if (source.args && typeof source.args === 'object' && !Array.isArray(source.args)) {
      try {
        argsPayload = JSON.parse(JSON.stringify(source.args));
      } catch (cloneError) {
        throw new Error('args 需為可序列化物件');
      }
    } else if (source.args === undefined || source.args === null) {
      argsPayload = {};
    } else {
      throw new Error('args 必須為物件');
    }

    let timeoutMs = 500;
    if (typeof source.timeoutMs === 'number' && Number.isFinite(source.timeoutMs)) {
      timeoutMs = clamp(source.timeoutMs, 50, 1500);
    }

    return {
      code,
      args: argsPayload,
      timeoutMs
    };
  }

  async function runSandboxSnippet(config) {
    if (typeof Worker === 'undefined') {
      const unavailable = new Error('sandbox worker unavailable');
      unavailable.code = 'sandbox_unavailable';
      throw unavailable;
    }

    const { worker, revokeUrl } = createSandboxWorker();

    return new Promise((resolve, reject) => {
      const logs = [];
      const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      let settled = false;

      const cleanup = () => {
        try {
          worker.terminate();
        } catch (terminateError) {
          console.warn('sandbox termination failed:', terminateError);
        }
        revokeUrl();
      };

      const finishSuccess = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        const timeMs = ((typeof performance !== 'undefined' && performance.now)
          ? performance.now()
          : Date.now()) - start;
        const sanitized = sanitizeSandboxResult(value);
        resolve({
          result: sanitized.value,
          logs,
          timeMs: Number(timeMs.toFixed(2)),
          stringified: sanitized.stringified
        });
      };

      const finishError = (code, detail) => {
        if (settled) return;
        settled = true;
        cleanup();
        const error = new Error(detail || code);
        error.code = code || 'runtime_error';
        reject(error);
      };

      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        finishError('timeout', `Exceeded ${config.timeoutMs}ms`);
      }, config.timeoutMs);

      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === 'log') {
          logs.push(String(data.value ?? ''));
          return;
        }
        if (data.type === 'result') {
          clearTimeout(timeoutId);
          finishSuccess(data.value);
          return;
        }
        if (data.type === 'error') {
          clearTimeout(timeoutId);
          finishError(data.error || 'runtime_error', data.detail);
        }
      };

      worker.onerror = (event) => {
        clearTimeout(timeoutId);
        finishError('runtime_error', event.message || 'Worker error');
      };

      worker.postMessage({
        code: config.code,
        args: config.args
      });
    });
  }

  function createSandboxWorker() {
    const forbiddenApis = [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'importScripts',
      'indexedDB',
      'caches'
    ];
    const typedArrays = [
      'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
      'Int16Array', 'Uint16Array',
      'Int32Array', 'Uint32Array',
      'Float32Array', 'Float64Array',
      'BigInt64Array', 'BigUint64Array'
    ];
    const frozenGlobals = [
      'Math',
      'Date',
      'Number',
      'String',
      'Array',
      'JSON',
      'BigInt',
      ...typedArrays
    ];

    const workerSource = `
      const FORBIDDEN = ${JSON.stringify(forbiddenApis)};
      function block(name) {
        const trap = function() {
          const error = new Error(name + ' is forbidden');
          error.code = 'forbidden_api';
          throw error;
        };
        try {
          self[name] = trap;
        } catch (e) {
          try {
            delete self[name];
          } catch (noop) {}
          self[name] = trap;
        }
      }
      FORBIDDEN.forEach(block);
      try { self.navigator = undefined; } catch (_) {}

      const FROZEN = ${JSON.stringify(frozenGlobals)};
      FROZEN.forEach((name) => {
        if (self[name]) {
          try {
            Object.freeze(self[name]);
          } catch (e) {}
        }
      });

      function formatLog(value) {
        if (typeof value === 'string') return value;
        try { return JSON.stringify(value); } catch (e) { return String(value); }
      }

      const forwardLog = (...args) => {
        const rendered = args.map(formatLog).join(' ');
        self.postMessage({ type: 'log', value: rendered });
        return rendered;
      };

      self.console = {
        log: forwardLog,
        info: forwardLog,
        warn: forwardLog,
        error: forwardLog
      };

      self.onmessage = function(event) {
        const payload = event.data || {};
        const code = typeof payload.code === 'string' ? payload.code : '';
        const userArgs = payload.args;
        try {
          const fn = new Function('args', '"use strict";\\n' + code);
          const result = fn(userArgs);
          self.postMessage({ type: 'result', value: result });
        } catch (error) {
          const errorCode = error && error.code === 'forbidden_api' ? 'forbidden_api' : 'runtime_error';
          self.postMessage({
            type: 'error',
            error: errorCode,
            detail: error && error.message ? error.message : String(error)
          });
        }
      };
    `;

    const blob = new Blob([workerSource], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    let worker;
    try {
      worker = new Worker(url, { name: 'js-run-sandbox' });
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    return {
      worker,
      revokeUrl: () => URL.revokeObjectURL(url)
    };
  }

  function sanitizeSandboxResult(value) {
    if (value === undefined) {
      return { value: 'undefined', stringified: true };
    }
    if (value === null) {
      return { value: null, stringified: false };
    }
    const valueType = typeof value;
    if (valueType === 'object') {
      return { value: safeStringify(value), stringified: true };
    }
    if (valueType === 'function' || valueType === 'symbol') {
      return { value: String(value), stringified: true };
    }
    return { value, stringified: false };
  }

  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
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

  function formatToolResult(toolName, result) {
    if (!result) return 'unavailable';
    if (toolName === 'js.run_sandbox') {
      return formatSandboxResult(result);
    }
    return formatClockResult(result);
  }

  function formatClockResult(result) {
    if (!result) return 'unavailable';
    if (result.local) return result.local;
    if (result.iso) return result.iso;
    if (typeof result.epochMs === 'number') return String(result.epochMs);
    return 'unavailable';
  }

  function formatSandboxResult(result) {
    const value = formatResultValue(result?.result);
    const timeSuffix = typeof result?.timeMs === 'number' ? ` (${result.timeMs}ms)` : '';
    const logsSuffix = Array.isArray(result?.logs) && result.logs.length
      ? ` logs=${formatResultValue(result.logs)}`
      : '';
    return `${value}${timeSuffix}${logsSuffix}`.trim();
  }

  function formatResultValue(value) {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    return safeStringify(value);
  }

  function renderToolDetails(details) {
    if (!toolDetailsBody || !details) return;
    toolDetailsBody.innerHTML = '';

    const item = document.createElement('div');
    item.className = 'tool-details-item';

    const meta = document.createElement('div');
    meta.className = 'tool-details-meta';
    const title = document.createElement('strong');
    title.textContent = details.tool || 'tool';
    meta.appendChild(title);

    const status = document.createElement('span');
    status.textContent = details.status === 'succeeded'
      ? 'Status: executed'
      : `Status: failed (${details.error?.code || 'runtime_error'})`;
    meta.appendChild(status);

    if (typeof details.timeMs === 'number') {
      const time = document.createElement('span');
      time.textContent = `Time: ${details.timeMs}ms`;
      meta.appendChild(time);
    }

    if (typeof details.timeoutMs === 'number') {
      const timeout = document.createElement('span');
      timeout.textContent = `Timeout: ${details.timeoutMs}ms`;
      meta.appendChild(timeout);
    }

    item.appendChild(meta);

    if (details.reason) {
      const reason = document.createElement('p');
      reason.className = 'tool-details-reason';
      reason.textContent = `Plan reason: ${details.reason}`;
      item.appendChild(reason);
    }

    if (details.tool === 'js.run_sandbox' && details.input?.code) {
      appendDetailPre(item, 'JS Code', details.input.code, 'code');
      if (details.input.args && Object.keys(details.input.args).length > 0) {
        appendDetailPre(item, 'Arguments', details.input.args);
      }
    } else if (details.input && Object.keys(details.input).length > 0) {
      appendDetailPre(item, 'Input', details.input);
    }

    if (details.status === 'succeeded') {
      if (details.result !== undefined) {
        appendDetailPre(item, 'Result', details.result);
      }
      if (Array.isArray(details.logs) && details.logs.length > 0) {
        appendDetailPre(item, 'Console logs', details.logs);
      }
      if (details.stringified) {
        appendDetailParagraph(item, 'Note', 'Result was stringified for safe rendering.');
      }
    } else if (details.error?.detail) {
      appendDetailPre(item, 'Error detail', details.error.detail);
    }

    toolDetailsBody.appendChild(item);
    if (toolDetailsToggle) {
      setCollapsibleState(toolDetailsBody, toolDetailsToggle, true);
    }
  }

  function appendDetailPre(parent, labelText, content, variant = 'json') {
    if (!parent || content === undefined || content === null) return;
    const label = document.createElement('div');
    label.className = 'tool-details-label';
    label.textContent = labelText;

    const pre = document.createElement('pre');
    pre.className = variant === 'code' ? 'tool-details-code' : 'tool-details-json';
    pre.textContent = typeof content === 'string' ? content : prettyPrint(content);

    parent.appendChild(label);
    parent.appendChild(pre);
  }

  function appendDetailParagraph(parent, labelText, text) {
    if (!parent || !text) return;
    const label = document.createElement('div');
    label.className = 'tool-details-label';
    label.textContent = labelText;

    const paragraph = document.createElement('p');
    paragraph.className = 'tool-details-reason';
    paragraph.textContent = text;

    parent.appendChild(label);
    parent.appendChild(paragraph);
  }

  function prettyPrint(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
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
  function generateJsonRepairCandidates(candidate) {
    const variants = [];
    const noDanglingCommas = removeDanglingCommas(candidate);
    if (noDanglingCommas !== candidate) {
      variants.push(noDanglingCommas);
    }

    const withInsertedCommas = insertMissingCommasBetweenStrings(candidate);
    if (withInsertedCommas !== candidate) {
      variants.push(withInsertedCommas);
    }

    const combined = insertMissingCommasBetweenStrings(noDanglingCommas);
    if (
      combined !== noDanglingCommas &&
      combined !== candidate &&
      !variants.includes(combined)
    ) {
      variants.push(combined);
    }

    return variants;
  }

  function removeDanglingCommas(text) {
    if (typeof text !== 'string') {
      return text;
    }
    return text.replace(/,\s*([}\]])/g, '$1');
  }

  function insertMissingCommasBetweenStrings(text) {
    if (typeof text !== 'string' || text.indexOf('"') === -1) {
      return text;
    }

    let result = '';
    let inString = false;
    let escape = false;
    let changed = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      result += char;

      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = false;
          const insertPosition = i + 1;
          let j = insertPosition;
          let sawComma = false;

          while (j < text.length) {
            const lookahead = text[j];
            if (lookahead === ',') {
              sawComma = true;
              break;
            }
            if (!/\s/.test(lookahead)) {
              break;
            }
            j++;
          }

          const nextChar = text[j];
          if (
            !sawComma &&
            nextChar &&
            nextChar !== ':' &&
            nextChar !== ']' &&
            nextChar !== '}' &&
            isLikelyValueStartChar(nextChar)
          ) {
            result += ',';
            changed = true;
          }
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      }
    }

    return changed ? result : text;
  }

  function isLikelyValueStartChar(char) {
    return (
      char === '"' ||
      char === '{' ||
      char === '[' ||
      char === '-' ||
      (char >= '0' && char <= '9') ||
      char === 't' ||
      char === 'f' ||
      char === 'n'
    );
  }
