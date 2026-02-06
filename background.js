// background.js — Service worker for Claude API calls

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractPdf') {
    handleExtraction(message.pdfBase64, message.template)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

async function handleExtraction(pdfBase64, template) {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (!apiKey) {
    throw new Error('API key not set. Please configure it in the extension options.');
  }

  const systemPrompt = getSystemPrompt(template);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
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
              text: 'Extract all relevant data from this document and return it as JSON matching the field names described in your instructions.'
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errBody}`);
  }

  const result = await response.json();
  const text = result.content[0].text;

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response');
  }

  const jsonStr = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonStr);
}

function getSystemPrompt(template) {
  if (template === 'appi_cancellation') {
    return `You are a document data extraction assistant. Extract data from the uploaded PDF and return a JSON object with these exact field names:

{
  "consumerName": "first consumer/buyer name",
  "consumerName2": "second consumer/co-buyer name (if present)",
  "vin": "vehicle identification number",
  "address": "consumer street address",
  "city": "consumer city",
  "state": "consumer state abbreviation",
  "zip": "consumer zip code",
  "requestedDateOfCancellation": "cancellation date in MM/DD/YYYY format",
  "cancellationReason": "one of: customerRequest, dealUnwind, earlyPayoff, rewrite, repossession, tradeIn, totalLoss",
  "refundTo": "one of: dealer, lienHolder, consumer",
  "lenderName": "lender/lessor name",
  "lenderPhone": "lender phone number",
  "lenderAddress": "lender street address",
  "lenderCity": "lender city",
  "lenderState": "lender state abbreviation",
  "lenderZip": "lender zip code",
  "dealerName": "dealer name",
  "dealerPhone": "dealer phone number",
  "dealerAddress": "dealer street address",
  "dealerCity": "dealer city",
  "dealerState": "dealer state abbreviation",
  "dealerZip": "dealer zip code",
  "consumerSignatureDate": "date in MM/DD/YYYY format",
  "dealerSignatureDate": "date in MM/DD/YYYY format"
}

Return ONLY valid JSON. Use empty string "" for fields not found in the document. Format all dates as MM/DD/YYYY.`;
  }

  // Default prompt for web form extraction
  return `You are a document data extraction assistant. Extract all form-relevant data from the uploaded PDF and return it as a flat JSON object with descriptive field names. Return ONLY valid JSON.`;
}
