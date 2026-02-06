// popup.js — Upload UI with mode toggle (Fill Web Form vs Fill PDF)

document.addEventListener('DOMContentLoaded', () => {
  const modeTabs = document.querySelectorAll('.mode-tab');
  const templateSection = document.getElementById('templateSection');
  const templateSelect = document.getElementById('templateSelect');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const fileNameDiv = document.getElementById('fileName');
  const actionBtn = document.getElementById('actionBtn');
  const statusDiv = document.getElementById('status');

  let currentMode = 'webForm';
  let selectedFile = null;

  // Mode toggle
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;

      if (currentMode === 'fillPdf') {
        templateSection.classList.remove('hidden');
        actionBtn.textContent = selectedFile ? 'Extract & Fill PDF' : 'Extract & Fill PDF';
      } else {
        templateSection.classList.add('hidden');
        actionBtn.textContent = 'Fill Form';
      }
    });
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handleFile(file);
    } else {
      showStatus('Please upload a PDF file.', 'error');
    }
  });

  // File input
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    selectedFile = file;
    fileNameDiv.textContent = file.name;
    fileNameDiv.classList.remove('hidden');
    actionBtn.disabled = false;
    if (currentMode === 'fillPdf') {
      actionBtn.textContent = 'Extract & Fill PDF';
    } else {
      actionBtn.textContent = 'Fill Form';
    }
    hideStatus();
  }

  // Action button
  actionBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    actionBtn.disabled = true;
    showStatus('Reading PDF...', 'loading');

    try {
      const base64 = await fileToBase64(selectedFile);
      const template = currentMode === 'fillPdf' ? templateSelect.value : null;

      showStatus('Extracting data with Claude...', 'loading');

      const response = await chrome.runtime.sendMessage({
        action: 'extractPdf',
        pdfBase64: base64,
        mode: currentMode,
        template
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      if (currentMode === 'fillPdf') {
        // Store extracted data and open pdf-filler page
        await chrome.storage.local.set({
          pdfFillData: {
            extractedData: response.data,
            template: templateSelect.value
          }
        });

        const fillerUrl = chrome.runtime.getURL('pdf-filler.html');
        chrome.tabs.create({ url: fillerUrl });
        showStatus('Opening PDF filler...', 'success');
      } else {
        // Send to content script for web form filling
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const fillResponse = await chrome.tabs.sendMessage(tab.id, {
          action: 'fillForm',
          data: response.data
        });

        if (fillResponse.success) {
          showStatus(`Filled ${fillResponse.filledCount} fields.`, 'success');
        } else {
          throw new Error(fillResponse.error);
        }
      }
    } catch (err) {
      showStatus(err.message, 'error');
    } finally {
      actionBtn.disabled = false;
    }
  });

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function showStatus(msg, type) {
    statusDiv.textContent = msg;
    statusDiv.className = 'status ' + type;
    statusDiv.classList.remove('hidden');
  }

  function hideStatus() {
    statusDiv.classList.add('hidden');
  }
});
