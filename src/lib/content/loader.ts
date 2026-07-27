import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { marked } from 'marked';
import { classifyUrl } from './cisco-links';
import {
  getArticleCatalog,
  getCaseStudyCatalog,
  validateCatalog,
} from './catalog';
import type {
  Article,
  CaseStudy,
  ContentRef,
  ArticleMetadata,
  CaseStudyMetadata,
  GalleryImage,
  GalleryImageInput,
} from './types';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

validateCatalog();

function readYaml<T>(filePath: string): T {
  return yaml.load(fs.readFileSync(filePath, 'utf8')) as T;
}

const EXCERPT_MAX_LENGTH = 180;

function extractExcerpt(markdown: string): string {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('![') && !line.startsWith('>'));

  const text = lines.slice(0, 2).join(' ');
  if (text.length <= EXCERPT_MAX_LENGTH) return text;

  return `${text.slice(0, EXCERPT_MAX_LENGTH - 3)}...`;
}

function extractPortfolioAngles(markdown: string): string[] {
  const section = markdown.match(/## Portfolio angles([\s\S]*?)(?:\n## |\n$|$)/);
  if (!section) return [];

  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- [x]'))
    .map((line) => line.replace(/^- \[x\]\s*/, ''));
}

function toContentAssetUrl(
  type: 'case-studies' | 'articles',
  slug: string,
  relativeFromSlug: string,
): string {
  const clean = relativeFromSlug.replace(/\\/g, '/').replace(/^\/+/, '');
  return `/content-assets/${type}/${slug}/${clean}`;
}

function resolveThumbnail(
  type: 'case-studies' | 'articles',
  slug: string,
  relativePath?: string,
): string | null {
  const candidates: Array<{ abs: string; rel: string }> = [];
  if (relativePath) {
    candidates.push({
      abs: path.join(repoRoot, 'work', type, slug, relativePath),
      rel: relativePath,
    });
  }
  candidates.push(
    {
      abs: path.join(repoRoot, 'work', type, slug, 'assets/thumbnail.png'),
      rel: 'assets/thumbnail.png',
    },
    {
      abs: path.join(repoRoot, 'work', type, slug, 'assets/thumbnail.svg'),
      rel: 'assets/thumbnail.svg',
    },
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.abs)) {
      return toContentAssetUrl(type, slug, candidate.rel);
    }
  }

  return null;
}

function resolveAssetUrl(
  type: 'case-studies' | 'articles',
  slug: string,
  relativePath: string,
): string {
  // Only rewrite in-repo asset references (e.g., `assets/foo.png`).
  // Leave absolute URLs, root-relative paths, and other links untouched.
  if (!relativePath || /^([a-z]+:)?\/\//i.test(relativePath) || relativePath.startsWith('/')) {
    return relativePath;
  }
  if (!relativePath.startsWith('assets/')) {
    return relativePath;
  }

  const absolute = path.join(repoRoot, 'work', type, slug, relativePath);
  if (!fs.existsSync(absolute)) {
    return relativePath;
  }

  return toContentAssetUrl(type, slug, relativePath);
}

function resolveGallery(
  type: 'case-studies' | 'articles',
  slug: string,
  items: GalleryImageInput[] = [],
): GalleryImage[] {
  return items.map((item) => ({
    src: resolveAssetUrl(type, slug, item.src),
    alt: item.alt,
  }));
}

function renderMarkdown(
  markdown: string,
  type: 'case-studies' | 'articles',
  slug: string,
): string {
  const renderer = new marked.Renderer();

  renderer.link = ({ href, title, text }) => {
    const access = classifyUrl(href ?? '');
    const titleAttr = title ? ` title="${title}"` : '';

    if (access === 'internal-ref') {
      return `<span class="internal-ref" data-label="${text}">${text}<span class="access-label">Internal reference</span></span>`;
    }

    if (access === 'cisco-sso-vpn') {
      return `<a href="${href}"${titleAttr} class="cisco-link" target="_blank" rel="noopener noreferrer">${text}<span class="access-badge">Requires Cisco SSO &amp; VPN</span></a>`;
    }

    const external = href?.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${titleAttr}${external}>${text}</a>`;
  };

  renderer.image = ({ href, title, text }) => {
    const src = resolveAssetUrl(type, slug, href ?? '');
    const alt = text || title || '';
    return `<img src="${src}" alt="${alt}" loading="lazy" />`;
  };

  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(markdown, { renderer }) as string;
}

function buildRefMap(): Map<string, ContentRef> {
  const map = new Map<string, ContentRef>();

  for (const entry of getCaseStudyCatalog()) {
    map.set(entry.slug, {
      slug: entry.slug,
      title: entry.title,
      href: `/work/${entry.slug}`,
      kind: 'case-study',
    });
  }

  for (const entry of getArticleCatalog()) {
    map.set(entry.slug, {
      slug: entry.slug,
      title: entry.title,
      href: `/teaching/${entry.slug}`,
      kind: 'article',
    });
  }

  return map;
}

const refMap = buildRefMap();

function resolveRefs(slugs: string[] = []): ContentRef[] {
  return slugs
    .map((slug) => refMap.get(slug))
    .filter((ref): ref is ContentRef => Boolean(ref));
}

export function getCaseStudy(slug: string): CaseStudy | null {
  const catalogEntry = getCaseStudyCatalog().find((entry) => entry.slug === slug);
  if (!catalogEntry) return null;

  const folder = path.join(repoRoot, 'work/case-studies', slug);
  const markdown = fs.readFileSync(path.join(folder, 'index.md'), 'utf8');
  const metadata = readYaml<CaseStudyMetadata>(path.join(folder, 'metadata.yaml'));
  const thumbnailPath = resolveThumbnail('case-studies', slug);

  const relatedSlugs = [
    ...(metadata.related_case_studies ?? []),
    ...(metadata.related_articles ?? []),
  ];

  return {
    ...catalogEntry,
    metadata,
    excerpt: extractExcerpt(markdown),
    bodyHtml: renderMarkdown(markdown, 'case-studies', slug),
    thumbnail: thumbnailPath,
    thumbnailAlt: metadata.assets?.alt ?? metadata.title,
    gallery: resolveGallery('case-studies', slug, metadata.assets?.gallery),
    related: resolveRefs(relatedSlugs),
    portfolioAngles: metadata.portfolio_angles ?? extractPortfolioAngles(markdown),
  };
}

export function getAllCaseStudies(): CaseStudy[] {
  return getCaseStudyCatalog()
    .sort((a, b) => a.priority - b.priority)
    .map((entry) => getCaseStudy(entry.slug))
    .filter((entry): entry is CaseStudy => Boolean(entry));
}

export function getArticle(slug: string): Article | null {
  const catalogEntry = getArticleCatalog().find((entry) => entry.slug === slug);
  if (!catalogEntry) return null;

  const folder = path.join(repoRoot, 'work/articles', slug);
  const markdown = fs.readFileSync(path.join(folder, 'index.md'), 'utf8');
  const metadata = readYaml<ArticleMetadata>(path.join(folder, 'metadata.yaml'));
  const thumbnailPath = resolveThumbnail(
    'articles',
    slug,
    metadata.assets?.thumbnail,
  );

  const relatedSlugs = [
    ...(metadata.related_case_studies ?? []),
    ...(metadata.related_articles ?? []),
  ];

  return {
    ...catalogEntry,
    metadata,
    excerpt: extractExcerpt(markdown),
    bodyHtml: renderMarkdown(markdown, 'articles', slug),
    thumbnail: thumbnailPath,
    thumbnailAlt: metadata.assets?.alt ?? metadata.title,
    gallery: resolveGallery('articles', slug, metadata.assets?.gallery),
    related: resolveRefs(relatedSlugs),
    audience: metadata.audience,
  };
}

export function getAllArticles(): Article[] {
  return getArticleCatalog()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => getArticle(entry.slug))
    .filter((entry): entry is Article => Boolean(entry));
}

export function getContentAssetPath(relativeFromWork: string): string {
  return `/content-assets/${relativeFromWork.replace(/\\/g, '/')}`;
}
