const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Standalone markdown image line → HTML paragraph for GitHub Pages legal build.
 * Returns null if the line is not a sole `![alt](src)` image.
 */
export function markdownImageLineToHtml(line: string): string | null {
  const match = line.trim().match(IMAGE_LINE_RE);
  if (!match) {
    return null;
  }
  const alt = escapeHtmlAttr(match[1] ?? '');
  const src = escapeHtmlAttr(match[2] ?? '');
  return `<p class="content-image"><img src="${src}" alt="${alt}" /></p>`;
}
