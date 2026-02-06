// Content script — injected into web pages to find and fill form fields.
// Receives extracted data from background.js and applies it to the page.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fillForm') {
    fillForm(message.data);
    sendResponse({ success: true });
  }
});

async function fillForm(data) {
  const profile = await loadMatchingProfile();

  if (profile) {
    fillWithProfile(data, profile);
  } else {
    fillWithHeuristics(data);
  }
}

// --- Profile-based filling (known sites) ---

async function loadMatchingProfile() {
  const url = window.location.href;
  const profiles = ['mo-nol'];

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
  for (const [fieldName, selector] of Object.entries(profile.fields)) {
    if (data[fieldName] === undefined) continue;

    const el = document.querySelector(selector);
    if (el) {
      setFieldValue(el, data[fieldName]);
    }
  }
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

// --- Shared utilities ---

function setFieldValue(el, value) {
  if (el.tagName === 'SELECT') {
    // Try to match option by value or text
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

  // Dispatch events so page frameworks detect the change
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
