// pdf-filler.js — Loads extracted data, lets user review, generates filled PDF

document.addEventListener('DOMContentLoaded', async () => {
  const generateBtn = document.getElementById('generateBtn');

  // Load extracted data from chrome.storage.local
  const { pdfFillData } = await chrome.storage.local.get('pdfFillData');
  const extractedData = pdfFillData ? pdfFillData.extractedData : null;

  if (extractedData) {
    prefillForm(extractedData);
  }

  // Check if dealer fields are empty — offer fallback from saved defaults
  await loadDealerDefaults(extractedData);

  generateBtn.addEventListener('click', () => generatePdf());
});

// Map from extracted JSON keys to form input IDs
const FIELD_MAP = {
  consumerName: 'consumerName',
  consumerName2: 'consumerName2',
  vin: 'vin',
  consumerAddress: 'address',
  consumerCity: 'city',
  consumerState: 'state',
  consumerZip: 'zip',
  cancelDate: 'requestedDateOfCancellation',
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
  dealerZip: 'dealerZip'
};

// Map cancellation reason values to checkbox IDs
const REASON_MAP = {
  customerRequest: 'customerRequest',
  dealUnwind: 'dealUnwind',
  earlyPayoff: 'earlyPayoff',
  reWrite: 'rewrite',
  repossession: 'repossession',
  tradeIn: 'tradeIn',
  totalLoss: 'totalLoss'
};

// Map refund-to values to checkbox IDs
const REFUND_MAP = {
  dealer: 'refundDealer',
  lienholder: 'refundLienHolder',
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
  if (data.cancelReason) {
    const checkboxId = REASON_MAP[data.cancelReason];
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

  // Use cancelDate for signature date fields if no separate signature dates
  if (data.cancelDate) {
    const sigDate1 = document.getElementById('consumerSignatureDate1');
    if (sigDate1 && !sigDate1.value) sigDate1.value = data.cancelDate;
    const sigDate2 = document.getElementById('consumerSignatureDate2');
    if (sigDate2 && !sigDate2.value) sigDate2.value = data.cancelDate;
  }
}

const DEALER_FIELD_IDS = ['dealerName', 'dealerPhone', 'dealerAddress', 'dealerCity', 'dealerState', 'dealerZip'];

function dealerFieldsEmpty() {
  return DEALER_FIELD_IDS.every(id => !document.getElementById(id).value.trim());
}

async function loadDealerDefaults(extractedData) {
  // Only offer fallback if Claude didn't extract dealer info
  if (!dealerFieldsEmpty()) return;

  const { dealerDefaults } = await chrome.storage.sync.get('dealerDefaults');
  if (!dealerDefaults || dealerDefaults.length === 0) return;

  if (dealerDefaults.length === 1) {
    // Single dealer — auto-fill immediately
    applyDealerProfile(dealerDefaults[0]);
    return;
  }

  // Multiple dealers — show picker dropdown
  const picker = document.getElementById('dealerDefaultPicker');
  const select = document.getElementById('dealerDefaultSelect');

  // Clear existing options beyond the placeholder
  select.innerHTML = '<option value="">-- Select a dealer --</option>';
  dealerDefaults.forEach((dealer, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = dealer.dealerName;
    select.appendChild(opt);
  });

  picker.style.display = 'block';

  select.addEventListener('change', () => {
    const idx = select.value;
    if (idx === '') {
      // Clear dealer fields if user deselects
      DEALER_FIELD_IDS.forEach(id => { document.getElementById(id).value = ''; });
      return;
    }
    applyDealerProfile(dealerDefaults[Number(idx)]);
  });
}

function applyDealerProfile(dealer) {
  document.getElementById('dealerName').value = dealer.dealerName || '';
  document.getElementById('dealerPhone').value = dealer.dealerPhone || '';
  document.getElementById('dealerAddress').value = dealer.dealerAddress || '';
  document.getElementById('dealerCity').value = dealer.dealerCity || '';
  document.getElementById('dealerState').value = dealer.dealerState || '';
  document.getElementById('dealerZip').value = dealer.dealerZip || '';
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
