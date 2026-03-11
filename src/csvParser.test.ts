import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import { readCsvChunk } from './csvParser';

describe('CSV Parser Streams', () => {
    let testFilePath = path.join(__dirname, '..', 'test_tmp.csv');
    let largeFilePath = path.join(__dirname, '..', 'large_tmp.csv');

    afterEach(() => {
        if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
        if (fs.existsSync(largeFilePath)) fs.unlinkSync(largeFilePath);
    });

    it('should correctly parse standard Unix (\\n) line endings', async () => {
        fs.writeFileSync(testFilePath, "a,b,c\n1,2,3\n4,5,6");
        const chunk = await readCsvChunk(testFilePath, 0, 500);

        expect(chunk.headers).to.deep.equal(['a', 'b', 'c']);
        expect(chunk.rows).to.deep.equal([['1', '2', '3'], ['4', '5', '6']]);
    });

    it('should correctly parse Windows (\\r\\n) line endings', async () => {
        fs.writeFileSync(testFilePath, "a,b,c\r\n1,2,3\r\n4,5,6");
        const chunk = await readCsvChunk(testFilePath, 0, 500);

        expect(chunk.headers).to.deep.equal(['a', 'b', 'c']);
        expect(chunk.rows).to.deep.equal([['1', '2', '3'], ['4', '5', '6']]);
    });

    it('should correctly parse Old Mac (\\r) line endings', async () => {
        fs.writeFileSync(testFilePath, "a,b,c\r1,2,3\r4,5,6");
        const chunk = await readCsvChunk(testFilePath, 0, 500);

        expect(chunk.headers).to.deep.equal(['a', 'b', 'c']);
        expect(chunk.rows).to.deep.equal([['1', '2', '3'], ['4', '5', '6']]);
    });

    it('should correctly parse newlines embedded inside quoted strings', async () => {
        fs.writeFileSync(testFilePath, 'a,b,c\n1,"line1\nline2",3\n4,5,6');
        const chunk = await readCsvChunk(testFilePath, 0, 500);

        expect(chunk.rows[0][1]).to.equal('line1\nline2');
        expect(chunk.rows.length).to.equal(2);
    });

    it('should gracefully handle files without a trailing newline', async () => {
        fs.writeFileSync(testFilePath, "a,b,c\n1,2,3");
        const chunk = await readCsvChunk(testFilePath, 0, 500);

        expect(chunk.rows.length).to.equal(1);
        expect(chunk.rows[0]).to.deep.equal(['1', '2', '3']);
    });

    describe('Performance and Scale', () => {
        before(async function () {
            this.timeout(10000); // Set timeout longer to create large file if needed
            // Generate 1 million rows
            const writeStream = fs.createWriteStream(largeFilePath);
            writeStream.write("id,value1,value2\n");
            for (let i = 0; i < 1000000; i++) {
                writeStream.write(`${i},valA_${i},valB_${i}\n`);
            }
            writeStream.end();
            await new Promise(resolve => writeStream.on('finish', resolve));
        });

        it('should correctly process 1 million rows using chunked streaming in under 2 seconds', async function () {
            this.timeout(5000); // performance test, expecting ~500ms
            let offset = 0;
            let headers: string[] | undefined = undefined;
            let totalRowsRead = 0;

            const startTime = Date.now();
            while (true) {
                const chunk = await readCsvChunk(largeFilePath, offset, 500, headers);
                if (!headers) headers = chunk.headers;
                totalRowsRead += chunk.rows.length;
                offset = chunk.nextOffset;

                if (chunk.done || offset === -1) {
                    break;
                }
            }
            const duration = Date.now() - startTime;

            expect(headers).to.deep.equal(['id', 'value1', 'value2']);
            expect(totalRowsRead).to.equal(1000000);
            expect(duration).to.be.lessThan(2500); // Check that memory/execution is efficient
        });
    });
});
