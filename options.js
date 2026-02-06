const apiKeyInput = document.getElementById('api-key');
const saveBtn = document.getElementById('save-btn');
const messageEl = document.getElementById('message');

// Load saved key on open
chrome.storage.sync.get('apiKey', ({ apiKey }) => {
  if (apiKey) {
    apiKeyInput.value = apiKey;
  }
});

saveBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showMessage('Please enter an API key.', true);
    return;
  }

  chrome.storage.sync.set({ apiKey }, () => {
    showMessage('API key saved.');
  });
});

function showMessage(text, isError) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? '#a71a1a' : '#1a7a1a';
  messageEl.hidden = false;
}
