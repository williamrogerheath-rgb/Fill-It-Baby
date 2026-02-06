// content.js — Injected into web pages; finds and fills form fields

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fillForm') {
    fillForm(message.data)
      .then(count => sendResponse({ success: true, filledCount: count }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function fillForm(data) {
  const url = window.location.href;
  const profile = await loadMatchingProfile(url);
  let filledCount = 0;

  if (profile) {
    filledCount = fillWithProfile(data, profile);
  } else {
    filledCount = fillWithHeuristics(data);
  }

  return filledCount;
}

async function loadMatchingProfile(url) {
  const profiles = ['mo-nol.json'];

  for (const filename of profiles) {
    try {
      const profileUrl = chrome.runtime.getURL(`form-profiles/${filename}`);
      const resp = await fetch(profileUrl);
      const profile = await resp.json();
      if (url.includes(profile.urlPattern)) {
        return profile;
      }
    } catch (e) {
      // Profile not found or invalid, continue
    }
  }
  return null;
}

function fillWithProfile(data, profile) {
  let count = 0;
  for (const [fieldName, selector] of Object.entries(profile.fields)) {
    const value = data[fieldName];
    if (value === undefined || value === '') continue;

    const el = document.querySelector(selector);
    if (el) {
      setFieldValue(el, value);
      count++;
    }
  }
  return count;
}

function fillWithHeuristics(data) {
  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === '') continue;

    const el = findFieldByLabel(key);
    if (el) {
      setFieldValue(el, value);
      count++;
    }
  }
  return count;
}

function findFieldByLabel(fieldName) {
  const normalized = fieldName.toLowerCase().replace(/[_-]/g, ' ');

  // Try matching by label text
  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    const labelText = label.textContent.trim().toLowerCase();
    if (labelText.includes(normalized) || normalized.includes(labelText)) {
      const forAttr = label.getAttribute('for');
      if (forAttr) {
        const el = document.getElementById(forAttr);
        if (el) return el;
      }
      const input = label.querySelector('input, select, textarea');
      if (input) return input;
    }
  }

  // Try matching by name/id/placeholder attributes
  const inputs = document.querySelectorAll('input, select, textarea');
  for (const input of inputs) {
    const attrs = [
      input.name,
      input.id,
      input.getAttribute('placeholder'),
      input.getAttribute('aria-label')
    ].filter(Boolean).map(a => a.toLowerCase());

    if (attrs.some(a => a.includes(normalized) || normalized.includes(a))) {
      return input;
    }
  }

  return null;
}

function setFieldValue(el, value) {
  if (el.tagName === 'SELECT') {
    const option = Array.from(el.options).find(
      o => o.value === value || o.text.toLowerCase() === value.toLowerCase()
    );
    if (option) {
      el.value = option.value;
    }
  } else if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = Boolean(value);
  } else {
    el.value = value;
  }

  // Dispatch events so frameworks detect the change
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
