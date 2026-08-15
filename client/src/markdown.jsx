import React from 'react';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderMarkdownHtml(src) {
  const codeBlocks = [];
  src = src.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    codeBlocks.push({ lang: lang || 'code', code });
    return `\u0000CB${codeBlocks.length - 1}\u0000`;
  });

  src = escapeHtml(src);

  src = src
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const lines = src.split('\n');
  let html = '';
  let listType = null;
  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const cbMatch = line.match(/^\u0000CB(\d+)\u0000$/);
    if (cbMatch) {
      closeList();
      const cb = codeBlocks[+cbMatch[1]];
      const copyId = 'cp' + Math.random().toString(36).slice(2, 10);
      html += `<div class="code-block"><div class="code-head"><span class="code-lang">${cb.lang}</span><button class="copy-code-btn" data-copy="${copyId}" type="button">Copy</button></div><pre><code id="${copyId}">${escapeHtml(cb.code)}</code></pre></div>`;
      continue;
    }

    if (/^\s*$/.test(line)) { closeList(); continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { closeList(); const lvl = h[1].length; html += `<h${lvl}>${h[2]}</h${lvl}>`; continue; }

    if (/^(-{3,}|\*{3,})$/.test(line)) { closeList(); html += '<hr>'; continue; }

    const bq = line.match(/^&gt;\s?(.*)$/);
    if (bq) { closeList(); html += `<blockquote>${bq[1]}</blockquote>`; continue; }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) { if (listType !== 'ul') { closeList(); listType = 'ul'; html += '<ul>'; } html += `<li>${ul[1]}</li>`; continue; }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) { if (listType !== 'ol') { closeList(); listType = 'ol'; html += '<ol>'; } html += `<li>${ol[1]}</li>`; continue; }

    closeList();
    html += `<p>${line}</p>`;
  }
  closeList();
  return html;
}

export default function Markdown({ text }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(text) }} />;
}
