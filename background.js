// Service worker — handles Claude API calls for PDF extraction.
// No persistent state; use chrome.storage for anything that must survive.

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Support both old format (action: 'extractPdf') and new format (type: 'extractPdf')
  const action = message.action || message.type;
  if (action === 'extractPdf') {
    const pdfBase64 = message.pdfBase64 || message.pdf;
    const mode = message.mode || 'webForm';
    const template = message.template || '';
    handleExtract(pdfBase64, mode, template, sender)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleExtract(pdfBase64, mode, template, sender) {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (!apiKey) {
    return { error: 'API key not set. Open extension options to add your Claude API key.' };
  }

  // Get the active tab URL so we know which prompt to use
  let tabUrl = '';
  let tabId;
  if (mode === 'webForm') {
    tabId = sender.tab ? sender.tab.id : await getActiveTabId();
    const tab = await chrome.tabs.get(tabId);
    tabUrl = tab.url || '';
  }

  // For generic templates, load the field names from storage
  let templateFields = null;
  if (mode === 'fillPdf' && template && template !== 'APPI_CANCELLATION') {
    const result = await chrome.storage.local.get('pdfTemplates');
    const templates = result.pdfTemplates || [];
    const tmpl = templates.find(t => t.id === template);
    if (tmpl) {
      templateFields = tmpl.fields;
    }
  }

  const extractedData = await callClaudeApi(apiKey, pdfBase64, mode, tabUrl, template, templateFields);

  if (mode === 'fillPdf') {
    // Return data directly to popup.js for the review form
    return { data: extractedData };
  }

  // webForm mode: send extracted data to the content script in the active tab
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

async function callClaudeApi(apiKey, pdfBase64, mode, tabUrl, template, templateFields) {
  let promptText;
  if (mode === 'fillPdf' && template === 'APPI_CANCELLATION') {
    promptText = getFillPdfPrompt();
  } else if (mode === 'fillPdf' && templateFields) {
    promptText = getGenericPdfPrompt(templateFields);
  } else if (tabUrl.includes('sa.dor.mo.gov/mv/trpa_dealers')) {
    promptText = getTRPAPrompt();
  } else {
    promptText = getNOLPrompt();
  }

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

// === MO NOL PROMPT — DO NOT MODIFY ===
function getNOLPrompt() {
  return 'Extract all form-relevant data from this PDF document for a Missouri Notice of Lien (NOL) form. Return ONLY valid JSON with the exact camelCase field names below. Do not include any explanation — just the JSON object.\n\nRequired fields and formatting rules:\n- ownerName: Format as "Last, First Middle" for primary owner. If there is a co-buyer, combine as "Last First Middle & Last First Middle" (both names in one field, separated by &)\n- ownerAddress: Street address only (no city, state, or zip)\n- ownerCity: City name only\n- ownerState: Two-letter state abbreviation\n- ownerZip: 5-digit zip code\n- ownerDLN: ALWAYS omit this field. Never extract a DLN or FEIN number.\n- vehicleType: ALWAYS set to "P" regardless of what type of vehicle it is.\n- vehicleMake: Vehicle manufacturer (e.g. "FORD", "CHEV", "TOYT")\n- vehicleYear: 4-digit year\n- vehicleVIN: Vehicle identification number, uppercase with no spaces\n- vehiclePurchaseDate: In MM/DD/YYYY format\n- vehicleLienDate: Security agreement date in MM/DD/YYYY format, if present\n- vehiclePreviousState: Two-letter state abbreviation if previously titled elsewhere\n- vehiclePreviousTitle: Previous title number if present\n- vehicleNetPrice: ALWAYS omit this field. Never extract or return a price.\n- lienholderSelect: ALWAYS set to "info" (manual entry mode).\n- lienholderType: Determine from the lienholder name: if name contains "BANK" set to "1", if name contains "CREDIT UNION" set to "2", otherwise set to "6" (Finance Company).\n- lienholderName: Lienholder business or individual name\n- lienholderAddress: Lienholder street address only\n- lienholderCity: Lienholder city\n- lienholderState: Lienholder two-letter state abbreviation\n- lienholderZip: Lienholder 5-digit zip code\n- loanNumber: Loan or account number if present\n- futureAdvances: "Yes" if subject to future advances, omit otherwise';
}

// === MO TRPA (TEMP TAG) PROMPT ===
function getTRPAPrompt() {
  return 'Extract all form-relevant data from this PDF document for a Missouri Temporary Registration Permit Application (TRPA). Return ONLY valid JSON with the exact camelCase field names below. Do not include any explanation — just the JSON object.\n\nRequired fields and formatting rules:\n- ownerType: "INDIVIDUAL" or "BUSINESS". Default to "INDIVIDUAL".\n- ownerLastName: Last name only\n- ownerFirstName: First name only\n- ownerMiddleName: Middle name if present, otherwise omit\n- ownerSuffix: Suffix (Jr, Sr, III, etc.) if present, otherwise omit\n- ownerDLN: Driver license number if present, otherwise omit\n- ownerAddress: Street address only (no city, state, or zip)\n- ownerCity: City name only\n- ownerState: Two-letter state abbreviation\n- ownerZip: Zip code (5 or 9 digit)\n- ownerPhone: Phone number formatted as (###) ###-####\n- ownerDOB: Date of birth in MM/DD/YYYY format if present\n- vehicleKOV: Map vehicle type to these exact values: "6" for Passenger/Car/Sedan/Coupe/Hatchback, "9" for Truck/Pickup, "4" for Motorcycle, "2" for Bus/Heavy Truck, "8" for Trailer, "7" for RV/Motorhome, "11" for Autocycle, "5" for Motortricycle. Default to "6" for standard consumer vehicles.\n- vehicleMakeType: ALWAYS set to "2" (this selects "Make" mode in the dropdown).\n- vehicleMakeNCIC: The vehicle make name exactly as it appears (e.g. "MAZDA", "FORD", "CHEVROLET", "TOYOTA", "HONDA"). Uppercase.\n- vehicleYear: 4-digit year\n- vehicleVIN: Vehicle identification number, uppercase, no spaces, max 17 characters\n- vehiclePurchaseDate: Purchase date in MM/DD/YYYY format\n- vehicleNetPrice: Sale price or net price as a number without $ sign or commas. Omit if not found.\n- dealerNo: ALWAYS set to "D3871".\n- proofOfOwnership: ALWAYS set to "Missouri Title".';
}

// === FILL PDF PROMPT (for APPI GAP Cancellation) — DO NOT MODIFY ===
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

// === GENERIC PDF TEMPLATE PROMPT ===
function getGenericPdfPrompt(templateFields) {
  const textFields = templateFields
    .filter(f => f.type === 'text')
    .map(f => f.name);

  const checkFields = templateFields
    .filter(f => f.type === 'checkbox' || f.type === 'radio')
    .map(f => f.name);

  let prompt = `You are extracting data from a source document to fill a target PDF form.

The target form has these TEXT fields (return the EXACT field name as the JSON key):
${textFields.map(n => '- "' + n + '"').join('\n')}`;

  if (checkFields.length > 0) {
    prompt += `

The form also has these CHECKBOX fields (set to true or false):
${checkFields.map(n => '- "' + n + '"').join('\n')}`;
  }

  prompt += `

Return ONLY valid JSON — no markdown fences, no explanation, no extra text.

CRITICAL RULES — READ ALL BEFORE RESPONDING:

FIELD MATCHING:
- The JSON keys MUST be the EXACT field names listed above, character for character
- Do NOT put the same data in multiple fields — each field gets ONE unique value

OWNER FIELDS:
- Fields with "2nd" or "_2" suffix are for a SECOND owner/co-buyer — different person than owner 1. If no co-buyer exists, use empty string.
- Fields with "3rd" or "_3" suffix are for a THIRD owner. If no third owner, use empty string.
- "Owner's Residential Address, City, State, Zip" = the BUYER's full residential address as one string (e.g. "123 Main St, Kansas City, MO 64132")
- "Owner's Mailing Address, City, State, Zip" = same as residential unless different mailing address exists

TRANSFER ON DEATH (TOD) FIELDS:
- TOD beneficiary fields are for designated beneficiaries who inherit upon death — these are NOT the owners themselves
- Unless the source document explicitly names TOD beneficiaries, leave these EMPTY

LIEN / LIENHOLDER FIELDS:
- "Lien Holder Name" fields = the bank or finance company name
- "Lien Holder Name 1" through "Lien Holder Name 5" = segments of ONE name if it's long, otherwise use field 1 only
- "Street", "City", "State", "ZIP" fields near the lien section = the LIENHOLDER's address (bank address), NOT the owner's address
- "PLID" = lienholder ID number, leave empty if not in the source document

DATA FORMATTING:
- Vehicle Identification Number / VIN: Always uppercase, no spaces, full 17 characters
- Dates: MM/DD/YYYY format
- State: Two-letter abbreviation
- If a field has no matching data in the source document, use empty string ""
- Return ALL fields listed above, even if empty`;

  return prompt;
}
