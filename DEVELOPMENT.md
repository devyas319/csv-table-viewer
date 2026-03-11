# Development Guide: CSV Interactive Table Viewer

This guide explains how to develop, test, and package this extension. 
By keeping these instructions centralized, you can easily provide them to any future AI or human collaborator.

## 1. Local Testing via VSIX (Recommended for Antigravity)

Because Antigravity (and VS Code) caches extensions, the most reliable way to test all UI/Webview changes locally is to compile and install a packaged `.vsix` file.

**Step-by-Step:**
1. Open your terminal in the extension directory:
   ```bash
   cd /Users/dev/Hypernorm/fund-engine/csv-table-viewer
   ```
2. Package the extension into a `.vsix` file:
   ```bash
   npx @vscode/vsce package -o csv-test-build.vsix
   ```
   *(Note: The `-o` flag names the output file specifically so you don't overwrite official versioned packages).*
3. Install the `.vsix` file in your editor:
   - Go to the **Extensions** sidebar (Ctrl/Cmd + Shift + X).
   - Click the **`...`** (More Actions) menu in the top right of the sidebar.
   - Select **Install from VSIX...**
   - Choose the `csv-test-build.vsix` file you just generated.
4. **CRITICAL: Reload Window**
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows).
   - Type and select **Developer: Reload Window**.
   - This prevents the IDE from using the old cached version of your code.
5. Open any `.csv` file to verify your changes.

---

## 2. Automated Test Suite (Mocha & Chai)

We have a comprehensive, industry-standard automated test suite running on `Mocha` and `Chai`. 
These tests verify that `csvParser.ts` correctly handles different file formats, edge cases, and massive datasets.

**To run the tests:**
```bash
npm run test
```

### What do the tests do?
1. **OS Line Endings**: Verifies parsing for Unix (`\n`), Windows (`\r\n`), and old Mac/Excel (`\r`) CSV formats.
2. **Escaped Data**: Ensures that literal newlines nested inside `"quoted string cells"` do not accidentally break the row.
3. **Missing Newlines**: Validates that files without a trailing newline at the `EOF` (End of File) are still fully read.
4. **1-Million Row Performance**: Dynamically generates a 30MB+ CSV file containing 1,000,000 rows. It streams it through the parser in chunks of 500 rows and asserts that memory limits aren't hit and the parsing completes in less than 2.5 seconds.

*Note: The test file is located at `src/csvParser.test.ts` and runs via `ts-mocha`.*

---

## 3. Version Bumping & Publishing

This extension is built to automatically publish to **both** the Microsoft VS Code Marketplace and the Open VSX Registry (used by Antigravity, Cursor, etc.). Publishing is driven by GitHub Actions (`.github/workflows/publish.yml`) running on Node.js 24.

When you are ready to release a new version to users:

1. **Commit your final feature changes** (so your Git working tree is clean).
2. **Bump the NPM version** (this updates `package.json`):
   ```bash
   npm version patch  # Changes 0.1.5 -> 0.1.6
   # OR
   npm version minor  # Changes 0.1.5 -> 0.2.0
   ```
3. **Update the CHANGELOG.md**:
   Add a new `## [X.Y.Z] - YYYY-MM-DD` block at the top outlining the new features and fixes.
4. **Push the commit and the newly generated Tag to GitHub**:
   ```bash
   git add CHANGELOG.md package.json package-lock.json
   git commit -m "docs: bump version and update changelog"
   git push origin main --tags
   ```

Because we pushed the `--tags`, the GitHub Action workflow will automatically trigger, package the `.vsix`, and publish the new version simultaneously to both extensions marketplaces!
