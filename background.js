// background.js — Service worker for Claude API calls

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractPdf') {
    handleExtraction(message.pdfBase64, message.mode, message.template)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

async function handleExtraction(pdfBase64, mode, template) {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (!apiKey) {
    throw new Error('API key not set. Please configure it in the extension options.');
  }

  const systemPrompt = getSystemPrompt(mode, template);

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

function getSystemPrompt(mode, template) {
  // Fill PDF mode — optimized prompt for APPI GAP Cancellation
  if (mode === 'fillPdf') {
    return `You are a document data extraction assistant specialized in automotive finance and GAP insurance documents. Your job is to extract data from the uploaded PDF to fill an APPI GAP Cancellation form.

The source document could be any of these types — auto-detect which one it is:
- Lender early payoff notices (e.g., Capital One "Backend Product Cancellation" letters)
- Credit union GAP refund request letters (e.g., Meritrust Credit Union)
- Credit union refund of ancillary products forms (e.g., Mazuma)
- Original APPI GAP contracts
- Bill of Sale documents
- Any other dealership or finance document

Extract and return a JSON object with these exact field names:

{
  "consumerName": "",
  "consumerName2": "",
  "vin": "",
  "consumerAddress": "",
  "consumerCity": "",
  "consumerState": "",
  "consumerZip": "",
  "cancelDate": "",
  "cancelReason": "",
  "refundTo": "",
  "lenderName": "",
  "lenderPhone": "",
  "lenderAddress": "",
  "lenderCity": "",
  "lenderState": "",
  "lenderZip": "",
  "dealerName": "",
  "dealerPhone": "",
  "dealerAddress": "",
  "dealerCity": "",
  "dealerState": "",
  "dealerZip": ""
}

EXTRACTION RULES:

consumerName / consumerName2:
- The primary buyer or borrower name. If there is a co-buyer, put them in consumerName2.

vin:
- Vehicle Identification Number. ALWAYS uppercase, remove any spaces.

consumerAddress / consumerCity / consumerState / consumerZip:
- Consumer's mailing address. Use 2-letter state abbreviation.

cancelDate:
- Format: MM/DD/YYYY
- Use the loan payoff date, effective cancellation date, or letter date — whichever is most relevant.

cancelReason:
- Must be exactly one of: customerRequest, dealUnwind, earlyPayoff, reWrite, repossession, tradeIn, totalLoss
- If the document mentions "early payoff", "paid off early", "early loan payoff", or "paid" → use "earlyPayoff"
- If the document mentions "trade" or "trade-in" → use "tradeIn"
- If the document mentions "repossession" or "repo" → use "repossession"
- If the document mentions "deal unwind" → use "dealUnwind"
- If the document mentions "rewrite" or "re-write" → use "reWrite"
- If the document mentions "total loss" → use "totalLoss"
- Default to "customerRequest" if the reason is unclear

refundTo:
- Must be exactly one of: dealer, lienholder, consumer
- If a lender or credit union is requesting the refund and wants the check sent to themselves → use "lienholder"
- Default to "lienholder" for most scenarios

lenderName / lenderPhone / lenderAddress / lenderCity / lenderState / lenderZip:
- The lender, lessor, or credit union info. Use 2-letter state abbreviation.

dealerName / dealerPhone / dealerAddress / dealerCity / dealerState / dealerZip:
- Look for the dealership name in the document header, body, or address block.
- Extract whichever dealer is referenced in this specific document.
- Do NOT hardcode or assume a dealer name — only extract what appears in the document.
- Common locations: letterhead, address blocks, dealer sections of contracts, "Dealer" fields.

GENERAL RULES:
- All dates must be MM/DD/YYYY format.
- All state fields must be 2-letter abbreviations.
- VIN must be uppercase with no spaces.
- If a field is not found in the document, return empty string "".
- Return ONLY valid JSON, no explanation or markdown.`;
  }

  // Web form mode — generic extraction prompt
  return `You are a document data extraction assistant. Extract all form-relevant data from the uploaded PDF and return it as a flat JSON object with descriptive field names. Return ONLY valid JSON.`;
}
