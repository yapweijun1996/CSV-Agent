export function initSettingsModal({ openBtn, modal, closeBtn, saveBtn, apiInput, modelInput }) {
  if (!modal) return;
  const open = () => {
    modal.style.display = 'block';
    apiInput.value = localStorage.getItem('gemini-api-key') || '';
    modelInput.value = localStorage.getItem('gemini-model') || 'gemini-pro';
  };
  const close = () => {
    modal.style.display = 'none';
  };

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      close();
    }
  });

  saveBtn?.addEventListener('click', () => {
    const apiKey = apiInput.value.trim();
    const model = modelInput.value.trim() || 'gemini-pro';
    if (!apiKey) {
      alert('Please enter a valid API Key.');
      return;
    }
    localStorage.setItem('gemini-api-key', apiKey);
    localStorage.setItem('gemini-model', model);
    alert('Settings saved successfully!');
    close();
  });
}
