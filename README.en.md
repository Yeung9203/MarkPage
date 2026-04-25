<p align="center">
  <img src="docs/screenshots/Frame%2020.png" alt="MarkPage AI — Smart organization for your bookmarks" />
</p>

<p align="center">
  A Linear-style smart bookmark manager for Chrome — AI auto-tagging, tag organization, and a beautiful new tab page.
</p>

<p align="center">
  <a href="README.md">中文</a> · <strong>English</strong>
</p>

## Interface Preview

| Dark Mode | Light Mode |
| :---: | :---: |
| ![Dark mode](docs/screenshots/newtab-dark.png) | ![Light mode](docs/screenshots/newtab-light.png) |

## Feature Highlights

### AI Automatic Labeling
![AI Automatic Labeling](docs/screenshots%20en/Frame%206.png)

### AI Organizes Old Bookmarks
![AI Organizes Old Bookmarks](docs/screenshots%20en/Frame%205.png)

### Smart Search
![Smart Search](docs/screenshots%20en/Frame%204.png)

### Custom Styles
![Custom Styles](docs/screenshots%20en/Frame%203.png)

## Key Features

- **AI Auto-tagging & Categorization** — When you bookmark a page, the background worker calls AI to suggest tags and categories automatically
- **Tag Management** — Double-click to rename, hover to delete in the sidebar; one-click AI cleanup for messy tag systems
- **Unified Search** — Search across bookmarks, tags, and pinyin initials. Press `⌘ K` / `Ctrl K` anywhere to open
- **Frequent Sites** — Right-click any bookmark → "Pin" to surface it in the top quick-access bar
- **Theme & Accent Color** — Light, dark, system-follow, plus a customizable accent palette

## Installation

### Option 1: Build from source and load in Developer Mode

1. Clone the repo and install dependencies

   ```bash
   git clone https://github.com/Yeung9203/MarkPage.git
   cd MarkPage
   npm install
   ```

2. Build the extension

   ```bash
   npm run build
   ```

   This produces a `dist/` folder in the project root.

3. Load the unpacked extension in Chrome

   1. Open `chrome://extensions`
   2. Enable **Developer mode** (top-right toggle)
   3. Click **Load unpacked**
   4. Select the project's `dist/` folder

4. Open a new tab to see MarkPage in action.

### Option 2: Local development (live rebuild)

```bash
npm run dev
```

After loading `dist/` in Developer mode, Vite will rebuild on file changes — just hit the refresh icon on the extensions page to pick up updates.

## Configure AI (Optional)

MarkPage's AI features (auto-tagging, categorization, tag cleanup) require an OpenAI-compatible API:

1. Click **Settings** at the bottom-left of the new tab page
2. Open the **AI** section and fill in:
   - API Base URL (e.g. `https://api.openai.com/v1`)
   - API Key
   - Model name (e.g. `gpt-4o-mini`)
3. Settings take effect immediately. Toggle the AI switch off to disable all AI-related behavior.

> Your API key is stored only in local `chrome.storage.local`. Nothing is uploaded to any server.

## Changelog

### v1.0.0

- ✨ **AI on by default** — Newly bookmarked pages are auto-categorized out of the box, no setup required
- ✨ **Custom AI endpoint** — Configure any OpenAI-compatible Base URL (DeepSeek, Zhipu, local models, etc.)
- ✨ **Tag suggestions in Popup** — Live AI tag suggestions when bookmarking, add or remove with one click
- 🐛 **Fixed AI tagging reliability** — Resolved tag-write failures and stale-closure issues in edge cases
- 💎 **Visual polish** — Sidebar logo aligned with menu text; refined styles across popup, header, tags, etc.
- 🌐 **Better i18n** — AI prompts now switch between Chinese/English based on UI language; many translation strings added

## Tech Stack

- TypeScript + Vite
- Vanilla DOM (no runtime framework) — lightweight and fast
- Chrome Extension Manifest V3

## License

MIT
