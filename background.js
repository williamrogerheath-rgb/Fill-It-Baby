// Service worker — handles Claude API calls for PDF extraction.
// No persistent state; use chrome.storage for anything that must survive.

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Support both old format (action: 'extractPdf') and new format (type: 'extractPdf')
  const action = message.action || message.type;
  if (action === 'extractPdf') {
    const pdfBase64 = message.pdfBase64 || message.pdf;
    const mode = message.mode || 'webForm';
    handleExtract(pdfBase64, mode, sender)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleExtract(pdfBase64, mode, sender) {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (!apiKey) {
    return { error: 'API key not set. Open extension options to add your Claude API key.' };
  }

  const extractedData = await callClaudeApi(apiKey, pdfBase64, mode);

  if (mode === 'fillPdf') {
    // Return data directly to popup.js for the review form
    return { data: extractedData };
  }

  // webForm mode: send extracted data to the content script in the active tab
  const tabId = sender.tab ? sender.tab.id : await getActiveTabId();
  await chrome.tabs.sendMessage(tabId, {
    type: 'fillForm',
    data: extractedData
  });

  return { success: true };
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.id;
}

async function callClaudeApi(apiKey, pdfBase64, mode) {
  const promptText = mode === 'fillPdf' ? getFillPdfPrompt() : getWebFormPrompt();

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
              text: promptText
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

// === ORIGINAL MO NOL PROMPT — DO NOT MODIFY ===
function getWebFormPrompt() {
  return 'Extract all form-relevant data from this PDF document for a Missouri Notice of Lien (NOL) form. Return ONLY valid JSON with the exact camelCase field names below. Do not include any explanation — just the JSON object.\n\nRequired fields and formatting rules:\n- ownerName: Format as "Last, First Middle" for primary owner. If there is a co-buyer, combine as "Last First Middle & Last First Middle" (both names in one field, separated by &)\n- ownerAddress: Street address only (no city, state, or zip)\n- ownerCity: City name only\n- ownerState: Two-letter state abbreviation\n- ownerZip: 5-digit zip code\n- ownerDLN: ALWAYS omit this field. Never extract a DLN or FEIN number.\n- vehicleType: ALWAYS set to "P" regardless of what type of vehicle it is.\n- vehicleMake: Vehicle manufacturer (e.g. "FORD", "CHEV", "TOYT")\n- vehicleYear: 4-digit year\n- vehicleVIN: Vehicle identification number, uppercase with no spaces\n- vehiclePurchaseDate: In MM/DD/YYYY format\n- vehicleLienDate: Security agreement date in MM/DD/YYYY format, if present\n- vehiclePreviousState: Two-letter state abbreviation if previously titled elsewhere\n- vehiclePreviousTitle: Previous title number if present\n- vehicleNetPrice: ALWAYS omit this field. Never extract or return a price.\n- lienholderSelect: ALWAYS set to "info" (manual entry mode).\n- lienholderType: Determine from the lienholder name: if name contains "BANK" set to "1", if name contains "CREDIT UNION" set to "2", otherwise set to "6" (Finance Company).\n- lienholderName: Lienholder business or individual name\n- lienholderAddress: Lienholder street address only\n- lienholderCity: Lienholder city\n- lienholderState: Lienholder two-letter state abbreviation\n- lienholderZip: Lienholder 5-digit zip code\n- loanNumber: Loan or account number if present\n- futureAdvances: "Yes" if subject to future advances, omit otherwise';
}

// === FILL PDF PROMPT (for APPI GAP Cancellation) ===
function getFillPdfPrompt() {
  return `You are extracting data from a document to fill an APPI GAP Cancellation form. The source document could be any of these types: a lender early payoff notice, a credit union GAP refund request letter, a refund of ancillary products form, an original APPI GAP contract, a bill of sale, or any other dealership/finance document.

Extract the following fields and return ONLY valid JSON — no markdown fences, no explanation, no extra text.

{
  "consumerName": "First and Last name of the borrower/buyer/consumer",
  "consumerName2": "Second consumer or co-buyer name, or empty string",
  "vin": "Vehicle Identification Number, uppercase, no spaces",
  "consumerAddress": "Consumer street address, or empty string",
  "consumerCity": "Consumer city, or empty string",
  "consumerState": "Consumer 2-letter state abbreviation, or empty string",
  "consumerZip": "Consumer zip code, or empty string",
  "cancelDate": "Use loan payoff date, effective date, or document date in MM/DD/YYYY format",
  "cancelReason": "One of: customerRequest, dealUnwind, earlyPayoff, reWrite, repossession, tradeIn, totalLoss",
  "refundTo": "One of: dealer, lienholder, consumer",
  "lenderName": "Lender, lessor, or finance company name",
  "lenderPhone": "Lender phone number, or empty string",
  "lenderAddress": "Lender street address, or empty string",
  "lenderCity": "Lender city, or empty string",
  "lenderState": "Lender 2-letter state, or empty string",
  "lenderZip": "Lender zip, or empty string",
  "dealerName": "Dealer name if found in document, or empty string",
  "dealerPhone": "Dealer phone if found, or empty string",
  "dealerAddress": "Dealer street address if found, or empty string",
  "dealerCity": "Dealer city if found, or empty string",
  "dealerState": "Dealer 2-letter state if found, or empty string",
  "dealerZip": "Dealer zip if found, or empty string"
}

Rules:
- cancelReason: If document mentions "early payoff", "paid off early", "early loan payoff", or "paid" use "earlyPayoff". If "trade" or "trade-in" use "tradeIn". If "repossession" or "repo" use "repossession". Default to "customerRequest" if unclear.
- refundTo: If a lender/credit union is requesting the refund sent to themselves use "lienholder". Default to "lienholder".
- dealerName: Extract whichever dealership is referenced in this specific document. Do NOT assume or hardcode any dealer name.
- VIN: Always uppercase, remove spaces.
- All dates: MM/DD/YYYY format.
- If a field is not found, return empty string "".`;
}
