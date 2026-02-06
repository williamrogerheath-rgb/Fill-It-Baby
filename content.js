chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fillForm') {
    fillForm(message.data);
    sendResponse({ success: true });
  }
});

async function fillForm(data) {
  const url = window.location.href;
  const profile = await loadFormProfile(url);

  if (profile) {
    fillWithProfile(data, profile);
  } else {
    fillWithHeuristics(data);
  }
}

async function loadFormProfile(url) {
  const profiles = [
    { file: 'form-profiles/mo-nol.json', pattern: 'dors.mo.gov/dmv/nol' }
  ];

  for (const p of profiles) {
    if (url.includes(p.pattern)) {
      try {
        const resp = await fetch(chrome.runtime.getURL(p.file));
        return await resp.json();
      } catch (e) {
        console.warn('Failed to load form profile:', p.file, e);
      }
    }
  }
  return null;
}

function fillWithProfile(data, profile) {
  const fields = profile.fields || {};
  for (const [dataKey, selector] of Object.entries(fields)) {
    if (data[dataKey] === undefined) continue;
    const el = document.querySelector(selector);
    if (el) {
      setFieldValue(el, data[dataKey]);
    }
  }
}

function fillWithHeuristics(data) {
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    const el = findFieldByLabel(key);
    if (el) {
      setFieldValue(el, value);
    }
  }
}

function findFieldByLabel(fieldName) {
  const readable = fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .toLowerCase();

  // Try matching by label text
  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    const text = label.textContent.trim().toLowerCase();
    if (text.includes(readable) || readable.includes(text)) {
      if (label.htmlFor) {
        const el = document.getElementById(label.htmlFor);
        if (el) return el;
      }
      const input = label.querySelector('input, select, textarea');
      if (input) return input;
    }
  }

  // Try matching by name or id attribute
  const inputs = document.querySelectorAll('input, select, textarea');
  for (const input of inputs) {
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    if (
      name.includes(readable) || readable.includes(name) ||
      id.includes(readable) || readable.includes(id) ||
      placeholder.includes(readable)
    ) {
      return input;
    }
  }

  return null;
}

function setFieldValue(el, value) {
  const strValue = String(value);
  if (el.tagName === 'SELECT') {
    const option = Array.from(el.options).find(
      (o) => o.value === strValue || o.textContent.trim() === strValue
    );
    if (option) {
      el.value = option.value;
    }
  } else if (el.type === 'checkbox') {
    el.checked = strValue === 'true' || strValue === '1';
  } else if (el.type === 'radio') {
    const radios = document.querySelectorAll(
      'input[type="radio"][name="' + el.name + '"]'
    );
    for (const radio of radios) {
      if (radio.value === strValue) {
        radio.checked = true;
        break;
      }
    }
  } else {
    el.value = strValue;
  }

  // Dispatch events so frameworks detect the change
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
