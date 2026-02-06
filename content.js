// Content script — injected into web pages to find and fill form fields.
// Receives extracted data from background.js and applies it to the page.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fillForm') {
    console.log('[Fill It Baby] Received fillForm data:', message.data);
    fillForm(message.data);
    sendResponse({ success: true });
  }
});

async function fillForm(data) {
  const profile = await loadMatchingProfile();

  if (profile) {
    console.log('[Fill It Baby] Matched profile:', profile.name);
    fillWithProfile(data, profile);
  } else {
    console.log('[Fill It Baby] No profile matched, using heuristics');
    fillWithHeuristics(data);
  }
}

// --- Profile-based filling (known sites) ---

async function loadMatchingProfile() {
  const url = window.location.href;
  const profiles = ['mo-nol', 'mo-trpa'];

  for (const name of profiles) {
    try {
      const profileUrl = chrome.runtime.getURL('form-profiles/' + name + '.json');
      const response = await fetch(profileUrl);
      const profile = await response.json();
      if (url.includes(profile.urlPattern)) {
        return profile;
      }
    } catch (e) {
      // Profile failed to load — skip it
    }
  }
  return null;
}

function fillWithProfile(data, profile) {
  // If lienholderSelect is "info", activate manual entry mode first
  // so the page enables the lienholder input fields before we fill them.
  if (data.lienholderSelect === 'info' && profile.fields.lienholderSelect) {
    activateLienholderManualEntry(profile.fields.lienholderSelect);
  }

  for (const [fieldName, fieldDef] of Object.entries(profile.fields)) {
    // Already handled above — skip so we don't re-fire
    if (fieldName === 'lienholderSelect' && data.lienholderSelect === 'info') continue;

    const value = data[fieldName];
    if (value === undefined || value === null || value === '') {
      console.log('[Fill It Baby] Field "%s" — no data, skipping', fieldName);
      continue;
    }

    const def = typeof fieldDef === 'string'
      ? { selector: fieldDef }
      : fieldDef;

    const el = document.querySelector(def.selector);
    console.log('[Fill It Baby] Field "%s" → selector "%s" — element %s, value: %o',
      fieldName, def.selector, el ? 'FOUND' : 'NOT FOUND', value);

    const type = def.type || '';

    if (type === 'date') {
      fillDateField(def, value);
    } else if (type === 'select+text') {
      fillSelectWithTextFallback(def, value);
    } else if (type === 'radio') {
      fillRadio(def, value);
    } else if (type === 'checkbox') {
      fillCheckbox(def, value);
    } else if (type === 'select') {
      fillSelect(def, value);
    } else {
      fillTextField(def, value);
    }
  }
}

function activateLienholderManualEntry(fieldDef) {
  const def = typeof fieldDef === 'string' ? { selector: fieldDef } : fieldDef;
  const radios = document.querySelectorAll(def.selector);

  for (const radio of radios) {
    if (radio.value === 'info') {
      radio.checked = true;
      // Dispatch a real click event to trigger the page's onclick handler
      radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fireEvents(radio);

      console.log('[Fill It Baby] Activated lienholderSelect "info" mode');
      return;
    }
  }
  console.log('[Fill It Baby] lienholderSelect "info" radio not found');
}

// --- Field type handlers ---

function fillTextField(def, value) {
  const el = document.querySelector(def.selector);
  if (!el) return;

  const truncated = def.maxlength ? String(value).slice(0, def.maxlength) : String(value);
  el.value = truncated;
  fireEvents(el);
}

function fillSelect(def, value) {
  const el = document.querySelector(def.selector);
  if (!el) return;

  const str = String(value);

  // Try exact value match, then case-insensitive text match
  for (const opt of el.options) {
    if (opt.value === str) {
      el.value = opt.value;
      fireEvents(el);
      return;
    }
  }
  for (const opt of el.options) {
    if (opt.textContent.trim().toLowerCase() === str.toLowerCase()) {
      el.value = opt.value;
      fireEvents(el);
      return;
    }
  }
  // Try partial match (e.g. "Missouri" matching "MO - Missouri")
  for (const opt of el.options) {
    if (opt.textContent.toLowerCase().includes(str.toLowerCase())) {
      el.value = opt.value;
      fireEvents(el);
      return;
    }
  }
}

function fillSelectWithTextFallback(def, value) {
  const selectEl = document.querySelector(def.selector);
  if (!selectEl) return;

  const str = String(value).toUpperCase();

  // Try matching the select options first
  for (const opt of selectEl.options) {
    if (opt.value.toUpperCase() === str ||
        opt.textContent.trim().toUpperCase() === str) {
      selectEl.value = opt.value;
      fireEvents(selectEl);
      return;
    }
  }
  // Partial match (e.g. "FORD" in "FORD - Ford Motor Company")
  for (const opt of selectEl.options) {
    if (opt.textContent.toUpperCase().includes(str)) {
      selectEl.value = opt.value;
      fireEvents(selectEl);
      return;
    }
  }

  // No match in select — use the text fallback input (e.g. "Other" make)
  if (def.textFallback) {
    // Select the "Other" option if one exists
    for (const opt of selectEl.options) {
      if (opt.value.toLowerCase() === 'other' ||
          opt.textContent.trim().toLowerCase() === 'other') {
        selectEl.value = opt.value;
        fireEvents(selectEl);
        break;
      }
    }
    const textEl = document.querySelector(def.textFallback);
    if (textEl) {
      textEl.value = str;
      fireEvents(textEl);
    }
  }
}

function fillRadio(def, value) {
  const str = String(value);
  // Find the radio button with the matching value
  const radios = document.querySelectorAll(def.selector);
  for (const radio of radios) {
    if (radio.value === str) {
      radio.checked = true;
      fireEvents(radio);
      return;
    }
  }
  // Case-insensitive fallback
  for (const radio of radios) {
    if (radio.value.toLowerCase() === str.toLowerCase()) {
      radio.checked = true;
      fireEvents(radio);
      return;
    }
  }
}

function fillCheckbox(def, value) {
  const el = document.querySelector(def.selector);
  if (!el) return;

  const shouldCheck = value === true || value === 'Yes' || value === 'yes' ||
                      value === 'true' || value === '1' || value === el.value;
  el.checked = shouldCheck;
  fireEvents(el);
}

function fillDateField(def, value) {
  const el = document.querySelector(def.selector);
  if (!el) return;

  const formatted = normalizeDate(value);
  el.value = formatted;
  fireEvents(el);
}

// --- Date normalization ---

function normalizeDate(value) {
  const str = String(value).trim();

  // Already mmddyyyy (8 digits, no separators)
  if (/^\d{8}$/.test(str)) return str;

  // MM/DD/YYYY or MM-DD-YYYY
  const slashMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const mm = slashMatch[1].padStart(2, '0');
    const dd = slashMatch[2].padStart(2, '0');
    return mm + dd + slashMatch[3];
  }

  // YYYY-MM-DD (ISO format from some PDFs)
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const mm = isoMatch[2].padStart(2, '0');
    const dd = isoMatch[3].padStart(2, '0');
    return mm + dd + isoMatch[1];
  }

  // MM/DD/YY — assume 2000s
  const shortMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (shortMatch) {
    const mm = shortMatch[1].padStart(2, '0');
    const dd = shortMatch[2].padStart(2, '0');
    const yyyy = (parseInt(shortMatch[3]) > 50 ? '19' : '20') + shortMatch[3];
    return mm + dd + yyyy;
  }

  // Can't parse — return as-is and let the form validate
  return str;
}

// --- Event dispatching ---

function fireEvents(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

// --- Heuristic filling (unknown sites) ---

function fillWithHeuristics(data) {
  for (const [fieldName, value] of Object.entries(data)) {
    const el = findFieldByLabel(fieldName);
    if (el) {
      setFieldValue(el, value);
    }
  }
}

function findFieldByLabel(fieldName) {
  // Normalize camelCase to words: "ownerFirstName" → "owner first name"
  const words = fieldName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();

  // Try matching <label> text
  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    const labelText = label.textContent.toLowerCase().trim();
    if (labelText.includes(words) || words.includes(labelText)) {
      // Label with for attribute
      if (label.htmlFor) {
        const el = document.getElementById(label.htmlFor);
        if (el) return el;
      }
      // Label wrapping an input
      const child = label.querySelector('input, select, textarea');
      if (child) return child;
    }
  }

  // Try matching by input name or placeholder
  const inputs = document.querySelectorAll('input, select, textarea');
  for (const input of inputs) {
    const name = (input.name || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    if (name.includes(words) || placeholder.includes(words)) {
      return input;
    }
  }

  return null;
}

// --- Shared utilities (heuristic mode) ---

function setFieldValue(el, value) {
  if (el.tagName === 'SELECT') {
    for (const opt of el.options) {
      if (opt.value === value || opt.textContent.trim() === value) {
        el.value = opt.value;
        break;
      }
    }
  } else if (el.type === 'checkbox') {
    el.checked = Boolean(value);
  } else if (el.type === 'radio') {
    el.checked = el.value === value;
  } else {
    el.value = value;
  }

  fireEvents(el);
}
