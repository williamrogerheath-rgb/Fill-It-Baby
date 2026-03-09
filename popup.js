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
const templateBar = document.getElementById('template-bar');
const templateSelect = document.getElementById('template-select');
const manageBtn = document.getElementById('manage-templates-btn');
const templateManager = document.getElementById('template-manager');
const genericReview = document.getElementById('generic-review');

let selectedFile = null;
let currentTemplate = null;

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

// --- Mode Toggle ---
document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const mode = getMode();
    templateBar.hidden = mode !== 'fillPdf';
    templateManager.hidden = true;
    pdfReview.hidden = true;
    genericReview.hidden = true;
    uploadSection.hidden = false;
    hideStatus();
  });
});

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

function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
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

// --- Back Buttons ---
backBtn.addEventListener('click', () => {
  pdfReview.hidden = true;
  uploadSection.hidden = false;
  hideStatus();
  clearSelection();
});

document.getElementById('gen-back-btn').addEventListener('click', () => {
  genericReview.hidden = true;
  uploadSection.hidden = false;
  hideStatus();
  clearSelection();
});

document.getElementById('tm-back-btn').addEventListener('click', () => {
  templateManager.hidden = true;
  uploadSection.hidden = false;
});

// --- Submit / Extract ---
submitBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  const mode = getMode();
  const selectedTemplate = mode === 'fillPdf' ? templateSelect.value : '';
  console.log('[Fill It Pro] Submit clicked. Mode:', mode, 'Template:', selectedTemplate);

  submitBtn.disabled = true;
  showStatus('Extracting data from PDF...', 'info');

  try {
    const base64 = await fileToBase64(selectedFile);

    const response = await chrome.runtime.sendMessage({
      type: 'extractPdf',
      pdf: base64,
      mode: mode,
      template: selectedTemplate
    });

    console.log('[Fill It Pro] Response received:', response);

    if (response.error) {
      showStatus('Error: ' + response.error, 'error');
      submitBtn.disabled = false;
      return;
    }

    if (mode === 'fillPdf' && response.data) {
      console.log('[Fill It Pro] fillPdf mode, template:', selectedTemplate);

      if (selectedTemplate === 'APPI_CANCELLATION') {
        showReviewForm(response.data);
      } else if (selectedTemplate) {
        console.log('[Fill It Pro] Routing to generic review...');
        try {
          const templates = await getTemplates();
          const tmpl = templates.find(t => t.id === selectedTemplate);
          console.log('[Fill It Pro] Found template:', tmpl ? tmpl.name : 'NOT FOUND');
          if (tmpl) {
            showGenericReview(response.data, tmpl);
          } else {
            showStatus('Template not found in storage.', 'error');
          }
        } catch (tmplErr) {
          console.error('[Fill It Pro] Template load error:', tmplErr);
          showStatus('Error loading template: ' + tmplErr.message, 'error');
        }
      } else {
        showStatus('Please select a template first.', 'error');
      }
    } else if (mode === 'webForm') {
      showStatus('Form filled successfully!', 'success');
    } else {
      showStatus('No data returned from extraction.', 'error');
    }
  } catch (err) {
    console.error('[Fill It Pro] Submit error:', err);
    showStatus('Error: ' + err.message, 'error');
  }

  submitBtn.disabled = false;
});

// --- APPI Review Form (EXISTING — UNCHANGED) ---
function showReviewForm(data) {
  hideStatus();
  uploadSection.hidden = true;
  pdfReview.hidden = false;

  setVal('r-consumerName', data.consumerName);
  setVal('r-consumerName2', data.consumerName2);
  setVal('r-vin', data.vin);
  setVal('r-address', data.consumerAddress);
  setVal('r-city', data.consumerCity);
  setVal('r-state', data.consumerState);
  setVal('r-zip', data.consumerZip);

  setVal('r-cancelDate', data.cancelDate);
  if (data.cancelReason) {
    document.getElementById('r-cancelReason').value = data.cancelReason;
  }
  if (data.refundTo) {
    document.getElementById('r-refundTo').value = data.refundTo;
  }

  setVal('r-lenderName', data.lenderName);
  setVal('r-lenderPhone', data.lenderPhone);
  setVal('r-lenderAddress', data.lenderAddress);
  setVal('r-lenderCity', data.lenderCity);
  setVal('r-lenderState', data.lenderState);
  setVal('r-lenderZip', data.lenderZip);

  setVal('r-dealerName', data.dealerName);
  setVal('r-dealerPhone', data.dealerPhone);
  setVal('r-dealerAddress', data.dealerAddress);
  setVal('r-dealerCity', data.dealerCity);
  setVal('r-dealerState', data.dealerState);
  setVal('r-dealerZip', data.dealerZip);

  const today = new Date();
  const todayStr = String(today.getMonth() + 1).padStart(2, '0') + '/' +
                   String(today.getDate()).padStart(2, '0') + '/' +
                   today.getFullYear();
  setVal('r-consumerDate1', todayStr);
  setVal('r-dealerDate1', todayStr);

  if (!data.dealerName) {
    loadDealerDefaults();
  }
}

// --- Dealer Defaults (EXISTING — UNCHANGED) ---
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

// --- APPI Generate (EXISTING — UNCHANGED) ---
generateBtn.addEventListener('click', async () => {
  try {
    showStatus('Generating PDF...', 'info');

    if (typeof PDFLib === 'undefined') {
      showStatus('Error: pdf-lib not loaded.', 'error');
      return;
    }

    const templateUrl = chrome.runtime.getURL('templates/APPI_CANCELLATION.pdf');
    const templateResp = await fetch(templateUrl);
    if (!templateResp.ok) {
      showStatus('Error: APPI template not found.', 'error');
      return;
    }
    const templateBytes = await templateResp.arrayBuffer();

    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    function setText(fieldName, id) {
      try {
        const val = getVal(id);
        if (val) form.getTextField(fieldName).setText(val);
      } catch (e) { console.warn('[Fill It Pro] Field not found:', fieldName, e.message); }
    }

    function setCheck(fieldName, shouldCheck) {
      try {
        if (shouldCheck) form.getCheckBox(fieldName).check();
      } catch (e) { console.warn('[Fill It Pro] Checkbox not found:', fieldName, e.message); }
    }

    setText('Consumer Name', 'r-consumerName');
    setText('Consumer Name_2', 'r-consumerName2');
    setText('VIN', 'r-vin');
    setText('Address', 'r-address');
    setText('City', 'r-city');
    setText('State', 'r-state');
    setText('Zip', 'r-zip');
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

    setText('LenderLessor Name', 'r-lenderName');
    setText('Telephone Number', 'r-lenderPhone');
    setText('Address_2', 'r-lenderAddress');
    setText('City_2', 'r-lenderCity');
    setText('State_2', 'r-lenderState');
    setText('Zip_2', 'r-lenderZip');
    setText('Dealer Name', 'r-dealerName');
    setText('Telephone Number_2', 'r-dealerPhone');
    setText('Address_3', 'r-dealerAddress');
    setText('City_3', 'r-dealerCity');
    setText('State_3', 'r-dealerState');
    setText('Zip_3', 'r-dealerZip');
    setText('Date', 'r-consumerDate1');
    setText('Date_2', 'r-dealerDate1');

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
    console.error('[Fill It Pro] PDF generation error:', err);
    showStatus('Error: ' + err.message, 'error');
  }
});


// ============================================================
// TEMPLATE MANAGEMENT
// ============================================================

function getTemplates() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('pdfTemplates', result => {
      resolve(result.pdfTemplates || []);
    });
  });
}

function saveTemplates(templates) {
  return new Promise(resolve => {
    chrome.storage.local.set({ pdfTemplates: templates }, resolve);
  });
}

async function refreshTemplateDropdown() {
  const templates = await getTemplates();
  const opts = templateSelect.querySelectorAll('option[data-dynamic]');
  opts.forEach(o => o.remove());
  templates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    opt.setAttribute('data-dynamic', 'true');
    templateSelect.appendChild(opt);
  });
}
refreshTemplateDropdown();

// --- Manage Templates Button ---
manageBtn.addEventListener('click', () => {
  uploadSection.hidden = true;
  pdfReview.hidden = true;
  genericReview.hidden = true;
  templateManager.hidden = false;
  refreshTemplateList();
});

// --- Template Upload & Scan ---
let scannedFields = [];
let scannedPdfBytes = null;

document.getElementById('tm-upload-btn').addEventListener('click', () => {
  document.getElementById('tm-file-input').click();
});

document.getElementById('tm-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    showStatus('Scanning PDF fields...', 'info');
    const arrayBuffer = await fileToArrayBuffer(file);
    scannedPdfBytes = new Uint8Array(arrayBuffer);

    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    // Detect field type by trying methods — constructor.name doesn't survive storage
    scannedFields = [];
    for (const f of fields) {
      const name = f.getName();
      let type = 'text';
      try {
        // If getText exists and doesn't throw, it's a text field
        form.getTextField(name);
        type = 'text';
      } catch (e1) {
        try {
          form.getCheckBox(name);
          type = 'checkbox';
        } catch (e2) {
          try {
            form.getRadioGroup(name);
            type = 'radio';
          } catch (e3) {
            try {
              form.getDropdown(name);
              type = 'dropdown';
            } catch (e4) {
              try {
                form.getSignature(name);
                type = 'signature';
              } catch (e5) {
                type = 'other';
              }
            }
          }
        }
      }
      if (type !== 'signature') {
        scannedFields.push({ name: name, type: type });
      }
    }

    const textCount = scannedFields.filter(f => f.type === 'text').length;
    const checkCount = scannedFields.filter(f => f.type === 'checkbox' || f.type === 'radio').length;

    document.getElementById('tm-scan-result').hidden = false;
    document.getElementById('tm-field-count').textContent =
      scannedFields.length + ' fillable fields found (' + textCount + ' text, ' + checkCount + ' checkbox/radio)';
    document.getElementById('tm-name').value = file.name.replace('.pdf', '').replace(/[_-]/g, ' ');
    hideStatus();
  } catch (err) {
    showStatus('Error scanning PDF: ' + err.message, 'error');
  }
});

// --- Save Template ---
document.getElementById('tm-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('tm-name').value.trim();
  if (!name) {
    showStatus('Please enter a template name.', 'error');
    return;
  }
  if (scannedFields.length === 0) {
    showStatus('No fields scanned.', 'error');
    return;
  }

  let binary = '';
  for (let i = 0; i < scannedPdfBytes.length; i++) {
    binary += String.fromCharCode(scannedPdfBytes[i]);
  }
  const base64 = btoa(binary);
  const id = 'tmpl_' + Date.now();

  console.log('[Fill It Pro] Saving template:', name, 'Fields:', scannedFields.length, 'Types:', JSON.stringify(scannedFields.slice(0,3)));

  const templates = await getTemplates();
  templates.push({
    id: id,
    name: name,
    fields: scannedFields,
    pdfBase64: base64
  });
  await saveTemplates(templates);

  scannedFields = [];
  scannedPdfBytes = null;
  document.getElementById('tm-scan-result').hidden = true;
  document.getElementById('tm-file-input').value = '';

  showStatus('Template "' + name + '" saved!', 'success');
  refreshTemplateDropdown();
  refreshTemplateList();
});

// --- Template List in Manager ---
async function refreshTemplateList() {
  const list = document.getElementById('tm-list');
  const templates = await getTemplates();

  if (templates.length === 0) {
    list.innerHTML = '<p class="hint">No custom templates saved yet.</p>';
    return;
  }

  list.innerHTML = '';
  templates.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'tm-item';
    row.innerHTML = '<span>' + t.name + ' (' + t.fields.length + ' fields)</span>' +
      '<button class="btn-small tm-delete" data-idx="' + i + '">&times;</button>';
    list.appendChild(row);
  });

  list.querySelectorAll('.tm-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-idx'));
      const templates = await getTemplates();
      templates.splice(idx, 1);
      await saveTemplates(templates);
      refreshTemplateDropdown();
      refreshTemplateList();
    });
  });
}

// ============================================================
// GENERIC REVIEW & GENERATE
// ============================================================

function showGenericReview(data, template) {
  console.log('[Fill It Pro] showGenericReview called with', Object.keys(data).length, 'data keys');
  hideStatus();
  uploadSection.hidden = true;
  genericReview.hidden = false;
  currentTemplate = template;

  document.getElementById('gen-review-title').textContent = template.name;

  const container = document.getElementById('gen-fields');
  container.innerHTML = '';

  const textFields = template.fields.filter(f => f.type === 'text');
  console.log('[Fill It Pro] Text fields:', textFields.length);

  textFields.forEach(f => {
    const div = document.createElement('div');
    div.className = 'field';

    const label = document.createElement('label');
    label.textContent = f.name;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'gen-' + f.name.replace(/[^a-zA-Z0-9]/g, '_');
    input.setAttribute('data-field-name', f.name);

    const matched = matchField(f.name, data);
    if (matched !== null) {
      input.value = matched;
    }

    div.appendChild(label);
    div.appendChild(input);
    container.appendChild(div);
  });

  const checkFields = template.fields.filter(f => f.type === 'checkbox' || f.type === 'radio');
  if (checkFields.length > 0) {
    const section = document.createElement('div');
    section.className = 'review-section';
    const sLabel = document.createElement('div');
    sLabel.className = 'section-label';
    sLabel.textContent = 'Checkboxes';
    section.appendChild(sLabel);

    checkFields.forEach(f => {
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'gen-' + f.name.replace(/[^a-zA-Z0-9]/g, '_');
      cb.setAttribute('data-field-name', f.name);

      const label = document.createElement('label');
      label.textContent = f.name;
      label.style.cssText = 'font-size:11px;color:#8b90a5;margin:0;';

      div.appendChild(cb);
      div.appendChild(label);
      section.appendChild(div);
    });
    container.appendChild(section);
  }
}

// Direct key lookup — Claude returns exact field names as keys, no fuzzy matching needed
function matchField(fieldName, data) {
  // Exact match (Claude should return exact field names)
  if (data.hasOwnProperty(fieldName)) {
    return String(data[fieldName]);
  }
  return null;
}

// --- Generic Generate ---
document.getElementById('gen-generate-btn').addEventListener('click', async () => {
  if (!currentTemplate) return;

  try {
    showStatus('Generating PDF...', 'info');

    const { PDFDocument } = PDFLib;

    const binaryStr = atob(currentTemplate.pdfBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const pdfDoc = await PDFDocument.load(bytes);
    const form = pdfDoc.getForm();

    const textInputs = document.querySelectorAll('#gen-fields input[type="text"]');
    textInputs.forEach(input => {
      const fieldName = input.getAttribute('data-field-name');
      const val = input.value.trim();
      if (fieldName && val) {
        try { form.getTextField(fieldName).setText(val); }
        catch (e) { console.warn('[Fill It Pro] Could not set:', fieldName); }
      }
    });

    const checkInputs = document.querySelectorAll('#gen-fields input[type="checkbox"]');
    checkInputs.forEach(input => {
      const fieldName = input.getAttribute('data-field-name');
      if (fieldName && input.checked) {
        try { form.getCheckBox(fieldName).check(); }
        catch (e) { console.warn('[Fill It Pro] Could not check:', fieldName); }
      }
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = currentTemplate.name.replace(/\s+/g, '_') + '_filled.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus('PDF generated! ✓', 'success');
  } catch (err) {
    console.error('[Fill It Pro] Generic PDF generation error:', err);
    showStatus('Error: ' + err.message, 'error');
  }
});

