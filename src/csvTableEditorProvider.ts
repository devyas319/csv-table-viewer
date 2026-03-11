import * as vscode from 'vscode';
import { parseCsv } from './csvParser';

interface CsvDocument extends vscode.CustomDocument {
    readonly uri: vscode.Uri;
}

export class CsvTableEditorProvider implements vscode.CustomReadonlyEditorProvider<CsvDocument> {

    public static readonly viewType = 'csvTableViewer.view';

    constructor(private readonly context: vscode.ExtensionContext) { }

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new CsvTableEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(
            CsvTableEditorProvider.viewType,
            provider,
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false,
            }
        );
    }

    async openCustomDocument(uri: vscode.Uri): Promise<CsvDocument> {
        return { uri, dispose: () => { } };
    }

    async resolveCustomEditor(
        document: CsvDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
        };

        const updateWebview = async () => {
            const content = await vscode.workspace.fs.readFile(document.uri);
            const text = Buffer.from(content).toString('utf-8');
            const csvData = parseCsv(text);
            webviewPanel.webview.html = this.getHtmlForWebview(
                webviewPanel.webview,
                csvData.headers,
                csvData.rows,
                document.uri
            );
        };

        // Watch for file changes
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(document.uri, '*')
        );

        const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        // Also watch via file system watcher for external changes
        const fsWatcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
        fsWatcher.onDidChange(() => updateWebview());

        webviewPanel.onDidDispose(() => {
            watcher.dispose();
            changeListener.dispose();
            fsWatcher.dispose();
        });

        await updateWebview();
    }

    private getHtmlForWebview(
        webview: vscode.Webview,
        headers: string[],
        rows: string[][],
        uri: vscode.Uri
    ): string {
        const fileName = uri.path.split('/').pop() || 'CSV';
        const nonce = getNonce();

        const headerCells = headers
            .map((h, i) => `<th data-col="${i}" title="${escapeHtml(h)}">${escapeHtml(h)} <span class="sort-icon"></span></th>`)
            .join('\n            ');

        const bodyRows = rows
            .map((row, ri) => {
                const cells = row
                    .map((cell) => {
                        const isNumber = cell !== '' && !isNaN(Number(cell));
                        return `<td class="${isNumber ? 'num' : ''}" title="${escapeHtml(cell)}">${escapeHtml(cell)}</td>`;
                    })
                    .join('');
                return `<tr>${cells}</tr>`;
            })
            .join('\n            ');

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${escapeHtml(fileName)}</title>
  <style nonce="${nonce}">
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="file-name">${escapeHtml(fileName)}</span>
      <span class="row-count" id="rowCount">${rows.length} rows</span>
    </div>
    <div class="toolbar-right">
      <div class="search-container">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="searchInput" placeholder="Filter rows..." autocomplete="off" />
      </div>
    </div>
  </div>

  <div class="table-wrapper">
    <table id="csvTable">
      <thead>
        <tr>
            ${headerCells}
        </tr>
      </thead>
      <tbody>
            ${bodyRows}
      </tbody>
    </table>
  </div>

  ${rows.length === 0 ? '<div class="empty-state">No data in this CSV file</div>' : ''}

  <script nonce="${nonce}">
    ${this.getScript()}
  </script>
</body>
</html>`;
    }

    private getStyles(): string {
        return /*css*/ `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        font-size: var(--vscode-font-size, 13px);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        height: 100vh;
      }

      /* Toolbar */
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
        border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
        flex-shrink: 0;
        gap: 12px;
      }

      .toolbar-left {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .file-name {
        font-weight: 600;
        font-size: 13px;
        color: var(--vscode-foreground);
        opacity: 0.9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .row-count {
        font-size: 11px;
        color: var(--vscode-descriptionForeground, rgba(128,128,128,0.8));
        white-space: nowrap;
        background: var(--vscode-badge-background, rgba(128,128,128,0.15));
        color: var(--vscode-badge-foreground, var(--vscode-foreground));
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 500;
      }

      .toolbar-right {
        flex-shrink: 0;
      }

      .search-container {
        position: relative;
        display: flex;
        align-items: center;
      }

      .search-icon {
        position: absolute;
        left: 8px;
        color: var(--vscode-input-placeholderForeground, rgba(128,128,128,0.6));
        pointer-events: none;
      }

      #searchInput {
        padding: 5px 10px 5px 28px;
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
        border-radius: 4px;
        background: var(--vscode-input-background, rgba(0,0,0,0.1));
        color: var(--vscode-input-foreground, var(--vscode-foreground));
        font-size: 12px;
        width: 220px;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }

      #searchInput:focus {
        border-color: var(--vscode-focusBorder, #007acc);
        box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007acc);
      }

      #searchInput::placeholder {
        color: var(--vscode-input-placeholderForeground, rgba(128,128,128,0.6));
      }

      /* Table Wrapper */
      .table-wrapper {
        flex: 1;
        overflow: auto;
        position: relative;
      }

      /* Table */
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
      }

      thead {
        position: sticky;
        top: 0;
        z-index: 2;
      }

      th {
        background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
        border-bottom: 2px solid var(--vscode-focusBorder, #007acc);
        padding: 8px 14px;
        text-align: left;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--vscode-foreground);
        opacity: 0.85;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        position: relative;
        transition: background 0.1s;
      }

      th:hover {
        background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1));
        opacity: 1;
      }

      th .sort-icon {
        display: inline-block;
        margin-left: 4px;
        font-size: 10px;
        opacity: 0.4;
      }

      th .sort-icon::after {
        content: '⇅';
      }

      th.sort-asc .sort-icon {
        opacity: 1;
      }

      th.sort-asc .sort-icon::after {
        content: '↑';
      }

      th.sort-desc .sort-icon {
        opacity: 1;
      }

      th.sort-desc .sort-icon::after {
        content: '↓';
      }

      td {
        padding: 6px 14px;
        border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.12));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 400px;
        transition: background 0.08s;
      }

      td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        font-family: var(--vscode-editor-font-family, 'SF Mono', 'Menlo', 'Monaco', monospace);
        font-size: 12px;
      }

      /* Alternating rows */
      tbody tr:nth-child(even) {
        background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.04));
      }

      tbody tr:hover {
        background: var(--vscode-list-activeSelectionBackground, rgba(0,122,204,0.1)) !important;
      }

      tbody tr.hidden {
        display: none;
      }

      /* Empty state */
      .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: var(--vscode-descriptionForeground, rgba(128,128,128,0.6));
        font-size: 14px;
        font-style: italic;
      }

      /* Scrollbar styling */
      .table-wrapper::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }

      .table-wrapper::-webkit-scrollbar-track {
        background: transparent;
      }

      .table-wrapper::-webkit-scrollbar-thumb {
        background: var(--vscode-scrollbarSlider-background, rgba(128,128,128,0.3));
        border-radius: 5px;
      }

      .table-wrapper::-webkit-scrollbar-thumb:hover {
        background: var(--vscode-scrollbarSlider-hoverBackground, rgba(128,128,128,0.5));
      }

      /* Highlight matched text */
      mark {
        background: var(--vscode-editor-findMatchHighlightBackground, rgba(234,184,57,0.4));
        color: inherit;
        border-radius: 2px;
        padding: 0 1px;
      }
    `;
    }

    private getScript(): string {
        return /*javascript*/ `
      (function() {
        const table = document.getElementById('csvTable');
        const tbody = table.querySelector('tbody');
        const searchInput = document.getElementById('searchInput');
        const rowCountEl = document.getElementById('rowCount');
        const headers = table.querySelectorAll('th');
        const totalRows = tbody.querySelectorAll('tr').length;

        let currentSort = { col: -1, dir: 'none' };

        // Sorting
        headers.forEach((th) => {
          th.addEventListener('click', () => {
            const col = parseInt(th.dataset.col);

            // Clear other headers
            headers.forEach(h => {
              h.classList.remove('sort-asc', 'sort-desc');
            });

            if (currentSort.col === col) {
              if (currentSort.dir === 'asc') {
                currentSort.dir = 'desc';
                th.classList.add('sort-desc');
              } else if (currentSort.dir === 'desc') {
                currentSort = { col: -1, dir: 'none' };
                // Reset to original order
                sortTable(col, 'none');
                return;
              }
            } else {
              currentSort = { col, dir: 'asc' };
              th.classList.add('sort-asc');
            }

            sortTable(col, currentSort.dir);
          });
        });

        function sortTable(col, dir) {
          const rows = Array.from(tbody.querySelectorAll('tr'));

          if (dir === 'none') {
            // Restore original order by row index
            rows.sort((a, b) => {
              return (parseInt(a.dataset.origIndex) || 0) - (parseInt(b.dataset.origIndex) || 0);
            });
          } else {
            rows.sort((a, b) => {
              const aVal = a.children[col]?.textContent || '';
              const bVal = b.children[col]?.textContent || '';

              // Try numeric comparison
              const aNum = parseFloat(aVal);
              const bNum = parseFloat(bVal);

              if (!isNaN(aNum) && !isNaN(bNum)) {
                return dir === 'asc' ? aNum - bNum : bNum - aNum;
              }

              // String comparison
              return dir === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
            });
          }

          rows.forEach(row => tbody.appendChild(row));
        }

        // Store original indices
        tbody.querySelectorAll('tr').forEach((row, i) => {
          row.dataset.origIndex = i.toString();
        });

        // Search / Filter
        searchInput.addEventListener('input', () => {
          const query = searchInput.value.toLowerCase().trim();
          const rows = tbody.querySelectorAll('tr');
          let visibleCount = 0;

          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            let match = false;

            cells.forEach(cell => {
              const originalText = cell.getAttribute('title') || cell.textContent || '';
              if (query === '') {
                cell.textContent = originalText;
              } else if (originalText.toLowerCase().includes(query)) {
                match = true;
                // Highlight matching text
                const idx = originalText.toLowerCase().indexOf(query);
                const before = originalText.substring(0, idx);
                const matched = originalText.substring(idx, idx + query.length);
                const after = originalText.substring(idx + query.length);
                cell.innerHTML = escapeHtml(before) + '<mark>' + escapeHtml(matched) + '</mark>' + escapeHtml(after);
              } else {
                cell.textContent = originalText;
              }
            });

            if (query === '') {
              row.classList.remove('hidden');
              visibleCount++;
            } else if (match) {
              row.classList.remove('hidden');
              visibleCount++;
            } else {
              row.classList.add('hidden');
            }
          });

          if (query === '') {
            rowCountEl.textContent = totalRows + ' rows';
          } else {
            rowCountEl.textContent = visibleCount + ' of ' + totalRows + ' rows';
          }
        });

        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }

        // Focus search on Ctrl/Cmd+F
        document.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
          }
        });
      })();
    `;
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
