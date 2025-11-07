import { clamp } from '../utils/text.js';

const MIN_ASSISTANT_WIDTH = 280;
const MAX_ASSISTANT_WIDTH = 640;
const KEYBOARD_STEP = 24;

export function initResizer({ resizer, sidebar, rootStyle, onLog }) {
  if (!resizer || !sidebar || !rootStyle) return;
  const state = {
    active: false,
    pointerId: null,
    startX: 0,
    startWidth: sidebar.getBoundingClientRect().width,
    latestWidth: getCurrentWidth(rootStyle)
  };

  resizer.setAttribute('aria-valuemin', String(MIN_ASSISTANT_WIDTH));
  resizer.setAttribute('aria-valuemax', String(MAX_ASSISTANT_WIDTH));
  resizer.setAttribute('aria-valuenow', String(state.latestWidth));

  const log = (message) => {
    if (typeof onLog === 'function') {
      onLog(message);
    }
  };

  const handlePointerMove = (event) => {
    if (!state.active) return;
    const delta = event.clientX - state.startX;
    const desiredWidth = state.startWidth - delta;
    updateWidth(desiredWidth, state, resizer, rootStyle);
  };

  const handleResizeEnd = () => finalizeResize(false, state, resizer, log);
  const handleResizeCancel = () => finalizeResize(true, state, resizer, log);

  resizer.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    state.active = true;
    state.pointerId = event.pointerId;
    state.startX = event.clientX;
    state.startWidth = sidebar.getBoundingClientRect().width;
    resizer.classList.add('is-active');
    document.body.classList.add('is-resizing');
    resizer.setPointerCapture(event.pointerId);
    log(`[layout] 開始調整側欄（${Math.round(state.startWidth)}px）`);
  });

  resizer.addEventListener('pointermove', handlePointerMove);
  resizer.addEventListener('pointerup', handleResizeEnd);
  resizer.addEventListener('lostpointercapture', handleResizeCancel);
  window.addEventListener('pointerup', handleResizeEnd);

  resizer.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP;
    const next = updateWidth(state.latestWidth + delta, state, resizer, rootStyle);
    log(`[layout] 鍵盤調整至 ${Math.round(next)}px`);
  });
}

function updateWidth(width, state, resizer, rootStyle) {
  const clamped = clamp(width, MIN_ASSISTANT_WIDTH, MAX_ASSISTANT_WIDTH);
  rootStyle.style.setProperty('--assistant-width', `${clamped}px`);
  state.latestWidth = clamped;
  if (resizer) {
    resizer.setAttribute('aria-valuenow', String(Math.round(clamped)));
  }
  return clamped;
}

function finalizeResize(cancelled, state, resizer, log) {
  if (!state.active) return;
  state.active = false;
  if (state.pointerId !== null && resizer) {
    try {
      resizer.releasePointerCapture(state.pointerId);
    } catch (error) {
      console.warn('Pointer capture release failed:', error);
    }
  }
  state.pointerId = null;
  resizer?.classList.remove('is-active');
  document.body.classList.remove('is-resizing');
  if (cancelled) {
    log('[layout] 已取消側欄調整');
  } else {
    log(`[layout] 側欄寬度設定為 ${Math.round(state.latestWidth)}px`);
  }
}

function getCurrentWidth(rootStyle) {
  const raw = getComputedStyle(rootStyle).getPropertyValue('--assistant-width');
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 400;
}
