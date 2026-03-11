# CSV Table Viewer

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/devyas319.csv-interactive-table-viewer?label=VS%20Marketplace&color=007acc)](https://marketplace.visualstudio.com/items?itemName=devyas319.csv-interactive-table-viewer)
[![Open VSX](https://img.shields.io/open-vsx/v/devyas319/csv-interactive-table-viewer?label=Open%20VSX&color=a855f7)](https://open-vsx.org/extension/devyas319/csv-interactive-table-viewer)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> View CSV files as beautiful, interactive tables inside VS Code.

No more squinting at comma-separated values. Just open a `.csv` file and get a clean, sortable, searchable table — styled to match your editor theme.

## ✨ Features

- **📊 Table View** — CSV rendered as a clean HTML table
- **🔀 Column Sorting** — Click any header to sort ascending / descending
- **🔍 Search & Filter** — Type to filter rows with highlighted matches
- **📌 Sticky Header** — Headers stay visible while scrolling
- **🎨 Theme-Aware** — Adapts automatically to your VS Code dark/light theme
- **🔄 Auto-Refresh** — Table updates when the CSV file changes
- **🔢 Numeric Alignment** — Numbers right-aligned with tabular figures
- **⌨️ Keyboard Shortcut** — `Cmd+F` / `Ctrl+F` focuses the search box

## 📦 Installation

### From VS Code / Antigravity IDE
1. Open **Extensions** sidebar (`Cmd+Shift+X`)
2. Search for **"CSV Table Viewer"**
3. Click **Install**

### From Open VSX
Visit [open-vsx.org/extension/devyas319/csv-table-viewer](https://open-vsx.org/extension/devyas319/csv-table-viewer)

### From VSIX
```bash
code --install-extension csv-table-viewer-x.x.x.vsix
```

## 🚀 Usage

1. Open any `.csv` file — it automatically renders as a table
2. If it opens as plain text, right-click the tab → **Reopen Editor With...** → **CSV Table Viewer**

### Sorting
Click any column header to cycle through: **ascending → descending → original order**

### Filtering
Use the search box in the toolbar (or press `Cmd+F`) to filter rows. Matching text is highlighted.

## 🛠 Development

```bash
# Clone the repo
git clone https://github.com/devyas319/csv-table-viewer.git
cd csv-table-viewer

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch
```

**To test locally:**
- Press `F5` in VS Code to launch the Extension Development Host
- Open any `.csv` file in the new window

## 📄 License

[MIT](LICENSE) © devyas319
