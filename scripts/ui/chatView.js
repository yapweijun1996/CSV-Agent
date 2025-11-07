import { createElement, scrollToBottom } from '../utils/dom.js';

let messageList;

export function initChatView({ list }) {
  messageList = list;
}

export function addUserMessage(text) {
  if (!messageList) return;
  const messageDiv = createElement('div', { className: 'message user', text });
  messageList.appendChild(messageDiv);
  scrollToBottom(messageList);
}

export function createAssistantMessage({ restatement, visibleReply, summaryElements }) {
  if (!messageList) {
    throw new Error('Chat view not initialized.');
  }

  const messageDiv = createElement('div', { className: 'message assistant' });
  if (summaryElements?.root) {
    messageDiv.appendChild(summaryElements.root);
  }

  const restatementDiv = createElement('div', { className: 'restatement', text: restatement });
  const replyDiv = createElement('div', { className: 'visible-reply', text: visibleReply });
  replyDiv.dataset.template = visibleReply || '';

  const toolResultContainer = createElement('div', { className: 'tool-result-stack' });
  toolResultContainer.dataset.role = 'tool-result-stack';

  messageDiv.append(restatementDiv, replyDiv, toolResultContainer);
  messageList.appendChild(messageDiv);
  scrollToBottom(messageList);

  return { messageEl: messageDiv, replyEl: replyDiv, toolResultContainer };
}

export function appendToolResult(container, { prefix, label = 'Result', value, isError = false }) {
  if (!container) return;
  const line = createElement('div', { className: 'tool-result' });
  const prefixText = prefix ? `${prefix} · ` : '';
  line.textContent = `${prefixText}${label}: ${value}`;
  if (isError) {
    line.classList.add('is-error');
  }
  container.appendChild(line);
}
