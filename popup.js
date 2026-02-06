// --- DOM Elements ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const fileInfo = document.getElementById('file-info');
const fileNameEl = document.getElementById('file-name');
const clearFile = document.getElementById('clear-file');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const uploadSection = document.getElementById('upload-section');
const pdfReview = document.getElementById('pdf-review');
const backBtn = document.getElementById('back-btn');
const generateBtn = document.getElementById('generate-btn');
const dealerDefaultsPicker = document.getElementById('dealer-defaults-picker');
const dealerSelect = document.getElementById('dealer-select');

let selectedFile = null;

// --- Helpers ---
function getMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : 'webForm';
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
  statusEl.hidden = false;
}

function hideStatus() {
  statusEl.hidden = true;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val) el.value = val;
}

function getVal(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

// --- File Handling ---
function setFile(file) {
  if (!file || file.type !== 'application/pdf') {
    showStatus('Please select a PDF file.', 'error');
    return;
  }
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileInfo.hidden = false;
  dropZone.style.display = 'none';
  submitBtn.disabled = false;
  hideStatus();
}

function clearSelection() {
  selectedFile = null;
  fileInput.value = '';
  fileInfo.hidden = true;
  dropZone.style.display = '';
  submitBtn.disabled = true;
  hideStatus();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- Drag & Drop ---
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) setFile(fileInput.files[0]);
});
clearFile.addEventListener('click', clearSelection);

// --- Back Button ---
backBtn.addEventListener('click', () => {
  pdfReview.hidden = true;
  uploadSection.hidden = false;
  hideStatus();
  clearSelection();
});

// --- Submit / Extract ---
submitBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  const mode = getMode();
  submitBtn.disabled = true;
  showStatus('Extracting data from PDF...', 'info');

  try {
    const base64 = await fileToBase64(selectedFile);

    const response = await chrome.runtime.sendMessage({
      type: 'extractPdf',
      pdf: base64,
      mode: mode
    });

    if (response.error) {
      showStatus('Error: ' + response.error, 'error');
      submitBtn.disabled = false;
      return;
    }

    if (mode === 'fillPdf' && response.data) {
      showReviewForm(response.data);
    } else if (mode === 'webForm') {
      showStatus('Form filled successfully!', 'success');
    } else {
      showStatus('No data returned from extraction.', 'error');
    }
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  }

  submitBtn.disabled = false;
});

// --- Review Form ---
function showReviewForm(data) {
  hideStatus();
  uploadSection.hidden = true;
  pdfReview.hidden = false;

  // Consumer
  setVal('r-consumerName', data.consumerName);
  setVal('r-consumerName2', data.consumerName2);
  setVal('r-vin', data.vin);
  setVal('r-address', data.consumerAddress);
  setVal('r-city', data.consumerCity);
  setVal('r-state', data.consumerState);
  setVal('r-zip', data.consumerZip);

  // Cancellation
  setVal('r-cancelDate', data.cancelDate);
  if (data.cancelReason) {
    document.getElementById('r-cancelReason').value = data.cancelReason;
  }
  if (data.refundTo) {
    document.getElementById('r-refundTo').value = data.refundTo;
  }

  // Lender
  setVal('r-lenderName', data.lenderName);
  setVal('r-lenderPhone', data.lenderPhone);
  setVal('r-lenderAddress', data.lenderAddress);
  setVal('r-lenderCity', data.lenderCity);
  setVal('r-lenderState', data.lenderState);
  setVal('r-lenderZip', data.lenderZip);

  // Dealer
  setVal('r-dealerName', data.dealerName);
  setVal('r-dealerPhone', data.dealerPhone);
  setVal('r-dealerAddress', data.dealerAddress);
  setVal('r-dealerCity', data.dealerCity);
  setVal('r-dealerState', data.dealerState);
  setVal('r-dealerZip', data.dealerZip);

  // Signature dates default to today
  const today = new Date();
  const todayStr = String(today.getMonth() + 1).padStart(2, '0') + '/' +
                   String(today.getDate()).padStart(2, '0') + '/' +
                   today.getFullYear();
  setVal('r-consumerDate1', todayStr);
  setVal('r-dealerDate1', todayStr);

  // Load dealer defaults if dealer wasn't extracted
  if (!data.dealerName) {
    loadDealerDefaults();
  }
}

// --- Dealer Defaults ---
function loadDealerDefaults() {
  chrome.storage.sync.get('dealerDefaults', (result) => {
    const defaults = result.dealerDefaults || [];
    if (defaults.length === 0) return;

    if (defaults.length === 1) {
      fillDealerFields(defaults[0]);
    } else {
      dealerDefaultsPicker.hidden = false;
      dealerSelect.innerHTML = '<option value="">-- Pick saved dealer --</option>';
      defaults.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = d.dealerName;
        dealerSelect.appendChild(opt);
      });
      dealerSelect.onchange = () => {
        const idx = dealerSelect.value;
        if (idx !== '') fillDealerFields(defaults[parseInt(idx)]);
      };
    }
  });
}

function fillDealerFields(dealer) {
  setVal('r-dealerName', dealer.dealerName);
  setVal('r-dealerPhone', dealer.dealerPhone);
  setVal('r-dealerAddress', dealer.dealerAddress);
  setVal('r-dealerCity', dealer.dealerCity);
  setVal('r-dealerState', dealer.dealerState);
  setVal('r-dealerZip', dealer.dealerZip);
}

// --- Generate Filled PDF ---
generateBtn.addEventListener('click', async () => {
  try {
    showStatus('Generating PDF...', 'info');

    // Check if PDFLib loaded
    if (typeof PDFLib === 'undefined') {
      showStatus('Error: pdf-lib not loaded. Check that pdf-lib.min.js exists.', 'error');
      return;
    }

    // Load the APPI template
    const templateUrl = chrome.runtime.getURL('templates/APPI_CANCELLATION.pdf');
    const templateResp = await fetch(templateUrl);
    if (!templateResp.ok) {
      showStatus('Error: Template not found. Put APPI_CANCELLATION.pdf in templates/ folder.', 'error');
      return;
    }
    const templateBytes = await templateResp.arrayBuffer();

    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Set text field safely
    function setText(fieldName, id) {
      try {
        const val = getVal(id);
        if (val) form.getTextField(fieldName).setText(val);
      } catch (e) { console.warn('[Fill It Baby] Field not found:', fieldName, e.message); }
    }

    // Check checkbox safely
    function setCheck(fieldName, shouldCheck) {
      try {
        if (shouldCheck) form.getCheckBox(fieldName).check();
      } catch (e) { console.warn('[Fill It Baby] Checkbox not found:', fieldName, e.message); }
    }

    // --- Fill Consumer ---
    setText('Consumer Name', 'r-consumerName');
    setText('Consumer Name_2', 'r-consumerName2');
    setText('VIN', 'r-vin');
    setText('Address', 'r-address');
    setText('City', 'r-city');
    setText('State', 'r-state');
    setText('Zip', 'r-zip');

    // --- Fill Cancellation ---
    setText('Requested Date of Cancellation', 'r-cancelDate');

    const reason = document.getElementById('r-cancelReason').value;
    setCheck('Customer Request', reason === 'customerRequest');
    setCheck('Deal Unwind', reason === 'dealUnwind');
    setCheck('Early Payoff', reason === 'earlyPayoff');
    setCheck('ReWrite', reason === 'reWrite');
    setCheck('Repossession', reason === 'repossession');
    setCheck('TradeIn', reason === 'tradeIn');
    setCheck('Total Loss  No Claim Filed', reason === 'totalLoss');

    const refund = document.getElementById('r-refundTo').value;
    setCheck('Dea', refund === 'dealer');
    setCheck('Lien Holder', refund === 'lienholder');
    setCheck('Consumer Proof of payoff from l', refund === 'consumer');

    // --- Fill Lender ---
    setText('LenderLessor Name', 'r-lenderName');
    setText('Telephone Number', 'r-lenderPhone');
    setText('Address_2', 'r-lenderAddress');
    setText('City_2', 'r-lenderCity');
    setText('State_2', 'r-lenderState');
    setText('Zip_2', 'r-lenderZip');

    // --- Fill Dealer ---
    setText('Dealer Name', 'r-dealerName');
    setText('Telephone Number_2', 'r-dealerPhone');
    setText('Address_3', 'r-dealerAddress');
    setText('City_3', 'r-dealerCity');
    setText('State_3', 'r-dealerState');
    setText('Zip_3', 'r-dealerZip');

    // --- Fill Dates ---
    setText('Date', 'r-consumerDate1');
    setText('Date_2', 'r-dealerDate1');

    // --- Save & Download ---
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const name = getVal('r-consumerName').replace(/\s+/g, '_') || 'filled';

    const a = document.createElement('a');
    a.href = url;
    a.download = `APPI_Cancellation_${name}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus('PDF generated! ✓', 'success');
  } catch (err) {
    console.error('[Fill It Baby] PDF generation error:', err);
    showStatus('Error: ' + err.message, 'error');
  }
});
