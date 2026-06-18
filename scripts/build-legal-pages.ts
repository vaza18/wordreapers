import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_LEGAL_PAGES_DIR } from '../lib/assets/generated-paths.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, GENERATED_LEGAL_PAGES_DIR);

const pages: Array<{ slug: string; title: string; source: string }> = [
  {
    slug: 'privacy',
    title: 'Політика конфіденційності — Wordreapers',
    source: 'docs/legal/uk-uk/privacy_policy.md',
  },
  {
    slug: 'terms',
    title: 'Умови використання — Wordreapers',
    source: 'docs/legal/uk-uk/terms_of_use.md',
  },
];

const STYLES = `
  body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1, h2, h3 { line-height: 1.25; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95rem; }
  th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; }
  th { background: #f5f3ed; }
  a { color: #2d4a3e; }
  blockquote { border-left: 3px solid #2d4a3e; margin-left: 0; padding-left: 1rem; color: #444; }
  code { background: #f0eeea; padding: 0.1em 0.3em; border-radius: 3px; }
`;

/** Minimal markdown → HTML for legal docs (headings, tables, lists, links, emphasis). */
function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  const flushTable = (): void => {
    if (tableRows.length === 0) {
      return;
    }
    out.push('<table>');
    tableRows.forEach((row, i) => {
      const cells = row
        .split('|')
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        return;
      }
      const tag = i === 0 ? 'th' : 'td';
      const rowTag = i === 0 ? 'thead><tr' : 'tr';
      if (i === 0) {
        out.push(
          `<${rowTag}>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr></thead><tbody>`,
        );
      } else {
        out.push(`<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
      }
    });
    out.push('</tbody></table>');
    tableRows = [];
    inTable = false;
  };

  const inline = (text: string): string =>
    text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (const line of lines) {
    if (line.startsWith('|')) {
      inTable = true;
      tableRows.push(line);
      continue;
    }
    if (inTable) {
      flushTable();
    }

    if (line.startsWith('### ')) {
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith('> ')) {
      out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
    } else if (/^[-*] /.test(line)) {
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      out.push('');
    } else {
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inTable) {
    flushTable();
  }

  return out.join('\n').replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);
}

function wrapPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>${STYLES}</style>
</head>
<body>
${body}
<p><a href="privacy.html">Політика конфіденційності</a> · <a href="terms.html">Умови використання</a></p>
</body>
</html>`;
}

mkdirSync(outDir, { recursive: true });

for (const page of pages) {
  const md = readFileSync(join(root, page.source), 'utf8');
  const html = wrapPage(page.title, markdownToHtml(md));
  const outPath = join(outDir, `${page.slug}.html`);
  writeFileSync(outPath, html);
  console.log('Wrote', outPath);
}

const index = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Wordreapers — Legal</title>
  <style>${STYLES}</style>
</head>
<body>
  <h1>Wordreapers</h1>
  <p>Юридичні документи додатку Wordreapers (Словозбирачі).</p>
  <ul>
    <li><a href="privacy.html">Політика конфіденційності</a></li>
    <li><a href="terms.html">Умови використання</a></li>
  </ul>
</body>
</html>`;

writeFileSync(join(outDir, 'index.html'), index);
console.log('Wrote', join(outDir, 'index.html'));
