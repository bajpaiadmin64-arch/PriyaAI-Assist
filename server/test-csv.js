'use strict';

// Unit tests for server/markdown-csv.js

const { parseMarkdownTables, tableToCsv, replyToCsv } = require('./markdown-csv');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + JSON.stringify(extra)}`);
}

const reply = `
Here is the comparison:

| Provider | Free tier | Rate limit |
| --- | --- | --- |
| Gemini | Yes | 1,000 req/day |
| Groq | Yes | 30 req/min |
| Sarvam | Yes | credits |

And some text after the table.
`;

const tables = parseMarkdownTables(reply);
check('one table extracted', tables.length === 1, tables);
check('header parsed', tables[0].header.join('|') === 'Provider|Free tier|Rate limit', tables[0].header);
check('separator row skipped', tables[0].rows.length === 3, tables[0].rows);
check('quoted cell escapes', tables[0].rows[0][2] === '1,000 req/day', tables[0].rows[0]);

const csv = replyToCsv(reply);
check('csv generated', typeof csv === 'string' && csv.includes('\r\n'), csv);
check('csv quotes commas', csv.includes('"1,000 req/day"'), csv);
check('csv line count', csv.split('\r\n').length === 4, csv);

const noTable = replyToCsv('No table here at all.');
check('no table -> null', noTable === null, noTable);

const multi = replyToCsv('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| C |\n| --- |\n| 3 |');
check('multiple tables joined', multi && multi.split('\r\n\r\n').length === 2, multi);

const escapeTest = replyToCsv('| Name | Value |\n| --- | --- |\n| a,b | "quoted" |');
check('quotes escaped', escapeTest && escapeTest.includes('"a,b"' ) && escapeTest.includes('""quoted""'), escapeTest);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
