# Changelog

All notable changes to the **CSV (Interactive Table Viewer)** extension will be documented in this file.

## [0.1.5] - 2026-03-11

### Added
- **Virtual scrolling** — Only the visible rows are rendered in the DOM at any time
- **Streaming file reader** — Large files (even 2 GB+) are read in 256 KB chunks, never fully loaded into memory
- **Infinite scroll** — Next 500 rows are automatically fetched as you scroll near the bottom
- **Live row counter** — Shows `500+` while loading, updates to the exact total when done
- **Loading spinner** — Visual indicator while more rows are being fetched

## [0.1.0] - 2026-03-11

### Added
- Initial release
- CSV files open as interactive HTML tables
- Column sorting (ascending / descending / original order)
- Search and filter with highlighted matches
- Sticky table header
- Automatic theme adaptation (dark/light)
- Auto-refresh when CSV file changes
- Numeric column right-alignment with tabular figures
- `Cmd+F` / `Ctrl+F` keyboard shortcut to focus search
