const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const clearFile = document.getElementById('clear-file');
const submitBtn = document.getElementById('submit-btn');
const status = document.getElementById('status');

let selectedFile = null;

function getMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : 'webForm';
}

function showStatus(message, type) {
  status.textContent = message;
  status.className = 'status ' + type;
  status.hidden = false;
}

function hideStatus() {
  status.hidden = true;
}

function setFile(file) {
  if (!file || file.type !== 'application/pdf') {
    showStatus('Please select a PDF file.', 'error');
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
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
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  setFile(file);
});

dropZone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    setFile(fileInput.files[0]);
  }
});

clearFile.addEventListener('click', clearSelection);

// Submit
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

    if (mode === 'fillPdf') {
      showStatus('Data extracted successfully.', 'success');
      console.log('Extracted PDF data:', response.data);
    } else {
      showStatus('Form filled successfully!', 'success');
    }
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  }

  submitBtn.disabled = false;
});
