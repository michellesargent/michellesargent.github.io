// src/lib/content/thumbnails.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function getThumbnailUrl(absolutePath: string | null): string | null {
  if (!absolutePath) return null;
  const normalized = absolutePath.replace(/\\/g, '/');

  // Match the last '/work/<type>/' and return the canonical public path
  const m = normalized.match(/\/work\/(case-studies|articles)\/(.+)$/);
  if (m && m[1] && m[2]) {
    return `/content-assets/${m[1]}/${m[2]}`;
  }

  // Fallback: try relative to repoRoot and strip everything before the final 'work/'.
  try {
    const rel = path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
    if (rel.includes('work/')) {
      const afterWork = rel.split('work/').pop();
      if (afterWork) return `/content-assets/${afterWork}`;
    }
  } catch (e) {
    // ignore
  }

  return null;
}