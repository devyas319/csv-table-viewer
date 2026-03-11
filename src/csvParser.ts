/**
 * Parses a CSV string into headers and rows.
 * Handles quoted fields, commas inside quotes, and escaped quotes.
 */
export interface CsvData {
    headers: string[];
    rows: string[][];
}

export function parseCsv(text: string): CsvData {
    const lines = splitCsvLines(text);
    if (lines.length === 0) {
        return { headers: [], rows: [] };
    }

    const headers = parseCsvLine(lines[0]);
    const rows: string[][] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) {
            continue;
        }
        const row = parseCsvLine(line);
        // Pad or trim row to match header count
        while (row.length < headers.length) {
            row.push('');
        }
        rows.push(row.slice(0, headers.length));
    }

    return { headers, rows };
}

function splitCsvLines(text: string): string[] {
    const lines: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === '"') {
            inQuotes = !inQuotes;
            current += ch;
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && text[i + 1] === '\n') {
                i++; // skip \n in \r\n
            }
            lines.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.length > 0) {
        lines.push(current);
    }

    return lines;
}

function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                fields.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }

    fields.push(current.trim());
    return fields;
}
