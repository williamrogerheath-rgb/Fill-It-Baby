// options.js — Settings page for API key storage

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('save');
  const statusDiv = document.getElementById('status');

  // Load existing key
  chrome.storage.sync.get('apiKey', ({ apiKey }) => {
    if (apiKey) {
      apiKeyInput.value = apiKey;
    }
  });

  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('Please enter an API key.', 'error');
      return;
    }

    chrome.storage.sync.set({ apiKey }, () => {
      showStatus('API key saved.', 'success');
    });
  });

  function showStatus(msg, type) {
    statusDiv.textContent = msg;
    statusDiv.className = 'status ' + type;
    setTimeout(() => { statusDiv.className = 'status'; }, 3000);
  }
});
