#!/usr/bin/env node
/**
 * Helper for the galleries under confs/<ORG>/<YEAR>/<month>/ and vids/<YEAR>/.
 *
 * Usage:
 *   node scripts/confs.mjs list
 *   node scripts/confs.mjs landing-pages [--dry-run] [--conf KERI/2026/apr]...
 *   node scripts/confs.mjs sync-subtitles [--dry-run] [--conf KERI/2026/apr]...
 *   node scripts/confs.mjs verify [--remote https://keri.foundation] [--conf KERI/2026/apr]...
 *
 * list            Print every gallery id that has an index.json.
 *                 Conferences are ORG/YEAR/month. Video galleries are vids/YEAR.
 * landing-pages   Copy the shared template into every gallery and stamp title /
 *                 description / canonical URL into the social meta tags from that
 *                 gallery's index.json (shell stays shared; only meta content varies).
 *                 Also writes the page header and page.transcriptLinks into the
 *                 HTML as real content, and stamps DISCOVERED_SUBTITLE_LANGS with
 *                 sibling caption files (`foo.nl.srt` next to `foo.srt`) so the
 *                 page does not probe for them.
 * sync-subtitles  Copy curated .srt files from the source folders listed in
 *                 scripts/subtitle-sources.tsv into the conference folders. Only
 *                 subtitles referenced by that conference's index.json are copied
 *                 (English `subtitle`, optional `subtitles` map, plus sibling
 *                 language files `foo.nl.srt` next to `foo.srt` in the source).
 *                 Sources are matched recursively by exact basename.
 * verify          Check that every file referenced by index.json exists (media, mp3,
 *                 subtitles, slides, posters, photos, transcript pages) and list files
 *                 that nothing references. With --remote, also HEAD-request each file
 *                 on the live site.
 */

import { readFile, readdir, stat, copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, "..");
const CONFS_ROOT = join(SITE_ROOT, "confs");
const VIDS_ROOT = join(SITE_ROOT, "vids");
const SOURCES_FILE = join(SCRIPT_DIR, "subtitle-sources.tsv");
const LANDING_TEMPLATE = join(CONFS_ROOT, "template-presentations-landingpage", "index.html");
const SITE_URL = (process.env.SITE_URL || "https://keri.foundation").replace(/\/+$/, "");

const ORG_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const YEAR_RE = /^\d{4}$/;
const IGNORED_FILES = new Set([".DS_Store", ".gitkeep", "index.html", "index.json"]);

function parseArgs(argv) {
  const opts = { command: argv[0], confs: [], dryRun: false, remote: null };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--conf") opts.confs.push(argv[++i].replace(/^\/+|\/+$/g, ""));
    else if (a === "--dry-run" || a === "-n") opts.dryRun = true;
    else if (a === "--remote") opts.remote = argv[++i].replace(/\/+$/, "");
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function setTagContent(html, pattern, value) {
  if (!pattern.test(html)) {
    throw new Error(`landing-pages: template missing match for ${pattern}`);
  }
  return html.replace(pattern, (match, prefix, _old, suffix) => `${prefix}${value}${suffix}`);
}

const SUBTITLE_LANG_MARKER = "/*__DISCOVERED_SUBTITLE_LANGS__*/{}";
const TRANSCRIPT_NAV_MARKER =
  '<nav class="seo-transcript-links" id="seoTranscriptLinks" aria-label="Transcript indexes" hidden><!--__TRANSCRIPT_LINKS__--></nav>';
const GALLERY_HEADER_MARKER = "<!--__GALLERY_HEADER__-->";
const YOUTUBE_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMiA4djggbC00LTIuNXYtMy4yTDggMTJ6Ii8+PC9zdmc+";

/** English subtitle path as stored in index.json, or null. */
function englishSubtitleRel(video) {
  if (typeof video?.subtitle === "string") return video.subtitle;
  if (video?.subtitle && typeof video.subtitle === "object" && video.subtitle.src) {
    return String(video.subtitle.src);
  }
  return null;
}

/**
 * Map of English subtitle path → { lang: sibling path } for files that exist
 * in the gallery (`foo.srt` → `foo.nl.srt`). Only real files are included.
 */
function discoveredSubtitleLangs(config, confDir) {
  const map = {};
  for (const video of config.videos || []) {
    const english = englishSubtitleRel(video);
    if (!english || isExternal(english) || english.startsWith("/")) continue;
    const key = toPosix(english);
    const langs = {};
    for (const rel of discoverLanguageSubtitlePaths(key, confDir)) {
      const match = basename(rel).match(/\.([a-z]{2,3})\.srt$/i);
      if (!match) continue;
      const lang = match[1].toLowerCase();
      if (lang === "en") continue;
      langs[lang] = rel;
    }
    const codes = Object.keys(langs).sort();
    if (!codes.length) continue;
    map[key] = Object.fromEntries(codes.map((code) => [code, langs[code]]));
  }
  const sorted = {};
  for (const key of Object.keys(map).sort()) sorted[key] = map[key];
  return sorted;
}

function embedJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Same escaping as escHtml() in the gallery template. */
function escHtml(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

/** Same filter as renderTranscriptLinks() in the gallery template. */
function transcriptLinkItems(page) {
  const links = Array.isArray(page && page.transcriptLinks) ? page.transcriptLinks : [];
  return links.filter(
    (item) =>
      item &&
      typeof item.href === "string" &&
      item.href.trim() &&
      typeof item.label === "string" &&
      item.label.trim()
  );
}

function renderTranscriptNav(links) {
  const parts = [];
  links.forEach((item, i) => {
    if (i > 0) parts.push('<span class="sep" aria-hidden="true">·</span>');
    parts.push(
      `<a href="${escapeAttr(item.href.trim())}">${escapeText(item.label.trim())}</a>`
    );
  });
  const hidden = links.length ? "" : " hidden";
  return `<nav class="seo-transcript-links" id="seoTranscriptLinks" aria-label="Transcript indexes"${hidden}>${parts.join("")}</nav>`;
}

function stampTranscriptLinks(html, page) {
  if (!html.includes(TRANSCRIPT_NAV_MARKER)) {
    throw new Error("landing-pages: template missing transcript links marker");
  }
  return html.replace(TRANSCRIPT_NAV_MARKER, renderTranscriptNav(transcriptLinkItems(page)));
}

/** Same header markup as renderPageChrome() in the gallery template. */
function renderGalleryHeader(page, pageUrl) {
  const heading = page.heading || page.title || "";
  const href = page.headingHref || "./";
  let html = `<h1><a href="${escHtml(href)}">${escHtml(heading)}</a></h1>`;
  if (page.statusNotice) {
    html += `<div class="status-notice" role="status">${escHtml(page.statusNotice)}</div>`;
  }
  if (page.subtitle) {
    html += `<p class="subtitle">${escHtml(page.subtitle)}</p>`;
  }
  const nav = Array.isArray(page.nav) ? page.nav : [];
  if (nav.length) {
    const parts = [];
    const normalize = (path) => path.replace(/\/+$/, "") || "/";
    const pagePath = normalize(new URL(pageUrl).pathname);
    nav.forEach((item, i) => {
      const prev = nav[i - 1];
      const openInNewTab = item.external === true;
      const target = openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : "";
      let label = escHtml(item.label || "");
      if (item.icon === "youtube") {
        label = `<img src="${YOUTUBE_ICON}" alt="" width="24" height="24" style="vertical-align: middle; margin-right: 5px;">${label}`;
      }
      const prefix = item.prefix ? `${escHtml(item.prefix)} ` : "";
      const newTabHint = openInNewTab
        ? ' <span class="visually-hidden">(opens in a new tab)</span>'
        : "";
      let currentAttr = "";
      try {
        const itemUrl = new URL(item.href, pageUrl);
        if (normalize(itemUrl.pathname) === pagePath) currentAttr = ' aria-current="page"';
      } catch {
        // Ignore invalid href values from config.
      }
      const link = `${prefix}<a href="${escHtml(item.href)}"${target}${currentAttr}>${label}${newTabHint}</a>`;
      if (i === 0) parts.push(link);
      else if (item.prefix) parts.push(" | " + link);
      else if (prev && prev.icon === "youtube" && item.icon === "youtube") parts.push(" " + link);
      else parts.push(" | " + link);
    });
    html += `<nav class="gallery-nav" aria-label="Related pages">${parts.join("")}</nav>`;
  }
  return html;
}

function stampGalleryHeader(html, page, pageUrl) {
  if (!html.includes(GALLERY_HEADER_MARKER)) {
    throw new Error("landing-pages: template missing gallery header marker");
  }
  return html.replace(GALLERY_HEADER_MARKER, renderGalleryHeader(page, pageUrl));
}

function stampLandingMeta(templateHtml, { title, description, url }) {
  const t = escapeAttr(title);
  const d = escapeAttr(description);
  const u = escapeAttr(url);
  let html = templateHtml;
  html = setTagContent(html, /(<title>)([\s\S]*?)(<\/title>)/i, t);
  html = setTagContent(html, /(<meta\s+name="description"\s+content=")([^"]*)(")/i, d);
  html = setTagContent(html, /(<link\s+rel="canonical"\s+href=")([^"]*)(")/i, u);
  html = setTagContent(html, /(<meta\s+property="og:title"\s+content=")([^"]*)(")/i, t);
  html = setTagContent(html, /(<meta\s+property="og:description"\s+content=")([^"]*)(")/i, d);
  html = setTagContent(html, /(<meta\s+property="og:url"\s+content=")([^"]*)(")/i, u);
  html = setTagContent(html, /(<meta\s+name="twitter:title"\s+content=")([^"]*)(")/i, t);
  html = setTagContent(html, /(<meta\s+name="twitter:description"\s+content=")([^"]*)(")/i, d);
  return html;
}

async function cmdLandingPages(opts) {
  if (!existsSync(LANDING_TEMPLATE)) {
    throw new Error(`Missing template: ${LANDING_TEMPLATE}`);
  }
  const templateHtml = await readFile(LANDING_TEMPLATE, "utf8");
  if (!templateHtml.includes(SUBTITLE_LANG_MARKER)) {
    throw new Error("landing-pages: template missing DISCOVERED_SUBTITLE_LANGS marker");
  }
  if (!templateHtml.includes(TRANSCRIPT_NAV_MARKER)) {
    throw new Error("landing-pages: template missing transcript links marker");
  }
  if (!templateHtml.includes(GALLERY_HEADER_MARKER)) {
    throw new Error("landing-pages: template missing gallery header marker");
  }
  let updated = 0;
  let unchanged = 0;
  for (const id of await selectedConferences(opts)) {
    const config = await loadConfig(id);
    const page = config.page || {};
    const title = page.title || page.heading || "KERI Foundation Videos";
    const description =
      page.subtitle || page.description || "Presentations and talks from the KERI Foundation.";
    const url = `${SITE_URL}/${galleryPrefix(id)}/`;
    const langMap = discoveredSubtitleLangs(config, galleryDir(id));
    const html = stampGalleryHeader(
      stampTranscriptLinks(
        stampLandingMeta(templateHtml, { title, description, url }).replace(
          SUBTITLE_LANG_MARKER,
          embedJson(langMap)
        ),
        page
      ),
      page,
      url
    );
    const dest = join(galleryDir(id), "index.html");
    let previous = null;
    try {
      previous = await readFile(dest, "utf8");
    } catch {
      previous = null;
    }
    if (previous === html) {
      console.log(`unchanged ${id}/index.html`);
      unchanged++;
      continue;
    }
    if (opts.dryRun) {
      console.log(`[dry-run] would update ${id}/index.html`);
    } else {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, html, "utf8");
      console.log(`updated  ${id}/index.html`);
    }
    updated++;
  }
  console.log(
    `\nlanding-pages: ${updated} updated, ${unchanged} unchanged` +
      (opts.dryRun ? " (dry-run)" : "")
  );
}

const toPosix = (p) => p.split(sep).join("/");

async function isDir(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function isVidsGallery(id) {
  return id.startsWith("vids/");
}

/** Absolute directory of a gallery (confs/ORG/YEAR/month or vids/YEAR). */
function galleryDir(id) {
  return isVidsGallery(id) ? join(SITE_ROOT, id) : join(CONFS_ROOT, id);
}

/** Site-root prefix used in URLs and verify paths. */
function galleryPrefix(id) {
  return isVidsGallery(id) ? id : `confs/${id}`;
}

async function findConferences() {
  const ids = [];
  if (await isDir(CONFS_ROOT)) {
    for (const org of (await readdir(CONFS_ROOT)).sort()) {
      if (!ORG_RE.test(org) || !(await isDir(join(CONFS_ROOT, org)))) continue;
      for (const year of (await readdir(join(CONFS_ROOT, org))).sort()) {
        if (!YEAR_RE.test(year) || !(await isDir(join(CONFS_ROOT, org, year)))) continue;
        for (const month of (await readdir(join(CONFS_ROOT, org, year))).sort()) {
          if (existsSync(join(CONFS_ROOT, org, year, month, "index.json"))) {
            ids.push(`${org}/${year}/${month}`);
          }
        }
      }
    }
  }
  if (await isDir(VIDS_ROOT)) {
    for (const year of (await readdir(VIDS_ROOT)).sort()) {
      if (!YEAR_RE.test(year) || !(await isDir(join(VIDS_ROOT, year)))) continue;
      if (existsSync(join(VIDS_ROOT, year, "index.json"))) {
        ids.push(`vids/${year}`);
      }
    }
  }
  return ids;
}

async function selectedConferences(opts) {
  const all = await findConferences();
  if (!opts.confs.length) return all;
  for (const id of opts.confs) {
    if (!all.includes(id)) throw new Error(`Unknown conference: ${id} (known: ${all.join(", ")})`);
  }
  return opts.confs;
}

async function loadConfig(id) {
  return JSON.parse(await readFile(join(galleryDir(id), "index.json"), "utf8"));
}

/** Same as generateVideoId() in index.html / generate-transcript-pages.mjs. */
function generateVideoId(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function transcriptsDirOf(config) {
  return typeof config.transcriptsDir === "string" ? config.transcriptsDir.replace(/\/+$/, "") : "";
}

/** True for language-tagged names like `foo.nl.srt` (not the English `foo.srt`). */
function isLanguageSubtitleBasename(name) {
  return /\.[a-z]{2,3}\.srt$/i.test(String(name || ""));
}

/** Escape a string for use inside a RegExp character class / pattern. */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sibling language tracks next to an English subtitle: `foo.srt` → `foo.nl.srt`.
 * Only paths that exist under `confDir` are returned.
 */
function discoverLanguageSubtitlePaths(englishRel, confDir) {
  const en = toPosix(String(englishRel || ""));
  if (!confDir || !en || !/\.srt$/i.test(en)) return [];
  const fileName = basename(en);
  if (isLanguageSubtitleBasename(fileName)) return [];
  const folder = dirname(en);
  const stem = fileName.replace(/\.srt$/i, "");
  const langRe = new RegExp(`^${escapeRegExp(stem)}\\.([a-z]{2,3})\\.srt$`, "i");
  const absDir = join(confDir, folder === "." ? "" : folder);
  if (!existsSync(absDir)) return [];
  try {
    return readdirSync(absDir)
      .filter((name) => langRe.test(name))
      .map((name) => toPosix(folder === "." ? name : `${folder}/${name}`))
      .sort();
  } catch {
    return [];
  }
}

/** From an English basename, find `foo.nl.srt` / `foo.es.srt` keys in a basename index. */
function languageSiblingBasenames(englishBasename, byBase) {
  const name = String(englishBasename || "");
  if (!name || isLanguageSubtitleBasename(name)) return [];
  const stem = name.replace(/\.srt$/i, "");
  const langRe = new RegExp(`^${escapeRegExp(stem)}\\.([a-z]{2,3})\\.srt$`, "i");
  return [...byBase.keys()].filter((base) => langRe.test(base)).sort();
}

/** Collect every subtitle path on a video (`subtitle` + optional `subtitles` map + siblings). */
function collectSubtitlePaths(video, confDir = null) {
  const paths = [];
  const add = (value) => {
    if (!value) return;
    if (typeof value === "string") paths.push(value);
    else if (typeof value === "object" && value.src) paths.push(String(value.src));
  };
  add(video?.subtitle);
  if (video?.subtitles && typeof video.subtitles === "object") {
    for (const value of Object.values(video.subtitles)) add(value);
  }
  const english = typeof video?.subtitle === "string"
    ? video.subtitle
    : (video?.subtitle && typeof video.subtitle === "object" && video.subtitle.src
      ? String(video.subtitle.src)
      : null);
  if (english) {
    for (const sibling of discoverLanguageSubtitlePaths(english, confDir)) add(sibling);
  }
  return [...new Set(paths.map((p) => toPosix(String(p))))];
}

/** English (or first) subtitle path used for SEO transcript pages. */
function primarySubtitlePath(video) {
  if (video?.subtitles && typeof video.subtitles === "object") {
    const en = video.subtitles.en;
    if (typeof en === "string") return toPosix(en);
    if (en && typeof en === "object" && en.src) return toPosix(String(en.src));
  }
  if (typeof video?.subtitle === "string") return toPosix(video.subtitle);
  if (video?.subtitle && typeof video.subtitle === "object" && video.subtitle.src) {
    return toPosix(String(video.subtitle.src));
  }
  const all = collectSubtitlePaths(video);
  return all[0] || null;
}

function transcriptPageRel(config, video) {
  const dir = transcriptsDirOf(config);
  const subtitle = primarySubtitlePath(video);
  if (!dir || !subtitle) return null;
  const id = generateVideoId(video.title);
  if (!id) return null;
  const section = String(subtitle).split("/").slice(-2, -1)[0];
  return section ? `${dir}/${section}/${id}.html` : `${dir}/${id}.html`;
}

function isExternal(href) {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}

/** Every local asset referenced by a gallery config: [{ kind, label, href }]. */
function collectRefs(config, confDir = null) {
  const refs = [];
  const add = (kind, label, href) => {
    if (href && !isExternal(href)) refs.push({ kind, label, href: String(href) });
  };

  for (const item of config.page?.nav || []) {
    const href = String(item.href || "");
    if (href.startsWith("/confs/") || href.startsWith("/vids/") || (href && !href.startsWith("/"))) {
      add("nav", item.label, href);
    }
  }
  if (config.promo) {
    add("promo", "promo video", config.promo.src);
    add("promo", "promo poster", config.promo.poster);
  }
  add("poster", "defaultPoster", config.defaultPoster);
  for (const [name, src] of Object.entries(config.speakerPhotos || {})) add("photo", name, src);

  const sections = new Set();
  for (const v of config.videos || []) {
    add("video", v.title, v.path);
    add("audio", v.title, v.audio || (v.path ? String(v.path).replace(/\.mp4$/i, ".mp3") : ""));
    for (const sub of collectSubtitlePaths(v, confDir)) add("subtitle", v.title, sub);
    add("slides", v.title, v.presentation);
    add("poster", v.title, v.poster);
    const page = transcriptPageRel(config, v);
    if (page) {
      add("transcript", v.title, page);
      sections.add(dirname(page));
    }
  }
  for (const dir of sections) add("transcript", "listing", `${dir}/`);
  return refs;
}

/** Map a reference to a path relative to the site root (e.g. confs/KERI/2026/apr/talks/x.mp4). */
function siteRelative(id, href) {
  const clean = href.split(/[?#]/)[0];
  let rel = clean.startsWith("/") ? clean.slice(1) : `${galleryPrefix(id)}/${clean}`;
  rel = toPosix(relative(SITE_ROOT, resolve(SITE_ROOT, rel)));
  if (clean.endsWith("/") || clean === "") rel += "/index.html";
  return rel.replace(/\/\/+/g, "/");
}

async function walkFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(abs)));
    else out.push(abs);
  }
  return out;
}

function encodePath(rel) {
  return rel.split("/").map(encodeURIComponent).join("/");
}

async function headAll(urls, concurrency = 6) {
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "manual" });
        results.set(url, res.status);
      } catch (err) {
        results.set(url, `error: ${err.cause?.code || err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function cmdVerify(opts) {
  let problems = 0;
  for (const id of await selectedConferences(opts)) {
    const config = await loadConfig(id);
    const confDir = galleryDir(id);
    const refs = collectRefs(config, confDir);
    console.log(`\n== ${id}  (${(config.videos || []).length} videos, ${refs.length} local references)`);

    const referenced = new Set();
    const missing = [];
    for (const ref of refs) {
      const rel = siteRelative(id, ref.href);
      referenced.add(rel);
      if (!existsSync(join(SITE_ROOT, rel))) missing.push({ ...ref, rel });
    }
    for (const m of missing) console.log(`  MISSING ${m.kind.padEnd(10)} ${m.rel}   (${m.label})`);
    problems += missing.length;

    const transcriptsDir = transcriptsDirOf(config);
    const unreferenced = (await walkFiles(confDir))
      .map((abs) => toPosix(relative(SITE_ROOT, abs)))
      .filter((rel) => !IGNORED_FILES.has(rel.split("/").pop()))
      .filter((rel) => !referenced.has(rel))
      .filter((rel) => !(transcriptsDir && rel.startsWith(`${galleryPrefix(id)}/${transcriptsDir}/`) && rel.endsWith(".html")));
    for (const rel of unreferenced) console.log(`  unused  ${rel}`);

    if (!missing.length) console.log("  all referenced files present locally");

    if (opts.remote) {
      const urls = [`${opts.remote}/${galleryPrefix(id)}/`, ...[...referenced].map((rel) => `${opts.remote}/${encodePath(rel)}`)];
      const results = await headAll([...new Set(urls)]);
      let bad = 0;
      for (const [url, status] of results) {
        if (status !== 200) {
          bad++;
          console.log(`  REMOTE ${status}  ${decodeURIComponent(url)}`);
        }
      }
      console.log(bad ? `  remote: ${bad} of ${results.size} URLs not OK` : `  remote: all ${results.size} URLs return 200`);
      problems += bad;
    }
  }
  if (problems) {
    console.log(`\n${problems} problem(s) found.`);
    process.exit(1);
  }
  console.log("\nverify: OK");
}

async function readSources() {
  if (!existsSync(SOURCES_FILE)) return [];
  const lines = (await readFile(SOURCES_FILE, "utf8")).split("\n");
  const sources = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(\S+)\s+(.+)$/);
    if (!m) throw new Error(`Bad line in ${SOURCES_FILE}: ${raw}`);
    const target = m[1].replace(/^\/+|\/+$/g, "");
    const source = m[2].trim().replace(/^~(?=\/)/, homedir());
    const parts = target.split("/");
    let conf;
    let folder;
    if (parts[0] === "vids") {
      if (parts.length < 3 || !YEAR_RE.test(parts[1])) {
        throw new Error(`Target must be vids/<YEAR>/<folder> (e.g. vids/2026/talks): ${target}`);
      }
      conf = parts.slice(0, 2).join("/");
      folder = parts.slice(2).join("/");
    } else if (parts.length < 4) {
      throw new Error(`Target must be <gallery id>/<folder> (e.g. KERI/2026/apr/talks or vids/2026/talks): ${target}`);
    } else {
      conf = parts.slice(0, 3).join("/");
      folder = parts.slice(3).join("/");
    }
    sources.push({ conf, folder, source });
  }
  return sources;
}

async function sameContent(a, b) {
  if (!existsSync(b)) return false;
  const [x, y] = await Promise.all([readFile(a), readFile(b)]);
  return x.equals(y);
}

/** Index .srt files under a source tree by basename (first match wins). */
async function indexSrtByBasename(root) {
  const byBase = new Map();
  for (const abs of await walkFiles(root)) {
    if (!abs.toLowerCase().endsWith(".srt")) continue;
    const base = abs.split(sep).pop();
    if (base && !byBase.has(base)) byBase.set(base, abs);
  }
  return byBase;
}

async function cmdSyncSubtitles(opts) {
  const confs = await selectedConferences(opts);
  const sources = (await readSources()).filter((s) => confs.includes(s.conf));
  if (!sources.length) {
    console.log("Subtitles are edited in place under the gallery folders (no external sources).");
    return;
  }
  let copied = 0;
  for (const { conf, folder, source } of sources) {
    console.log(`\n== ${conf}/${folder}  ←  ${source}`);
    if (!(await isDir(source))) {
      console.log("  source folder not found, skipped");
      continue;
    }
    const config = await loadConfig(conf);
    const byBase = await indexSrtByBasename(source);
    const wanted = new Set(
      (config.videos || [])
        .flatMap((v) => collectSubtitlePaths(v))
        .filter((s) => s && dirname(s) === folder)
        .map((s) => s.slice(folder.length + 1))
    );
    // Also pull sibling language tracks (`foo.nl.srt`) present in the source tree.
    for (const name of [...wanted]) {
      if (isLanguageSubtitleBasename(name)) continue;
      for (const sibling of languageSiblingBasenames(name, byBase)) wanted.add(sibling);
    }
    let unchanged = 0;
    for (const name of [...wanted].sort()) {
      const src = byBase.get(name) || null;
      const dest = join(galleryDir(conf), folder, name);
      if (!src) {
        console.log(`  not in source: ${name}`);
        continue;
      }
      if (await sameContent(src, dest)) {
        unchanged++;
        continue;
      }
      console.log(`  ${opts.dryRun ? "[dry-run] " : ""}${existsSync(dest) ? "update" : "new"}: ${name}`);
      if (!opts.dryRun) {
        await mkdir(dirname(dest), { recursive: true });
        await copyFile(src, dest);
      }
      copied++;
    }
    console.log(`  ${unchanged} unchanged`);
  }
  console.log(`\nsync-subtitles: ${copied} file(s) ${opts.dryRun ? "would be " : ""}copied`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  switch (opts.command) {
    case "list":
      for (const id of await selectedConferences(opts)) console.log(id);
      break;
    case "landing-pages":
      await cmdLandingPages(opts);
      break;
    case "sync-subtitles":
      await cmdSyncSubtitles(opts);
      break;
    case "verify":
      await cmdVerify(opts);
      break;
    default:
      console.log(
        "Usage: node scripts/confs.mjs <list|landing-pages|sync-subtitles|verify> [--conf ORG/YEAR/month|vids/YEAR] [--dry-run] [--remote URL]"
      );
      process.exit(opts.command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
