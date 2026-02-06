// options.js — Settings page for API key and dealer defaults

document.addEventListener('DOMContentLoaded', () => {
  // --- API Key ---
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const apiKeyStatus = document.getElementById('apiKeyStatus');

  chrome.storage.sync.get('apiKey', ({ apiKey }) => {
    if (apiKey) apiKeyInput.value = apiKey;
  });

  saveApiKeyBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus(apiKeyStatus, 'Please enter an API key.', 'error');
      return;
    }
    chrome.storage.sync.set({ apiKey }, () => {
      showStatus(apiKeyStatus, 'API key saved.', 'success');
    });
  });

  // --- Dealer Defaults ---
  const dealerList = document.getElementById('dealerList');
  const emptyState = document.getElementById('emptyState');
  const addDealerBtn = document.getElementById('addDealerBtn');
  const dealerForm = document.getElementById('dealerForm');
  const editIndexInput = document.getElementById('editIndex');
  const saveDealerBtn = document.getElementById('saveDealerBtn');
  const cancelDealerBtn = document.getElementById('cancelDealerBtn');
  const dealerStatus = document.getElementById('dealerStatus');

  const dfFields = ['dfName', 'dfPhone', 'dfAddress', 'dfCity', 'dfState', 'dfZip'];
  const dealerKeys = ['dealerName', 'dealerPhone', 'dealerAddress', 'dealerCity', 'dealerState', 'dealerZip'];

  let dealers = [];

  // Load saved dealers
  chrome.storage.sync.get('dealerDefaults', ({ dealerDefaults }) => {
    dealers = dealerDefaults || [];
    renderDealerList();
  });

  function renderDealerList() {
    dealerList.innerHTML = '';
    emptyState.style.display = dealers.length === 0 ? 'block' : 'none';

    dealers.forEach((dealer, idx) => {
      const card = document.createElement('div');
      card.className = 'dealer-card';

      const addressParts = [dealer.dealerAddress, dealer.dealerCity, dealer.dealerState, dealer.dealerZip]
        .filter(Boolean);

      card.innerHTML = `
        <div class="dealer-card-header">
          <strong>${escapeHtml(dealer.dealerName)}</strong>
          <div class="dealer-card-actions">
            <button class="edit-btn" data-idx="${idx}">Edit</button>
            <button class="delete-btn btn-delete" data-idx="${idx}">Delete</button>
          </div>
        </div>
        <div class="dealer-card-detail">
          ${dealer.dealerPhone ? escapeHtml(dealer.dealerPhone) + '<br>' : ''}
          ${addressParts.length ? escapeHtml(addressParts.join(', ')) : ''}
        </div>
      `;
      dealerList.appendChild(card);
    });

    // Attach edit/delete handlers
    dealerList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditForm(Number(btn.dataset.idx)));
    });
    dealerList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteDealer(Number(btn.dataset.idx)));
    });
  }

  addDealerBtn.addEventListener('click', () => {
    editIndexInput.value = '-1';
    clearDealerForm();
    dealerForm.style.display = 'block';
    addDealerBtn.style.display = 'none';
    document.getElementById('dfName').focus();
  });

  cancelDealerBtn.addEventListener('click', () => {
    dealerForm.style.display = 'none';
    addDealerBtn.style.display = '';
  });

  saveDealerBtn.addEventListener('click', () => {
    const name = document.getElementById('dfName').value.trim();
    if (!name) {
      showStatus(dealerStatus, 'Dealer name is required.', 'error');
      return;
    }

    const dealer = {};
    dfFields.forEach((fieldId, i) => {
      dealer[dealerKeys[i]] = document.getElementById(fieldId).value.trim();
    });

    const idx = Number(editIndexInput.value);
    if (idx >= 0) {
      dealers[idx] = dealer;
    } else {
      dealers.push(dealer);
    }

    saveDealers(() => {
      dealerForm.style.display = 'none';
      addDealerBtn.style.display = '';
      renderDealerList();
      showStatus(dealerStatus, 'Dealer saved.', 'success');
    });
  });

  function openEditForm(idx) {
    const dealer = dealers[idx];
    editIndexInput.value = idx;
    dfFields.forEach((fieldId, i) => {
      document.getElementById(fieldId).value = dealer[dealerKeys[i]] || '';
    });
    dealerForm.style.display = 'block';
    addDealerBtn.style.display = 'none';
    document.getElementById('dfName').focus();
  }

  function deleteDealer(idx) {
    const name = dealers[idx].dealerName;
    if (!confirm(`Delete "${name}"?`)) return;
    dealers.splice(idx, 1);
    saveDealers(() => {
      renderDealerList();
      showStatus(dealerStatus, `"${name}" deleted.`, 'success');
    });
  }

  function clearDealerForm() {
    dfFields.forEach(id => { document.getElementById(id).value = ''; });
  }

  function saveDealers(callback) {
    chrome.storage.sync.set({ dealerDefaults: dealers }, callback);
  }

  // --- Helpers ---
  function showStatus(el, msg, type) {
    el.textContent = msg;
    el.className = 'status ' + type;
    setTimeout(() => { el.className = 'status'; }, 3000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
