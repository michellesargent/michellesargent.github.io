// src/lib/content/thumbnails.ts
//
// The content loader (`src/lib/content/loader.ts`) now emits public URLs
// (e.g. `/content-assets/articles/<slug>/assets/thumbnail.png`) directly on
// the `thumbnail` field. This helper is retained as a safe passthrough so
// existing component call sites keep working, and so a future regression
// that hands in an absolute filesystem path fails closed (returns null)
// instead of producing a broken URL with the CI workspace path leaked in.

export function getThumbnailUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Already a URL we can serve: root-relative, protocol-relative, or absolute.
  if (trimmed.startsWith('/') || /^([a-z]+:)?\/\//i.test(trimmed)) {
    return trimmed;
  }

  return null;
}
