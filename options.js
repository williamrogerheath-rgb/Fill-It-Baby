// --- API Key ---
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const keyStatus = document.getElementById('key-status');

chrome.storage.sync.get('apiKey', ({ apiKey }) => {
  if (apiKey) apiKeyInput.value = apiKey;
});

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showKeyStatus('Please enter an API key.', true);
    return;
  }
  chrome.storage.sync.set({ apiKey: key }, () => {
    showKeyStatus('API key saved.');
  });
});

function showKeyStatus(msg, isError) {
  keyStatus.textContent = msg;
  keyStatus.className = 'status-msg' + (isError ? ' error' : '');
  keyStatus.hidden = false;
}

// --- Dealer Defaults ---
const dealerListEl = document.getElementById('dealer-list');
const noDealersMsg = document.getElementById('no-dealers');
const addDealerBtn = document.getElementById('add-dealer-btn');
const dealerForm = document.getElementById('dealer-form');
const saveDealerBtn = document.getElementById('save-dealer-btn');
const cancelDealerBtn = document.getElementById('cancel-dealer-btn');

const dealerFields = {
  name: document.getElementById('dealer-name'),
  phone: document.getElementById('dealer-phone'),
  address: document.getElementById('dealer-address'),
  city: document.getElementById('dealer-city'),
  state: document.getElementById('dealer-state'),
  zip: document.getElementById('dealer-zip')
};

function loadDealers() {
  chrome.storage.sync.get('dealerDefaults', ({ dealerDefaults }) => {
    renderDealerList(dealerDefaults || []);
  });
}

function renderDealerList(dealers) {
  dealerListEl.innerHTML = '';

  if (dealers.length === 0) {
    noDealersMsg.hidden = false;
    return;
  }

  noDealersMsg.hidden = true;

  dealers.forEach((dealer, index) => {
    const li = document.createElement('li');

    const info = document.createElement('div');
    info.className = 'dealer-info';

    const nameSpan = document.createElement('div');
    nameSpan.className = 'dealer-name';
    nameSpan.textContent = dealer.dealerName;

    const addrSpan = document.createElement('div');
    addrSpan.className = 'dealer-address';
    const parts = [dealer.dealerAddress, dealer.dealerCity, dealer.dealerState, dealer.dealerZip]
      .filter(Boolean);
    addrSpan.textContent = parts.join(', ');

    info.appendChild(nameSpan);
    info.appendChild(addrSpan);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteDealer(index));

    li.appendChild(info);
    li.appendChild(deleteBtn);
    dealerListEl.appendChild(li);
  });
}

function deleteDealer(index) {
  chrome.storage.sync.get('dealerDefaults', ({ dealerDefaults }) => {
    const dealers = dealerDefaults || [];
    dealers.splice(index, 1);
    chrome.storage.sync.set({ dealerDefaults: dealers }, () => {
      renderDealerList(dealers);
    });
  });
}

addDealerBtn.addEventListener('click', () => {
  clearDealerForm();
  dealerForm.hidden = false;
  addDealerBtn.hidden = true;
});

cancelDealerBtn.addEventListener('click', () => {
  dealerForm.hidden = true;
  addDealerBtn.hidden = false;
});

saveDealerBtn.addEventListener('click', () => {
  const name = dealerFields.name.value.trim();
  if (!name) {
    dealerFields.name.focus();
    return;
  }

  const newDealer = {
    dealerName: name,
    dealerPhone: dealerFields.phone.value.trim(),
    dealerAddress: dealerFields.address.value.trim(),
    dealerCity: dealerFields.city.value.trim(),
    dealerState: dealerFields.state.value.trim(),
    dealerZip: dealerFields.zip.value.trim()
  };

  chrome.storage.sync.get('dealerDefaults', ({ dealerDefaults }) => {
    const dealers = dealerDefaults || [];
    dealers.push(newDealer);
    chrome.storage.sync.set({ dealerDefaults: dealers }, () => {
      renderDealerList(dealers);
      dealerForm.hidden = true;
      addDealerBtn.hidden = false;
    });
  });
});

function clearDealerForm() {
  Object.values(dealerFields).forEach((input) => { input.value = ''; });
}

// Init
loadDealers();

