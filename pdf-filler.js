// pdf-filler.js — Loads extracted data, lets user review, generates filled PDF

document.addEventListener('DOMContentLoaded', async () => {
  const generateBtn = document.getElementById('generateBtn');

  // Load extracted data from chrome.storage.local
  const { pdfFillData } = await chrome.storage.local.get('pdfFillData');

  if (pdfFillData && pdfFillData.extractedData) {
    prefillForm(pdfFillData.extractedData);
  }

  generateBtn.addEventListener('click', () => generatePdf());
});

// Map from extracted JSON keys to form input IDs
const FIELD_MAP = {
  consumerName: 'consumerName',
  consumerName2: 'consumerName2',
  vin: 'vin',
  address: 'address',
  city: 'city',
  state: 'state',
  zip: 'zip',
  requestedDateOfCancellation: 'requestedDateOfCancellation',
  lenderName: 'lenderName',
  lenderPhone: 'lenderPhone',
  lenderAddress: 'lenderAddress',
  lenderCity: 'lenderCity',
  lenderState: 'lenderState',
  lenderZip: 'lenderZip',
  dealerName: 'dealerName',
  dealerPhone: 'dealerPhone',
  dealerAddress: 'dealerAddress',
  dealerCity: 'dealerCity',
  dealerState: 'dealerState',
  dealerZip: 'dealerZip',
  consumerSignatureDate: 'consumerSignatureDate1',
  dealerSignatureDate: 'dealerSignatureDate1'
};

// Map cancellation reason values to checkbox IDs
const REASON_MAP = {
  customerRequest: 'customerRequest',
  dealUnwind: 'dealUnwind',
  earlyPayoff: 'earlyPayoff',
  rewrite: 'rewrite',
  repossession: 'repossession',
  tradeIn: 'tradeIn',
  totalLoss: 'totalLoss'
};

// Map refund-to values to checkbox IDs
const REFUND_MAP = {
  dealer: 'refundDealer',
  lienHolder: 'refundLienHolder',
  consumer: 'refundConsumer'
};

function prefillForm(data) {
  // Fill text fields
  for (const [dataKey, inputId] of Object.entries(FIELD_MAP)) {
    const value = data[dataKey];
    if (value) {
      const input = document.getElementById(inputId);
      if (input) input.value = value;
    }
  }

  // Fill cancellation reason checkbox
  if (data.cancellationReason) {
    const checkboxId = REASON_MAP[data.cancellationReason];
    if (checkboxId) {
      const cb = document.getElementById(checkboxId);
      if (cb) cb.checked = true;
    }
  }

  // Fill refund-to checkbox
  if (data.refundTo) {
    const checkboxId = REFUND_MAP[data.refundTo];
    if (checkboxId) {
      const cb = document.getElementById(checkboxId);
      if (cb) cb.checked = true;
    }
  }

  // Copy consumer signature date to both date fields
  if (data.consumerSignatureDate) {
    const d2 = document.getElementById('consumerSignatureDate2');
    if (d2 && !d2.value) d2.value = data.consumerSignatureDate;
  }

  // Copy dealer signature date to both date fields
  if (data.dealerSignatureDate) {
    const d2 = document.getElementById('dealerSignatureDate2');
    if (d2 && !d2.value) d2.value = data.dealerSignatureDate;
  }
}

async function generatePdf() {
  const generateBtn = document.getElementById('generateBtn');
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating...';

  try {
    // Load the APPI template PDF
    const templateUrl = chrome.runtime.getURL('templates/APPI_CANCELLATION.pdf');
    const templateBytes = await fetch(templateUrl).then(r => r.arrayBuffer());

    const pdfDoc = await PDFLib.PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Fill all text fields using data-pdf-field attributes
    const textInputs = document.querySelectorAll('input[type="text"][data-pdf-field]');
    for (const input of textInputs) {
      const pdfFieldName = input.dataset.pdfField;
      const value = input.value.trim();
      if (value) {
        try {
          const field = form.getTextField(pdfFieldName);
          field.setText(value);
        } catch (e) {
          console.warn(`Could not set text field "${pdfFieldName}":`, e.message);
        }
      }
    }

    // Fill all checkboxes using data-pdf-field attributes
    const checkboxInputs = document.querySelectorAll('input[type="checkbox"][data-pdf-field]');
    for (const input of checkboxInputs) {
      const pdfFieldName = input.dataset.pdfField;
      if (input.checked) {
        try {
          const field = form.getCheckBox(pdfFieldName);
          field.check();
        } catch (e) {
          console.warn(`Could not check "${pdfFieldName}":`, e.message);
        }
      }
    }

    // Flatten form so fields are no longer editable
    form.flatten();

    // Generate and download
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const consumerName = document.getElementById('consumerName').value.trim().replace(/\s+/g, '_') || 'Unknown';
    const filename = `APPI_Cancellation_${consumerName}.pdf`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    generateBtn.textContent = 'Downloaded!';
    setTimeout(() => {
      generateBtn.textContent = 'Generate PDF';
      generateBtn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('PDF generation error:', err);
    generateBtn.textContent = 'Error — see console';
    setTimeout(() => {
      generateBtn.textContent = 'Generate PDF';
      generateBtn.disabled = false;
    }, 3000);
  }
}
