# MarkPage Privacy Policy

_Last updated: 2026-04-15_

MarkPage ("the Extension") is committed to protecting your privacy. This policy explains what data the Extension accesses, how it is used, and what we do — and do not — do with it.

## TL;DR

- All of your data stays on your own device.
- We do not operate any server. We do not collect, store, or transmit any data to ourselves.
- The Extension only talks to the AI endpoint **you** configure in Settings, using **your** own API key, and only when you opt in to AI features.

## What data the Extension accesses

| Data | How it is used | Where it is stored |
|------|----------------|--------------------|
| Your Chrome bookmarks (titles, URLs, folder structure) | Render the new tab page; allow you to search, edit, tag, move, pin, and delete bookmarks | Chrome's native bookmark store on your device |
| Tag definitions and bookmark-to-tag mapping | Power the tag system | `chrome.storage.local` on your device |
| AI configuration (endpoint URL, API key, model name) | Call the AI service you configure | `chrome.storage.local` on your device |
| UI preferences (theme, accent color, language, frequent list, recent searches) | Personalize the interface | `chrome.storage.local` on your device |
| Active tab title and URL (popup only, when opened) | Pre-fill the bookmark you are about to save and let AI suggest a category | Memory only — never persisted by the Extension |

## What we send to third parties

The Extension itself does not send your data to any server we operate.

When the AI feature is enabled, the Extension sends the **title and URL** of the bookmark being processed to the **AI endpoint you configured in Settings** (e.g., your own OpenAI-compatible API). This call is made directly from your browser to that endpoint; it does not pass through any infrastructure controlled by us.

The Extension also loads the **Space Grotesk** web font from `fonts.googleapis.com` (Google Fonts) for the brand wordmark. This is a static resource request and does not transmit any of your bookmark or AI data.

## What we do **not** do

- We do not sell, rent, or share your data with anyone.
- We do not run analytics or telemetry. There is no usage tracking inside the Extension.
- We do not collect personally identifiable information.
- We do not use your data for credit determination, lending, or any unrelated purpose.

## Permissions we request and why

- **bookmarks** — required to read and modify your Chrome bookmarks, which is the Extension's core function.
- **storage** — required to save your preferences, tag definitions, and AI configuration locally.
- **tabs** — required to open bookmark URLs in the current or a new tab, and to read the active tab's title/URL inside the popup so you can confirm AI suggestions before saving.

## Your control

- Disabling AI in Settings stops all AI-related network requests immediately.
- Removing the Extension deletes all data stored under `chrome.storage.local`. Your Chrome bookmarks themselves remain untouched.

## Contact

If you have questions about this policy, please open an issue on the project repository:
<https://github.com/Yeung9203/MarkPage/issues>
