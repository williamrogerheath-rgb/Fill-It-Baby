# CLAUDE.md

## Project Overview

**Fill It Baby** is a Chrome extension (Manifest V3) that extracts data from uploaded PDFs using the Claude API (vision) and auto-fills web forms. Built with vanilla JS — no build step, no bundler, no framework.

## Architecture

```
manifest.json          — Extension config, permissions, service worker registration
popup.html/js/css      — Upload UI (drag-and-drop PDF zone)
content.js             — Injected into web pages; finds and fills form fields
background.js          — Service worker; handles Claude API calls
options.html/js        — Settings page for API key storage
form-profiles/         — JSON mapping files for known websites
  mo-nol.json          — Missouri Notice of Lien field mappings
```

### Data Flow

1. User opens extension popup on a web form page
2. User uploads/drags a PDF in the popup
3. `popup.js` sends PDF (base64) to `background.js` via `chrome.runtime.sendMessage`
4. `background.js` calls Claude API with vision to extract structured JSON
5. Extracted data is sent to `content.js` via `chrome.tabs.sendMessage`
6. `content.js` loads the matching form profile, maps fields, and fills the form

## Key Conventions

### Manifest V3 Rules
- Use service workers (`background.js`), NOT persistent background pages
- Use `chrome.storage.sync` for settings, NOT `localStorage`
- All permissions declared in `manifest.json` (`activeTab`, `storage`, `scripting`)

### PDF Extraction
- Always use Claude API with vision (base64 PDF) — never local pdf.js parsing
- Claude returns structured JSON with standardized field names
- API calls happen in `background.js` service worker only

### Form Filling Strategy
- **Known sites:** Use form profiles (JSON files mapping field names → CSS selectors)
- **Unknown sites:** Fall back to label-matching heuristics
- `content.js` detects current URL, loads matching profile, fills fields
- First supported site: Missouri Notice of Lien (`dors.mo.gov/dmv/nol`)

### Security
- API key stored in `chrome.storage.sync` only — NEVER hardcoded in source
- Content script has minimal permissions — only reads/writes form field values
- PDF data sent to Claude API and not persisted anywhere

## Code Style

- Plain HTML/CSS/JS — no TypeScript, no JSX, no npm packages
- Keep files under 200 lines where possible
- One responsibility per file
- No build step required

## Development Workflow

1. Make code changes
2. Go to `chrome://extensions` → Developer Mode
3. Click refresh icon on the extension (or Load Unpacked for first time)
4. Open target form page
5. Upload test PDF via the extension popup
6. Verify fields populated correctly

## Commands

There are no build or test commands. This is plain JS loaded directly by Chrome.

```bash
# Push changes
git add . && git commit -m "message" && git push
```

## Form Profile Format

```json
{
  "name": "Missouri Notice of Lien",
  "urlPattern": "dors.mo.gov/dmv/nol",
  "fields": {
    "extractedFieldName": "input[name='formFieldName']"
  }
}
```

Selectors must match the actual DOM of the target page — inspect the page to get real selectors.

## Common Pitfalls

- **Manifest V3 gotcha:** Service workers are ephemeral — don't store state in global variables in `background.js`; use `chrome.storage` instead
- **Content script isolation:** Content scripts run in an isolated world; they can access the page DOM but not page JS variables
- **API key missing:** If Claude API calls fail, check that the user has set their key in the options page
- **Form selectors wrong:** If fields don't fill, the CSS selectors in the form profile likely don't match the actual page; inspect the target page to verify
