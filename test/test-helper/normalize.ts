export function normalizeMarkdown(markdown: string) {
  return {
    markdown: markdown.replace(/^generated_at: .+$/m, 'generated_at: <generated-at>'),
    sha256: markdown.match(/^sha256: ([a-f0-9]+)$/m)?.[1]
  }
}
