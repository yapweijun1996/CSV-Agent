export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function createElement(tagName, options = {}) {
  const el = document.createElement(tagName);
  if (options.className) {
    el.className = options.className;
  }
  if (options.text) {
    el.textContent = options.text;
  }
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      el.setAttribute(key, String(value));
    });
  }
  return el;
}

export function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

export function toggleClass(el, className, force) {
  if (!el) return;
  el.classList.toggle(className, force);
}

export function scrollToBottom(container) {
  if (!container) return;
  container.scrollTop = container.scrollHeight;
}
