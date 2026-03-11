import * as vscode from 'vscode';
import { readCsvChunk, ROWS_PER_CHUNK } from './csvParser';

interface CsvDocument extends vscode.CustomDocument {
  readonly uri: vscode.Uri;
}

interface FileState {
  headers: string[];
  nextOffset: number;
  totalLoaded: number;
  done: boolean;
}

export class CsvTableEditorProvider implements vscode.CustomReadonlyEditorProvider<CsvDocument> {

  public static readonly viewType = 'csvTableViewer.view';
  private fileStates = new Map<string, FileState>();

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
    webviewPanel.webview.options = { enableScripts: true };
    const stateKey = document.uri.toString();

    const loadInitial = async () => {
      try {
        const chunk = await readCsvChunk(document.uri.fsPath, 0, ROWS_PER_CHUNK);
        this.fileStates.set(stateKey, {
          headers: chunk.headers,
          nextOffset: chunk.nextOffset,
          totalLoaded: chunk.rows.length,
          done: chunk.done,
        });
        webviewPanel.webview.html = this.getHtmlForWebview(
          webviewPanel.webview,
          chunk.headers,
          chunk.rows,
          chunk.done,
          document.uri
        );
      } catch (err) {
        webviewPanel.webview.html = `<body style="padding:20px;font-family:sans-serif;color:#f44;">Error loading CSV: ${err}</body>`;
      }
    };

    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'requestMore') {
        const state = this.fileStates.get(stateKey);
        if (!state || state.done) {
          webviewPanel.webview.postMessage({ type: 'noMore' });
          return;
        }
        try {
          const chunk = await readCsvChunk(document.uri.fsPath, state.nextOffset, ROWS_PER_CHUNK, state.headers);
          state.nextOffset = chunk.nextOffset;
          state.done = chunk.done;
          state.totalLoaded += chunk.rows.length;
          webviewPanel.webview.postMessage({
            type: 'moreRows',
            rows: chunk.rows,
            done: chunk.done,
            totalLoaded: state.totalLoaded,
          });
        } catch (err) {
          webviewPanel.webview.postMessage({ type: 'loadError', message: String(err) });
        }
      }
    });

    const fsWatcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
    fsWatcher.onDidChange(() => loadInitial());
    const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === stateKey) { loadInitial(); }
    });

    webviewPanel.onDidDispose(() => {
      this.fileStates.delete(stateKey);
      fsWatcher.dispose();
      changeListener.dispose();
      messageDisposable.dispose();
    });

    await loadInitial();
  }

  private getHtmlForWebview(
    webview: vscode.Webview,
    headers: string[],
    rows: string[][],
    initiallyDone: boolean,
    uri: vscode.Uri
  ): string {
    const fileName = uri.path.split('/').pop() || 'CSV';
    const nonce = getNonce();

    const headerCells = headers
      .map((h, i) => `<th data-col="${i}" title="${escapeHtml(h)}">${escapeHtml(h)} <span class="sort-icon"></span></th>`)
      .join('\n            ');

    const filterCells = headers
      .map((h, i) => `<th><input type="text" class="col-filter" data-col="${i}" placeholder="Filter..." autocomplete="off" /></th>`)
      .join('\n            ');

    const bodyRows = rows
      .map((row, ri) => {
        const cells = row
          .map((cell) => {
            const isNumber = cell !== '' && !isNaN(Number(cell));
            return `<td class="${isNumber ? 'num' : ''}" title="${escapeHtml(cell)}">${escapeHtml(cell)}</td>`;
          })
          .join('');
        return `<tr data-orig-index="${ri}">${cells}</tr>`;
      })
      .join('\n            ');

    const initialState = JSON.stringify({ done: initiallyDone, totalLoaded: rows.length });

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
      <span class="row-count" id="rowCount">${rows.length}${!initiallyDone ? '+' : ''} rows</span>
    </div>
    <div class="toolbar-right">
      <div class="search-container">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="searchInput" placeholder="Filter rows..." autocomplete="off" />
      </div>
    </div>
  </div>

  <div class="table-wrapper" id="tableWrapper">
    <table id="csvTable">
      <thead>
        <tr class="header-row">
            ${headerCells}
        </tr>
        <tr class="filters-row">
            ${filterCells}
        </tr>
      </thead>
      <tbody id="csvBody">
            ${bodyRows}
      </tbody>
    </table>
    <div id="scroll-sentinel"></div>
    <div id="loading-indicator" class="${initiallyDone ? 'hidden' : ''}">
      <span class="spinner"></span> Loading more rows...
    </div>
    <div id="all-loaded" class="${!initiallyDone ? 'hidden' : ''}">
      ✓ All ${rows.length} rows loaded
    </div>
  </div>

  ${rows.length === 0 ? '<div class="empty-state">No data in this CSV file</div>' : ''}

  <script nonce="${nonce}">
    var __initialState = ${initialState};
    ${this.getScript()}
  </script>
</body>
</html>`;
  }

  private getStyles(): string {
    return /*css*/ `
      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
        font-size: var(--vscode-font-size, 13px);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        height: 100vh;
      }

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

      .toolbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }

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
        background: var(--vscode-badge-background, rgba(128,128,128,0.15));
        color: var(--vscode-badge-foreground, var(--vscode-foreground));
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 500;
        white-space: nowrap;
      }

      .toolbar-right { flex-shrink: 0; }

      .search-container { position: relative; display: flex; align-items: center; }

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

      #searchInput::placeholder { color: var(--vscode-input-placeholderForeground, rgba(128,128,128,0.6)); }

      .table-wrapper { flex: 1; overflow: auto; position: relative; }

      table { width: 100%; border-collapse: collapse; table-layout: auto; }

      thead { position: sticky; top: 0; z-index: 2; background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background)); }

      .header-row th {
        padding: 8px 14px 4px 14px;
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

      .header-row th:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1)); opacity: 1; }

      .filters-row th {
        padding: 4px 10px 8px 10px;
        border-bottom: 2px solid var(--vscode-focusBorder, #007acc);
      }

      .col-filter {
        width: 100%;
        min-width: 60px;
        padding: 3px 6px;
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
        border-radius: 3px;
        background: var(--vscode-input-background, rgba(0,0,0,0.1));
        color: var(--vscode-input-foreground, var(--vscode-foreground));
        font-size: 11px;
        outline: none;
      }
      .col-filter:focus {
        border-color: var(--vscode-focusBorder, #007acc);
      }
      .col-filter::placeholder { color: var(--vscode-input-placeholderForeground, rgba(128,128,128,0.6)); }

      th .sort-icon { display: inline-block; margin-left: 4px; font-size: 10px; opacity: 0.4; }
      th .sort-icon::after { content: '⇅'; }
      th.sort-asc .sort-icon { opacity: 1; }
      th.sort-asc .sort-icon::after { content: '↑'; }
      th.sort-desc .sort-icon { opacity: 1; }
      th.sort-desc .sort-icon::after { content: '↓'; }

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
        font-family: var(--vscode-editor-font-family, 'SF Mono', 'Menlo', monospace);
        font-size: 12px;
      }

      tbody tr:nth-child(even) { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.04)); }
      tbody tr:hover { background: var(--vscode-list-activeSelectionBackground, rgba(0,122,204,0.1)) !important; }
      tbody tr.hidden { display: none; }

      .empty-state {
        display: flex; align-items: center; justify-content: center;
        height: 200px;
        color: var(--vscode-descriptionForeground, rgba(128,128,128,0.6));
        font-size: 14px; font-style: italic;
      }

      .table-wrapper::-webkit-scrollbar { width: 10px; height: 10px; }
      .table-wrapper::-webkit-scrollbar-track { background: transparent; }
      .table-wrapper::-webkit-scrollbar-thumb {
        background: var(--vscode-scrollbarSlider-background, rgba(128,128,128,0.3));
        border-radius: 5px;
      }
      .table-wrapper::-webkit-scrollbar-thumb:hover {
        background: var(--vscode-scrollbarSlider-hoverBackground, rgba(128,128,128,0.5));
      }

      mark {
        background: var(--vscode-editor-findMatchHighlightBackground, rgba(234,184,57,0.4));
        color: inherit; border-radius: 2px; padding: 0 1px;
      }

      #scroll-sentinel { height: 1px; }

      #loading-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        gap: 8px;
        color: var(--vscode-descriptionForeground, rgba(128,128,128,0.7));
        font-size: 12px;
      }

      .hidden { display: none !important; }

      #all-loaded {
        text-align: center;
        padding: 8px;
        color: var(--vscode-descriptionForeground, rgba(128,128,128,0.5));
        font-size: 11px;
      }

      .spinner {
        width: 14px; height: 14px;
        border: 2px solid var(--vscode-progressBar-background, #007acc);
        border-top-color: transparent;
        border-radius: 50%;
        display: inline-block;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin { to { transform: rotate(360deg); } }
    `;
  }

  private getScript(): string {
    return /*javascript*/ `
      (function() {
        const vscode = acquireVsCodeApi();
        const table = document.getElementById('csvTable');
        const tbody = document.getElementById('csvBody');
        const tableWrapper = document.getElementById('tableWrapper');
        const searchInput = document.getElementById('searchInput');
        const rowCountEl = document.getElementById('rowCount');
        const sentinel = document.getElementById('scroll-sentinel');
        const loadingEl = document.getElementById('loading-indicator');
        const allLoadedEl = document.getElementById('all-loaded');
        const ths = table.querySelectorAll('th');

        let totalLoaded = __initialState.totalLoaded;
        let isDone = __initialState.done;
        let isLoading = false;
        let currentSort = { col: -1, dir: 'none' };
        let currentQuery = '';
        let colQueries = {}; // { colIndex: 'query' }

        const colFilters = document.querySelectorAll('.col-filter');
        colFilters.forEach(inp => {
          inp.addEventListener('input', (e) => {
            const colIdx = e.target.getAttribute('data-col');
            const val = e.target.value.toLowerCase().trim();
            if (val) colQueries[colIdx] = val;
            else delete colQueries[colIdx];
            applyFilters();
          });
        });

        // ─── Sorting ───────────────────────────────────────────────
        ths.forEach((th) => {
          th.addEventListener('click', () => {
            const col = parseInt(th.dataset.col);
            ths.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
            if (currentSort.col === col) {
              if (currentSort.dir === 'asc') {
                currentSort.dir = 'desc';
                th.classList.add('sort-desc');
              } else if (currentSort.dir === 'desc') {
                currentSort = { col: -1, dir: 'none' };
                sortTable(col, 'none'); return;
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
            rows.sort((a, b) => (parseInt(a.dataset.origIndex)||0) - (parseInt(b.dataset.origIndex)||0));
          } else {
            rows.sort((a, b) => {
              const aVal = a.children[col]?.textContent || '';
              const bVal = b.children[col]?.textContent || '';
              const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
              if (!isNaN(aNum) && !isNaN(bNum)) return dir === 'asc' ? aNum - bNum : bNum - aNum;
              return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            });
          }
          rows.forEach(row => tbody.appendChild(row));
        }

        tbody.querySelectorAll('tr').forEach((row, i) => { row.dataset.origIndex = i.toString(); });

        // ─── Search / Filter ────────────────────────────────────────
        searchInput.addEventListener('input', () => {
          currentQuery = searchInput.value.toLowerCase().trim();
          applyFilters();
        });

        function applyFilters() {
          const rows = tbody.querySelectorAll('tr');
          let visible = 0;
          const hasColFilters = Object.keys(colQueries).length > 0;

          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            let globalMatch = !currentQuery; 
            let colMatch = true;

            cells.forEach((cell, idx) => {
              const orig = cell.getAttribute('title') || '';
              const origLower = orig.toLowerCase();
              
              // Column-specific filter check
              if (colMatch && hasColFilters && colQueries[idx] !== undefined) {
                if (!origLower.includes(colQueries[idx])) {
                  colMatch = false;
                }
              }

              // Global search check and highlighting
              if (!currentQuery) {
                cell.textContent = orig;
              } else if (origLower.includes(currentQuery)) {
                globalMatch = true;
                const i = origLower.indexOf(currentQuery);
                cell.innerHTML = esc(orig.slice(0, i)) + '<mark>' + esc(orig.slice(i, i + currentQuery.length)) + '</mark>' + esc(orig.slice(i + currentQuery.length));
              } else {
                cell.textContent = orig;
              }
            });

            if (globalMatch && colMatch) { 
              row.classList.remove('hidden'); 
              visible++; 
            } else { 
              row.classList.add('hidden'); 
            }
          });

          const activeCount = currentQuery || hasColFilters;
          rowCountEl.textContent = activeCount
            ? (visible + ' of ' + totalLoaded + (isDone ? '' : '+') + ' rows')
            : (totalLoaded + (isDone ? '' : '+') + ' rows');
        }

        function esc(text) {
          const d = document.createElement('div'); d.textContent = text; return d.innerHTML;
        }

        // ─── Keyboard shortcut ──────────────────────────────────────
        document.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault(); searchInput.focus(); searchInput.select();
          }
        });

        // ─── Append new rows from extension ────────────────────────
        function appendRows(newRows) {
          const baseIdx = totalLoaded;
          const fragment = document.createDocumentFragment();
          newRows.forEach((row, i) => {
            const tr = document.createElement('tr');
            tr.dataset.origIndex = (baseIdx + i).toString();
            row.forEach((cell) => {
              const td = document.createElement('td');
              const isNum = cell !== '' && !isNaN(Number(cell));
              if (isNum) { td.classList.add('num'); }
              td.title = cell;
              const orig = cell;
              const origLower = orig.toLowerCase();
              
              // Determine if it matches global query (we apply highlights only for global query in this logic)
              if (currentQuery && origLower.includes(currentQuery)) {
                const idx = origLower.indexOf(currentQuery);
                td.innerHTML = esc(orig.slice(0, idx)) + '<mark>' + esc(orig.slice(idx, idx + currentQuery.length)) + '</mark>' + esc(orig.slice(idx + currentQuery.length));
              } else {
                td.textContent = orig;
              }

              tr.appendChild(td);
            });
            fragment.appendChild(tr);
          });
          tbody.appendChild(fragment);
          // Re-evaluate filters on the newly appended rows (or all rows)
          applyFilters();
        }

        // ─── Infinite scroll via IntersectionObserver ───────────────
        function loadMore() {
          if (isLoading || isDone) { return; }
          isLoading = true;
          loadingEl.classList.remove('hidden');
          vscode.postMessage({ type: 'requestMore' });
        }

        const observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting && !isLoading && !isDone) { loadMore(); }
        }, { root: tableWrapper, rootMargin: '400px' });

        if (!isDone) { observer.observe(sentinel); }

        // ─── Handle messages from extension ────────────────────────
        window.addEventListener('message', (event) => {
          const msg = event.data;
          if (msg.type === 'moreRows') {
            appendRows(msg.rows);
            totalLoaded = msg.totalLoaded;
            isDone = msg.done;
            isLoading = false;
            loadingEl.classList.add('hidden');
            rowCountEl.textContent = totalLoaded + (isDone ? '' : '+') + ' rows';
            if (isDone) {
              allLoadedEl.textContent = '✓ All ' + totalLoaded + ' rows loaded';
              allLoadedEl.classList.remove('hidden');
              observer.disconnect();
            }
          } else if (msg.type === 'noMore') {
            isDone = true; isLoading = false;
            loadingEl.classList.add('hidden');
            allLoadedEl.classList.remove('hidden');
            observer.disconnect();
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
