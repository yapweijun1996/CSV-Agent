const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Lightweight helper that pings the Gemini model metadata endpoint
 * so the Settings modal can verify whether the supplied API key/model
 * combination is valid before saving.
 */
export async function testGeminiConnection({ apiKey, model }) {
  if (!apiKey) {
    throw new Error('Gemini API key is required before testing the connection.');
  }

  const targetModel = (model || 'gemini-pro').trim();
  const endpoint = `${BASE_URL}/${encodeURIComponent(targetModel)}?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, { method: 'GET' });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error?.message || response.statusText || 'Unknown error';
    throw new Error(message);
  }

  return {
    name: payload.name || targetModel,
    displayName: payload.displayName || targetModel,
    version: payload.version || 'unknown',
    description: payload.description || ''
  };
}
