import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_LEGAL_PAGES_DIR } from '../lib/assets/generated-paths.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, GENERATED_LEGAL_PAGES_DIR);
const iconSource = join(root, 'assets/icons/app-icon-512x512.png');
const iconFileName = 'app-icon-512x512.png';

const SITE_LINKS = [
  { href: 'index.html', label: 'Головна' },
  { href: 'about.html', label: 'Про гру та правила' },
  { href: 'ai-attestation.html', label: 'Заява про ШІ' },
  { href: 'privacy.html', label: 'Конфіденційність' },
  { href: 'terms.html', label: 'Умови' },
] as const;

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
  {
    slug: 'about',
    title: 'Про гру та правила — Wordreapers',
    source: 'docs/wordreapers_about.md',
  },
  {
    slug: 'ai-attestation',
    title: 'Заява про використання ШІ — Wordreapers',
    source: 'docs/legal/uk-uk/ai_attestation.md',
  },
];

const STYLES = `
  body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  .site-header { text-align: center; margin-bottom: 2rem; }
  .site-header img { width: 96px; height: 96px; border-radius: 22%; }
  .site-header h1 { margin: 0.75rem 0 0.25rem; font-size: 1.75rem; }
  .site-header p { margin: 0; color: #555; }
  .site-nav { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; justify-content: center; margin: 1rem 0 0; padding: 0; list-style: none; font-size: 0.95rem; }
  .site-nav a { color: #2d4a3e; }
  .site-footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.9rem; color: #555; }
  .site-footer a { color: #2d4a3e; }
  h1, h2, h3 { line-height: 1.25; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95rem; }
  th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; }
  th { background: #f5f3ed; }
  a { color: #2d4a3e; }
  blockquote { border-left: 3px solid #2d4a3e; margin-left: 0; padding-left: 1rem; color: #444; }
  code { background: #f0eeea; padding: 0.1em 0.3em; border-radius: 3px; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5rem 0; }
`;

const HTML_LINK_REWRITES: Record<string, string> = {
  'legal/uk-uk/privacy_policy.md': 'privacy.html',
  'legal/uk-uk/terms_of_use.md': 'terms.html',
  'legal/uk-uk/open_source.md':
    'https://github.com/vaza18/wordreapers/blob/main/docs/legal/uk-uk/open_source.md',
  'legal/uk-uk/ai_attestation.md': 'ai-attestation.html',
  'privacy_policy.md': 'privacy.html',
  'terms_of_use.md': 'terms.html',
  'ai_attestation.md': 'ai-attestation.html',
  'https://vaza18.github.io/wordreapers/ai-attestation.html': 'ai-attestation.html',
};

function rewriteMarkdownLinks(md: string): string {
  return md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, href: string) => {
    if (href.startsWith('#')) {
      return match;
    }
    const rewritten = HTML_LINK_REWRITES[href];
    if (rewritten) {
      return `[${label}](${rewritten})`;
    }
    return match;
  });
}

/** Minimal markdown → HTML for legal docs (headings, tables, lists, links, emphasis). */
function markdownToHtml(md: string): string {
  const lines = rewriteMarkdownLinks(md).replace(/\r\n/g, '\n').split('\n');
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

    if (/^---+$/.test(line.trim())) {
      out.push('<hr />');
    } else if (line.startsWith('### ')) {
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

function renderSiteNav(activeHref: string): string {
  const items = SITE_LINKS.map(
    ({ href, label }) =>
      `<li><a href="${href}"${href === activeHref ? ' aria-current="page"' : ''}>${label}</a></li>`,
  ).join('\n    ');
  return `<nav aria-label="Сайт Wordreapers"><ul class="site-nav">\n    ${items}\n  </ul></nav>`;
}

function renderSiteHeader(activeHref: string, subtitle?: string): string {
  const subtitleHtml = subtitle ? `<p>${subtitle}</p>` : '';
  return `<header class="site-header">
  <a href="index.html"><img src="${iconFileName}" width="96" height="96" alt="Wordreapers" /></a>
  <h1>Wordreapers</h1>
  <p>Словозбирачі</p>
  ${subtitleHtml}
  ${renderSiteNav(activeHref)}
</header>`;
}

function renderSiteFooter(): string {
  const links = SITE_LINKS.filter(({ href }) => href !== 'index.html')
    .map(({ href, label }) => `<a href="${href}">${label}</a>`)
    .join(' · ');
  return `<footer class="site-footer">
  <p>${links}</p>
  <p><a href="https://github.com/vaza18/wordreapers">GitHub</a> · vaza18@gmail.com</p>
</footer>`;
}

function wrapPage(slug: string, title: string, body: string, subtitle?: string): string {
  const activeHref = slug === 'index' ? 'index.html' : `${slug}.html`;
  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>${STYLES}</style>
</head>
<body>
${renderSiteHeader(activeHref, subtitle)}
<main>
${body}
</main>
${renderSiteFooter()}
</body>
</html>`;
}

mkdirSync(outDir, { recursive: true });
copyFileSync(iconSource, join(outDir, iconFileName));

for (const page of pages) {
  const md = readFileSync(join(root, page.source), 'utf8');
  const html = wrapPage(page.slug, page.title, markdownToHtml(md));
  const outPath = join(outDir, `${page.slug}.html`);
  writeFileSync(outPath, html);
  console.log('Wrote', outPath);
}

const indexBody = `
  <p>Офіційні тексти додатку <strong>Wordreapers</strong> (Словозбирачі) — правила гри, заява про використання штучного інтелекту при розробці та юридичні документи.</p>
  <ul>
    <li><a href="about.html">Про гру та правила</a></li>
    <li><a href="ai-attestation.html">Заява про використання ШІ та відповідальність</a></li>
    <li><a href="privacy.html">Політика конфіденційності</a></li>
    <li><a href="terms.html">Умови використання</a></li>
  </ul>
`;

writeFileSync(
  join(outDir, 'index.html'),
  wrapPage('index', 'Wordreapers — Словозбирачі', indexBody, 'Документація додатку'),
);
console.log('Wrote', join(outDir, 'index.html'));
