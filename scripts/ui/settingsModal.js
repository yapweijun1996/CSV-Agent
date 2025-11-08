import { testGeminiConnection } from '../api/connectionTester.js';

export function initSettingsModal({ openBtn, modal, closeBtn, saveBtn, testBtn, apiInput, modelInput }) {
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

  // Allow operators to validate their Gemini credentials before committing settings.
  testBtn?.addEventListener('click', async () => {
    const apiKey = apiInput.value.trim() || localStorage.getItem('gemini-api-key') || '';
    const model = modelInput.value.trim() || localStorage.getItem('gemini-model') || 'gemini-pro';
    if (!apiKey) {
      alert('Enter an API Key before testing the connection.');
      return;
    }

    const originalText = testBtn.textContent;
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    try {
      const result = await testGeminiConnection({ apiKey, model });
      alert(`Connection successful!\nModel: ${result.displayName}\nVersion: ${result.version}`);
    } catch (error) {
      console.error('Test connection failed', error);
      alert(`Connection failed: ${error.message || 'Unknown error'}`);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = originalText;
    }
  });
}
