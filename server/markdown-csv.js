'use strict';

/**
 * Extract markdown tables from a reply and convert them to CSV.
 * Simple, deterministic — only `| a | b |` style rows.
 */

function parseMarkdownTables(text) {
  if (!text) return [];
  const tables = [];
  const lines = text.split(/\r?\n/);
  let current = null;

  const flush = () => {
    if (current && current.rows.length > 0) tables.push(current);
    current = null;
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('|') || !t.endsWith('|')) {
      flush();
      continue;
    }
    const cells = t
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    // separator row like | --- | --- |
    if (cells.length && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')))) {
      if (current) current.separatorSeen = true;
      continue;
    }
    if (!current) current = { header: null, rows: [], separatorSeen: false };
    if (!current.header) {
      current.header = cells;
    } else {
      current.rows.push(cells);
    }
  }
  flush();
  return tables;
}

function csvEscape(value) {
  const s = String(value == null ? '' : value).replace(/\r?\n/g, ' ');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function tableToCsv(table) {
  const lines = [];
  if (table.header) lines.push(table.header.map(csvEscape).join(','));
  for (const row of table.rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\r\n');
}

function replyToCsv(text) {
  const tables = parseMarkdownTables(text);
  if (tables.length === 0) return null;
  return tables.map(tableToCsv).join('\r\n\r\n');
}

module.exports = { parseMarkdownTables, tableToCsv, replyToCsv };