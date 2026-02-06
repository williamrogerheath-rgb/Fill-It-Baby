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
              text: 'Extract all form-relevant data from this PDF document for a Missouri Notice of Lien (NOL) form. Return ONLY valid JSON with the exact camelCase field names below. Do not include any explanation — just the JSON object.\n\nRequired fields and formatting rules:\n- ownerName: Format as "Last, First Middle" for primary owner. If there is a co-buyer, combine as "Last First Middle & Last First Middle" (both names in one field, separated by &)\n- ownerAddress: Street address only (no city, state, or zip)\n- ownerCity: City name only\n- ownerState: Two-letter state abbreviation\n- ownerZip: 5-digit zip code\n- ownerDLN: Driver license number if present\n- vehicleType: "P" for Passenger Vehicle, "T" for Truck, etc.\n- vehicleMake: Vehicle manufacturer (e.g. "FORD", "CHEV", "TOYT")\n- vehicleYear: 4-digit year\n- vehicleVIN: Vehicle identification number, uppercase with no spaces\n- vehiclePurchaseDate: In MM/DD/YYYY format\n- vehicleLienDate: Security agreement date in MM/DD/YYYY format, if present\n- vehiclePreviousState: Two-letter state abbreviation if previously titled elsewhere\n- vehiclePreviousTitle: Previous title number if present\n- vehicleNetPrice: Numbers only, no dollar signs or commas (e.g. "25000")\n- lienholderName: Lienholder business or individual name\n- lienholderAddress: Lienholder street address only\n- lienholderCity: Lienholder city\n- lienholderState: Lienholder two-letter state abbreviation\n- lienholderZip: Lienholder 5-digit zip code\n- loanNumber: Loan or account number if present\n- futureAdvances: "Yes" if subject to future advances, omit otherwise'
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
