/**
 * Optional talk summaries.
 *
 * A summary is a sibling of the media file: talks/foo.mp4 → talks/foo.md
 * (same for interviews/ or any later folder, and for an .mp3 path).
 * Missing files are skipped. The build never requires one.
 *
 * The file is plain paragraphs separated by a blank line. A block that is
 * only a Markdown heading is dropped. Inline Markdown is not interpreted;
 * the text is escaped and each block becomes a paragraph.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function toPosix(p) {
  return String(p || "").split(/[/\\]/).join("/");
}

function isExternal(href) {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}

/** `talks/foo.mp4` → `talks/foo.md`, or null when there is no local media path. */
export function summaryMarkdownRel(video) {
  const media = toPosix(video?.path).trim();
  if (!media || isExternal(media) || media.startsWith("/")) return null;
  if (!/\.(mp4|mp3)$/i.test(media)) return null;
  return media.replace(/\.(mp4|mp3)$/i, ".md");
}

/** Paragraph strings, or [] when the file is missing or empty. */
export function readSummaryParagraphs(absPath) {
  if (!absPath || !existsSync(absPath)) return [];
  let raw;
  try {
    raw = readFileSync(absPath, "utf8");
  } catch {
    return [];
  }
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block && !/^#{1,6}\s+\S/.test(block));
}

export function summaryParagraphsFor(galleryDir, video) {
  const rel = summaryMarkdownRel(video);
  if (!rel || !galleryDir) return { rel: null, paragraphs: [] };
  return { rel, paragraphs: readSummaryParagraphs(join(galleryDir, ...rel.split("/"))) };
}

/** Snippet for a meta description. Falls back when there is no summary. */
export function summaryDescription(paragraphs, fallback, max = 180) {
  const text = (paragraphs || []).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const last = cut.lastIndexOf(" ");
  const base = (last > 80 ? cut.slice(0, last) : cut).trimEnd();
  return `${base}…`;
}
