import * as fs from 'fs';

export interface CsvData {
    headers: string[];
    rows: string[][];
}

export interface CsvChunk {
    headers: string[];
    rows: string[][];
    nextOffset: number;
    done: boolean;
}

export const ROWS_PER_CHUNK = 500;

/**
 * Stream-reads a CSV file starting at `startOffset` bytes,
 * returning up to `maxRows` rows. Uses byte-level scanning for
 * accurate offset tracking across UTF-8 content.
 */
export function readCsvChunk(
    filePath: string,
    startOffset: number,
    maxRows: number,
    knownHeaders?: string[]
): Promise<CsvChunk> {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, {
            start: startOffset,
            highWaterMark: 256 * 1024,
        });

        let bytesBuf = Buffer.alloc(0);
        let bytesConsumed = startOffset;
        const rows: string[][] = [];
        let headers: string[] = knownHeaders ? [...knownHeaders] : [];
        let needHeaders = !knownHeaders;
        let settled = false;

        function settle(done: boolean) {
            if (settled) { return; }
            settled = true;
            stream.destroy();
            resolve({ headers, rows, nextOffset: bytesConsumed, done });
        }

        stream.on('data', (chunk: Buffer) => {
            bytesBuf = Buffer.concat([bytesBuf, chunk]);
            while (true) {
                const nlIdx = bytesBuf.indexOf(0x0a);
                if (nlIdx === -1) { break; }
                const lineEnd = nlIdx > 0 && bytesBuf[nlIdx - 1] === 0x0d ? nlIdx - 1 : nlIdx;
                const lineBytes = bytesBuf.slice(0, lineEnd);
                bytesConsumed += nlIdx + 1;
                bytesBuf = bytesBuf.slice(nlIdx + 1);
                const line = lineBytes.toString('utf-8').trim();
                if (!line) { continue; }
                if (needHeaders) {
                    headers = parseCsvLine(line);
                    needHeaders = false;
                    continue;
                }
                const row = parseCsvLine(line);
                while (row.length < headers.length) { row.push(''); }
                rows.push(row.slice(0, headers.length));
                if (rows.length >= maxRows) { settle(false); return; }
            }
        });

        stream.on('end', () => {
            if (bytesBuf.length > 0) {
                const line = bytesBuf.toString('utf-8').trim();
                bytesConsumed += bytesBuf.length;
                if (line && !needHeaders) {
                    const row = parseCsvLine(line);
                    while (row.length < headers.length) { row.push(''); }
                    rows.push(row.slice(0, headers.length));
                }
            }
            settle(true);
        });

        stream.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
    });
}

export function parseCsv(text: string): CsvData {
    const lines = splitCsvLines(text);
    if (lines.length === 0) { return { headers: [], rows: [] }; }
    const headers = parseCsvLine(lines[0]);
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) { continue; }
        const row = parseCsvLine(line);
        while (row.length < headers.length) { row.push(''); }
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
        if (ch === '"') { inQuotes = !inQuotes; current += ch; }
        else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && text[i + 1] === '\n') { i++; }
            lines.push(current); current = '';
        } else { current += ch; }
    }
    if (current.length > 0) { lines.push(current); }
    return lines;
}

export function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { current += '"'; i++; }
                else { inQuotes = false; }
            } else { current += ch; }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { fields.push(current.trim()); current = ''; }
            else { current += ch; }
        }
    }
    fields.push(current.trim());
    return fields;
}
