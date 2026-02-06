const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('status');

// Click the drop zone to open file picker
dropZone.addEventListener('click', () => fileInput.click());

// Drag-and-drop visual feedback
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// File input change
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  if (file.type !== 'application/pdf') {
    showStatus('Please upload a PDF file.', 'error');
    return;
  }

  showStatus('Reading PDF...', 'info');

  const reader = new FileReader();
  reader.onload = () => {
    // reader.result is a data URL like "data:application/pdf;base64,..."
    const base64 = reader.result.split(',')[1];
    showStatus('Extracting data with Claude...', 'info');

    chrome.runtime.sendMessage(
      { action: 'extractPdf', pdfBase64: base64 },
      (response) => {
        if (chrome.runtime.lastError) {
          showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        if (response && response.error) {
          showStatus('Error: ' + response.error, 'error');
          return;
        }
        if (response && response.success) {
          showStatus('Form filled successfully!', 'success');
        }
      }
    );
  };
  reader.onerror = () => showStatus('Failed to read file.', 'error');
  reader.readAsDataURL(file);
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
  statusEl.hidden = false;
}
