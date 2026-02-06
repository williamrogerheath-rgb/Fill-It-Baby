chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'extractPdf') {
    handleExtractPdf(message, sender)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // keep channel open for async response
  }
});

async function handleExtractPdf(message) {
  const { pdf, mode } = message;

  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (!apiKey) {
    return { error: 'API key not set. Please configure it in the extension options.' };
  }

  const extractedData = await callClaudeApi(apiKey, pdf);

  if (mode === 'fillPdf') {
    // In fillPdf mode, return parsed data directly to popup.js
    return { data: extractedData };
  }

  // In webForm mode (default), send data to content script to fill the form
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    return { error: 'No active tab found.' };
  }

  await chrome.tabs.sendMessage(tab.id, {
    type: 'fillForm',
    data: extractedData
  });

  return { success: true };
}

async function callClaudeApi(apiKey, pdfBase64) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              type: 'text',
              text: 'Extract all form-relevant data from this PDF document. Return a JSON object with field names as keys and their values. Use descriptive camelCase field names (e.g. ownerName, vehicleVin, lienholderId). Return ONLY valid JSON, no other text.'
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error('Claude API error (' + response.status + '): ' + errBody);
  }

  const result = await response.json();
  const text = result.content[0].text;

  // Parse JSON from response, handling possible markdown code fences
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonStr);
}
