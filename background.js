// Service worker — handles Claude API calls for PDF extraction.
// No persistent state; use chrome.storage for anything that must survive.

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractPdf') {
    handleExtract(message.pdfBase64, sender)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    // Return true to keep the message channel open for async response
    return true;
  }
});

async function handleExtract(pdfBase64, sender) {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (!apiKey) {
    return { error: 'API key not set. Open extension options to add your Claude API key.' };
  }

  const extractedData = await callClaudeApi(apiKey, pdfBase64);

  // Send extracted data to the content script in the active tab
  const tabId = sender.tab ? sender.tab.id : await getActiveTabId();
  await chrome.tabs.sendMessage(tabId, {
    action: 'fillForm',
    data: extractedData
  });

  return { success: true };
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.id;
}

async function callClaudeApi(apiKey, pdfBase64) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
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
              text: 'Extract all form-relevant data from this PDF document. Return ONLY valid JSON with field names as keys and their values. Use clear, descriptive camelCase field names (e.g. "ownerFirstName", "vehicleVin", "lienholderAddress"). Do not include any explanation — just the JSON object.'
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('Claude API error (' + response.status + '): ' + body);
  }

  const result = await response.json();
  const text = result.content[0].text;

  // Parse JSON from response (Claude may wrap it in markdown code fences)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
  return JSON.parse(jsonStr);
}
