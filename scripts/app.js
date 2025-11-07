import { callGeminiApi } from './api/geminiClient.js';
import { startNewTurn, finishTurn } from './state/sessionState.js';
import { initThinkingLog, syncThinkingLog, appendThinkingLogEntry, clearThinkingLog, setExpanded as setThinkingExpanded, isExpanded as isThinkingExpanded } from './ui/thinkingLog.js';
import { initToolDetailsDrawer, clearToolDetails, renderToolDetails, setExpanded as setDetailsExpanded, isExpanded as isDetailsExpanded } from './ui/toolDetailsDrawer.js';
import { initToolPlanPanel, showIdleState, setPlanSteps, updateStepStatus, markPlanComplete } from './ui/toolPlanPanel.js';
import { initChatView, addUserMessage, createAssistantMessage, appendToolResult } from './ui/chatView.js';
import { initSettingsModal } from './ui/settingsModal.js';
import { initResizer } from './ui/resizer.js';
import { createSummaryData, renderSummaryBar, updateSummaryStatus, recordToolUsage, finalizeSummary, syncSummaryButtons } from './ui/summaryBar.js';
import { createToolRegistry } from './tools/registry.js';
import { createPlanExecutor } from './tools/planExecutor.js';

const toolRegistry = createToolRegistry();
const runToolPlan = createPlanExecutor({ toolRegistry });

document.addEventListener('DOMContentLoaded', () => {
  const elements = cacheDom();
  const syncPanels = () => syncSummaryButtons(getDetailPanelsExpanded());
  initThinkingLog({
    list: elements.thinkingLogList,
    toggle: elements.thinkingLogToggle,
    body: elements.thinkingLogBody,
    defaultExpanded: true,
    onToggle: syncPanels
  });
  initToolDetailsDrawer({
    body: elements.toolDetailsBody,
    toggle: elements.toolDetailsToggle,
    defaultExpanded: false,
    onToggle: syncPanels
  });
  initToolPlanPanel({
    root: elements.toolPlanRoot,
    list: elements.toolPlanList,
    summary: elements.toolPlanSummary
  });
  initChatView({ list: elements.messageList });
  initSettingsModal({
    openBtn: elements.settingsBtn,
    modal: elements.settingsModal,
    closeBtn: elements.modalCloseBtn,
    saveBtn: elements.saveSettingsBtn,
    apiInput: elements.apiKeyInput,
    modelInput: elements.modelInput
  });
  initResizer({
    resizer: elements.resizer,
    sidebar: elements.assistantSidebar,
    rootStyle: document.documentElement,
    onLog: appendThinkingLogEntry
  });

  elements.sendBtn.addEventListener('click', () => runSingleTurn(elements));
  elements.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      runSingleTurn(elements);
    }
  });
});

function cacheDom() {
  return {
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    messageList: document.getElementById('message-list'),
    thinkingLogList: document.getElementById('thinking-log-list'),
    thinkingLogToggle: document.getElementById('thinking-log-toggle'),
    thinkingLogBody: document.getElementById('thinking-log-body'),
    toolPlanRoot: document.getElementById('tool-plan'),
    toolPlanList: document.getElementById('tool-plan-list'),
    toolPlanSummary: document.getElementById('tool-plan-summary'),
    toolDetailsBody: document.getElementById('tool-details-body'),
    toolDetailsToggle: document.getElementById('tool-details-toggle'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    modalCloseBtn: document.querySelector('.modal-content .close-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    apiKeyInput: document.getElementById('api-key-input'),
    modelInput: document.getElementById('model-input'),
    resizer: document.getElementById('resizer'),
    assistantSidebar: document.getElementById('assistant-sidebar')
  };
}

async function runSingleTurn(elements) {
  const userInput = elements.chatInput.value.trim();
  if (!userInput) return;

  addUserMessage(userInput);
  elements.chatInput.value = '';
  toggleInput(elements, false);
  resetPanels();

  try {
    const llmResponse = await callGeminiApi(userInput);
    await renderLlmResponse(llmResponse, userInput);
  } catch (error) {
    console.error('LLM error', error);
    renderError(error.message || 'Sorry, something went wrong.');
  } finally {
    toggleInput(elements, true);
  }
}

function toggleInput(elements, enabled) {
  elements.chatInput.disabled = !enabled;
  elements.sendBtn.disabled = !enabled;
  elements.chatInput.placeholder = enabled ? 'Ask a question about your data...' : 'Thinking...';
}

function resetPanels() {
  clearThinkingLog();
  showIdleState('Awaiting plan...');
  clearToolDetails();
}

async function renderLlmResponse(response, userInput) {
  const turn = startNewTurn();
  const summaryData = createSummaryData(response);
  const summaryElements = renderSummaryBar(summaryData, toggleDetailPanels);
  syncSummaryButtons(getDetailPanelsExpanded());

  const assistantView = createAssistantMessage({
    restatement: response.restatement,
    visibleReply: response.visible_reply,
    summaryElements
  });

  syncThinkingLog(response.thinking_log || []);

  const summaryController = {
    updateStatus: (status) => updateSummaryStatus(summaryData, status),
    recordUsage: (tool, duration) => recordToolUsage(summaryData, tool, duration),
    finalize: (succeeded) => finalizeSummary(summaryData, succeeded)
  };

  await runToolPlan(response.tool_plan, {
    response,
    userInput,
    turn,
    replyTemplate: response.visible_reply,
    setReplyText: (text) => {
      assistantView.replyEl.textContent = text;
    },
    appendThinkingLog: appendThinkingLogEntry,
    appendToolResult: (payload) => appendToolResult(assistantView.toolResultContainer, payload),
    planPanel: {
      showIdleState,
      setPlanSteps,
      updateStepStatus,
      markPlanComplete
    },
    toolDetails: {
      render: (entry) => renderToolDetails(entry)
    },
    summary: summaryController
  });

  finishTurn(turn);
}

function toggleDetailPanels() {
  const nextState = !getDetailPanelsExpanded();
  setThinkingExpanded(nextState);
  setDetailsExpanded(nextState);
  syncSummaryButtons(nextState);
}

function getDetailPanelsExpanded() {
  return Boolean(isThinkingExpanded() && isDetailsExpanded());
}

function renderError(message) {
  const list = document.getElementById('message-list');
  const div = document.createElement('div');
  div.className = 'message assistant error';
  div.textContent = message;
  list.appendChild(div);
}
