type MarkdownAstNode = {
  content?: string;
  children?: MarkdownAstNode[];
};

/**
 * Plain text from a markdown AST node (headings, links, etc.).
 */
export function markdownAstPlainText(node: MarkdownAstNode): string {
  if (node.children && node.children.length > 0) {
    return node.children.map(markdownAstPlainText).join('');
  }
  return node.content ?? '';
}
