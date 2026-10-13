#!/usr/bin/env node
/**
 * Generate static, crawlable HTML transcript pages from gallery index.json + .srt files.
 *
 * Each talk with a subtitle becomes a page under a transcripts/ folder. Paths inside
 * those pages are relative to the gallery index.html so the tree can be moved later.
 * Uses English (`subtitle`); sibling language tracks (`foo.nl.srt`) are ignored here.
 *
 * Usage:
 *   node scripts/generate-transcript-pages.mjs \
 *     --config confs/KERI/2026/apr/index.json
 *
 * Options:
 *   --config <path>   Gallery index.json (required). Media root = its directory.
 *   --dry-run         Print planned outputs without writing.
 *
 * Output layout (must match transcriptPagePath() in the gallery index.html):
 *   - with "transcriptsDir": "transcripts/html" in index.json:
 *       subtitle "talks/foo.srt"      → transcripts/html/talks/<id>.html
 *       subtitle "interviews/foo.srt" → transcripts/html/interviews/<id>.html
 *   - without transcriptsDir (legacy /confs/2026/videos/ layout):
 *       subtitle "KERICONF26/subtitles/foo.srt" → KERICONF26/transcripts/<id>.html
 *       subtitle "speakers/foo.srt" (no /subtitles/) → transcripts/<id>.html
 *   Plus an index.html listing in each output folder.
 * Concatenated PDFs (not generated here) live under transcripts/pdf/talks/.
 */

import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBrand, mergeBrand, themeDeclarations } from "./brand.mjs";

const BOM = "\uFEFF";
const TIME_PAT =
  /(\d{2}:\d{2}:\d{2})[.,](\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2})[.,](\d{3})/;

function parseArgs(argv) {
  const opts = { config: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") opts.config = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function usage() {
  console.log(`Usage: node scripts/generate-transcript-pages.js --config <index.json> [--dry-run]`);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateVideoId(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function srtTimeToSeconds(hms, ms) {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
}

function formatTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function parseSrt(raw) {
  const cues = [];
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const stripped = normalized.startsWith(BOM) ? normalized.slice(1) : normalized;
  const blocks = stripped.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    let timeLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (TIME_PAT.test(lines[i])) {
        timeLine = i;
        break;
      }
    }
    if (timeLine === -1) continue;
    const m = lines[timeLine].match(TIME_PAT);
    if (!m) continue;
    const startSec = srtTimeToSeconds(m[1], m[2]);
    const cueText = lines
      .slice(timeLine + 1)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cueText) continue;
    cues.push({
      start: startSec,
      end: srtTimeToSeconds(m[3], m[4]),
      startLabel: formatTime(startSec),
      text: cueText,
    });
  }
  return cues;
}

/** Normalize path separators; return posix-style relative path. */
function toPosix(p) {
  return p.split(sep).join("/");
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
  if (video?.subtitles && typeof video.subtitles === "object") {
    for (const value of Object.values(video.subtitles)) {
      if (typeof value === "string") return toPosix(value);
      if (value && typeof value === "object" && value.src) return toPosix(String(value.src));
    }
  }
  return null;
}

/**
 * Where the transcript HTML should live, relative to the gallery (config) directory.
 * With transcriptsDir: <transcriptsDir>/<folder holding the subtitle>.
 * Legacy: replace .../subtitles/ with .../transcripts/, else gallery-local transcripts/.
 */
function transcriptRelDir(subtitleRel, transcriptsDir) {
  const sub = toPosix(subtitleRel);
  if (transcriptsDir) {
    const section = sub.split("/").slice(-2, -1)[0];
    return section ? `${transcriptsDir}/${section}` : transcriptsDir;
  }
  if (sub.includes("/subtitles/")) {
    return sub.split("/subtitles/")[0] + "/transcripts";
  }
  return "transcripts";
}

function relativeHref(fromFile, toFile) {
  let rel = toPosix(relative(dirname(fromFile), toFile));
  if (!rel || rel === ".") rel = "./";
  else if (!rel.startsWith(".") && !rel.startsWith("/")) rel = "./" + rel;
  return rel;
}

function watchHref(fromFile, galleryIndexFile, videoId, startSec) {
  const galleryRel = relativeHref(fromFile, galleryIndexFile);
  // Point at the gallery directory (or index.html); hash opens the modal.
  const base = galleryRel.endsWith("index.html")
    ? galleryRel.replace(/index\.html$/, "") || "./"
    : galleryRel.endsWith("/")
      ? galleryRel
      : galleryRel + "/";
  const t = Math.floor(Math.max(0, startSec || 0));
  return t > 0 ? `${base}#${videoId}&t=${t}` : `${base}#${videoId}`;
}

function pageChrome(page, brand) {
  const theme = brand || {};
  return {
    siteTitle: page?.title || theme.titleFallback || "Videos",
    heading: page?.heading || page?.title || "Videos",
    footer: page?.footer || theme.footerFallback || "",
  };
}

function renderTalkPage({
  video,
  videoId,
  cues,
  chrome,
  galleryHref,
  listingHref,
  watchTopHref,
  themeCss,
}) {
  const title = video.title || videoId;
  const day = video.day || "";
  const duration = video.duration || "";
  const metaBits = [day, duration].filter(Boolean).join(" · ");

  const cueHtml = cues
    .map((cue) => {
      const t = Math.floor(cue.start);
      const href = t > 0 ? `${galleryHref}#${videoId}&t=${t}` : `${galleryHref}#${videoId}`;
      return `    <p class="cue" id="t${t}">
      <a class="cue-time" href="${escHtml(href)}">${escHtml(cue.startLabel)}</a>
      <span class="cue-text">${escHtml(cue.text)}</span>
    </p>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} — Transcript</title>
  <meta name="description" content="${escHtml(`Transcript: ${title}${metaBits ? ` (${metaBits})` : ""}`)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
  <style>
    :root {
${themeCss}
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Source Serif 4", Georgia, serif;
      background: var(--bg);
      color: var(--ink);
      padding: 24px 16px 48px;
      line-height: 1.55;
    }
    .wrap { max-width: 44rem; margin: 0 auto; }
    nav {
      font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
      font-size: 0.9rem;
      margin-bottom: 1.25rem;
    }
    nav a { color: var(--link); }
    nav a:hover { color: var(--ink); }
    header {
      position: relative;
      z-index: 0;
      overflow: hidden;
      background: var(--panel);
      border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
      border-radius: 10px;
      padding: 1.25rem 1.4rem;
      margin-bottom: 1.5rem;
    }
    header > * { position: relative; z-index: 1; }
    header::after {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      width: 360px;
      height: 208px;
      background-image: var(--waves);
      background-repeat: no-repeat;
      background-position: left top;
      background-size: 360px 208px;
      transform: rotate(180deg);
      pointer-events: none;
      z-index: 0;
      opacity: 0.55;
    }
    h1 {
      font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.15;
      font-size: clamp(1.45rem, 3vw, 2rem);
      margin: 0 0 0.4rem;
    }
    .meta {
      font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
      color: var(--muted);
      font-size: 0.95rem;
      margin: 0 0 1rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
    }
    .actions a {
      font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
      font-weight: 600;
      font-size: 0.9rem;
      text-decoration: none;
      color: var(--ink);
      background: rgba(152, 108, 50, 0.18);
      border: 1px solid rgba(152, 108, 50, 0.35);
      border-radius: 8px;
      padding: 0.55rem 0.9rem;
    }
    .actions a:hover { background: rgba(152, 108, 50, 0.32); }
    .actions a.primary {
      background: var(--ink);
      color: #fff;
      border-color: var(--ink);
    }
    .actions a.primary:hover { background: #0a1270; }
    article {
      background: var(--panel);
      border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
      border-radius: 10px;
      padding: 1rem 1.25rem 1.5rem;
    }
    .cue {
      display: grid;
      grid-template-columns: 4.5rem 1fr;
      gap: 0.65rem 0.85rem;
      margin: 0;
      padding: 0.45rem 0;
      border-bottom: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
    }
    .cue:last-child { border-bottom: none; }
    .cue-time {
      font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--accent);
      text-decoration: none;
      padding-top: 0.15rem;
    }
    .cue-time:hover { color: var(--ink); text-decoration: underline; }
    .cue-text { font-size: 1.05rem; }
    footer {
      position: relative;
      z-index: 0;
      font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
      margin-top: 2rem;
      padding-bottom: 7.5rem;
      font-size: 0.85rem;
      color: var(--muted);
      text-align: center;
    }
    footer::after {
      content: "";
      position: absolute;
      right: 0;
      bottom: 0;
      width: 220px;
      height: 126px;
      background: var(--waves) right bottom / 220px 126px no-repeat;
      pointer-events: none;
      z-index: -1;
      opacity: 0.85;
    }
    @media (max-width: 768px) {
      header::after {
        width: 220px;
        height: 126px;
        background-size: 220px 126px;
      }
      footer { padding-bottom: 5.5rem; }
      footer::after {
        width: 160px;
        height: 92px;
        background-size: 160px 92px;
      }
    }
    @media (max-width: 520px) {
      .cue { grid-template-columns: 1fr; gap: 0.2rem; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <nav>
      <a href="${escHtml(galleryHref)}">${escHtml(chrome.heading)}</a>
      · <a href="${escHtml(listingHref)}">All transcripts</a>
    </nav>
    <header>
      <h1>${escHtml(title)}</h1>
      ${metaBits ? `<p class="meta">${escHtml(metaBits)}</p>` : ""}
      <div class="actions">
        <a class="primary" href="${escHtml(watchTopHref)}">Watch video</a>
        <a href="${escHtml(listingHref)}">All transcripts</a>
        <a href="${escHtml(galleryHref)}">Video gallery</a>
      </div>
    </header>
    <article>
${cueHtml || "      <p>No subtitle cues found.</p>"}
    </article>
    <footer>${escHtml(chrome.footer)}</footer>
  </div>
</body>
</html>
`;
}

function renderListingPage({ chrome, galleryHref, entries, dayOrder, themeCss }) {
  const byDay = new Map();
  for (const e of entries) {
    const day = e.day || "Talks";
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }

  const orderedDays =
    dayOrder && dayOrder.length
      ? [...dayOrder.filter((d) => byDay.has(d)), ...[...byDay.keys()].filter((d) => !dayOrder.includes(d))]
      : [...byDay.keys()];

  const sections = orderedDays
    .map((day) => {
      const items = byDay
        .get(day)
        .map(
          (e) =>
            `        <li><a href="${escHtml(e.fileName)}">${escHtml(e.title)}</a>${
              e.duration ? ` <span class="dur">${escHtml(e.duration)}</span>` : ""
            }</li>`
        )
        .join("\n");
      return `      <section>
        <h2>${escHtml(day)}</h2>
        <ul>
${items}
        </ul>
      </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcripts — ${escHtml(chrome.heading)}</title>
  <meta name="description" content="${escHtml(`Searchable transcripts for ${chrome.heading}`)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
  <style>
    :root {
${themeCss}
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Source Serif 4", Georgia, serif;
      background: var(--bg);
      color: var(--ink);
      padding: 24px 16px 48px;
      line-height: 1.5;
    }
    .wrap { max-width: 40rem; margin: 0 auto; }
    nav, h1, h2, .dur {
      font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
    }
    nav { font-size: 0.9rem; margin-bottom: 1rem; }
    nav a, a { color: var(--link); }
    nav a:hover { color: var(--ink); }
    header {
      position: relative;
      z-index: 0;
      overflow: hidden;
      background: var(--panel);
      border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
      border-radius: 10px;
      padding: 1.25rem 1.4rem;
      margin-bottom: 1.5rem;
    }
    header > * { position: relative; z-index: 1; }
    header::after {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      width: 360px;
      height: 208px;
      background-image: var(--waves);
      background-repeat: no-repeat;
      background-position: left top;
      background-size: 360px 208px;
      transform: rotate(180deg);
      pointer-events: none;
      z-index: 0;
      opacity: 0.55;
    }
    h1 {
      font-weight: 800;
      letter-spacing: -0.03em;
      font-size: clamp(1.5rem, 3vw, 2rem);
      margin: 0 0 0.35rem;
    }
    .lead { color: var(--muted); margin: 0; }
    section {
      background: var(--panel);
      border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
    }
    h2 { font-size: 1.05rem; margin: 0 0 0.6rem; }
    ul { margin: 0; padding-left: 1.15rem; }
    li { margin: 0.35rem 0; }
    .dur { color: var(--muted); font-size: 0.85rem; font-weight: 600; }
    footer {
      position: relative;
      z-index: 0;
      font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
      margin-top: 2rem;
      padding-bottom: 7.5rem;
      font-size: 0.85rem;
      color: var(--muted);
      text-align: center;
    }
    footer::after {
      content: "";
      position: absolute;
      right: 0;
      bottom: 0;
      width: 220px;
      height: 126px;
      background: var(--waves) right bottom / 220px 126px no-repeat;
      pointer-events: none;
      z-index: -1;
      opacity: 0.85;
    }
    @media (max-width: 768px) {
      header::after {
        width: 220px;
        height: 126px;
        background-size: 220px 126px;
      }
      footer { padding-bottom: 5.5rem; }
      footer::after {
        width: 160px;
        height: 92px;
        background-size: 160px 92px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <nav><a href="${escHtml(galleryHref)}">${escHtml(chrome.heading)}</a></nav>
    <header>
      <h1>Transcripts</h1>
      <p class="lead">Full text of each talk. Open a transcript, then jump to the matching moment in the video.</p>
    </header>
${sections}
    <footer>${escHtml(chrome.footer)}</footer>
  </div>
</body>
</html>
`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.config) {
    usage();
    process.exit(opts.help ? 0 : 1);
  }

  const configPath = resolve(opts.config);
  if (!existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }

  const galleryDir = dirname(configPath);
  const galleryIndexFile = join(galleryDir, "index.html");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const brand = mergeBrand(loadBrand(), config.brand);
  const themeCss = themeDeclarations(
    brand,
    "      ",
    ["ink", "muted", "bg", "panel", "accent", "link"]
  );
  const chrome = pageChrome(config.page, brand);
  const videos = Array.isArray(config.videos) ? config.videos : [];
  const dayOrder = Array.isArray(config.days) ? config.days : [];
  const transcriptsDir =
    typeof config.transcriptsDir === "string" ? config.transcriptsDir.replace(/\/+$/, "") : "";

  /** @type {Map<string, { absDir: string, entries: object[] }>} */
  const listings = new Map();
  let written = 0;
  let skipped = 0;

  for (const video of videos) {
    const subtitleRel = primarySubtitlePath(video);
    if (!subtitleRel) {
      skipped++;
      continue;
    }

    const videoId = generateVideoId(video.title);
    if (!videoId) {
      console.warn(`Skip (empty id): ${video.title}`);
      skipped++;
      continue;
    }

    const srtAbs = join(galleryDir, ...subtitleRel.split("/"));
    if (!existsSync(srtAbs)) {
      console.warn(`Missing SRT, skip: ${srtAbs}`);
      skipped++;
      continue;
    }

    const outDirRel = transcriptRelDir(subtitleRel, transcriptsDir);
    const outDirAbs = join(galleryDir, ...outDirRel.split("/"));
    const fileName = `${videoId}.html`;
    const outFileAbs = join(outDirAbs, fileName);

    const raw = await readFile(srtAbs, "utf8");
    const cues = parseSrt(raw);

    const galleryHref = relativeHref(outFileAbs, galleryIndexFile).replace(/index\.html$/, "") || "./";
    const listingHref = "./";
    const watchTopHref = watchHref(outFileAbs, galleryIndexFile, videoId, 0);

    const html = renderTalkPage({
      video,
      videoId,
      cues,
      chrome,
      galleryHref,
      listingHref,
      watchTopHref,
      themeCss,
    });

    if (!listings.has(outDirRel)) {
      listings.set(outDirRel, { absDir: outDirAbs, entries: [] });
    }
    listings.get(outDirRel).entries.push({
      title: video.title,
      day: video.day,
      duration: video.duration,
      fileName,
      videoId,
      order: video.order || 0,
    });

    console.log(`${opts.dryRun ? "[dry-run] " : ""}write ${toPosix(relative(galleryDir, outFileAbs))} (${cues.length} cues)`);

    if (!opts.dryRun) {
      await mkdir(outDirAbs, { recursive: true });
      await writeFile(outFileAbs, html, "utf8");
    }
    written++;
  }

  for (const [outDirRel, { absDir, entries }] of listings) {
    entries.sort((a, b) => {
      if (a.day !== b.day) return String(a.day).localeCompare(String(b.day));
      return (a.order || 0) - (b.order || 0);
    });

    // Remove stale HTML pages not in this generation (keep only current set + index)
    if (!opts.dryRun && existsSync(absDir)) {
      const keep = new Set(entries.map((e) => e.fileName));
      keep.add("index.html");
      for (const name of await readdir(absDir)) {
        if (!name.endsWith(".html")) continue;
        if (!keep.has(name)) {
          await rm(join(absDir, name));
          console.log(`removed stale ${toPosix(join(outDirRel, name))}`);
        }
      }
    }

    const indexAbs = join(absDir, "index.html");
    const galleryHref = relativeHref(indexAbs, galleryIndexFile).replace(/index\.html$/, "") || "./";
    const listingHtml = renderListingPage({
      chrome,
      galleryHref,
      entries,
      dayOrder,
      themeCss,
    });
    console.log(`${opts.dryRun ? "[dry-run] " : ""}write ${toPosix(join(outDirRel, "index.html"))} (${entries.length} talks)`);
    if (!opts.dryRun) {
      await mkdir(absDir, { recursive: true });
      await writeFile(indexAbs, listingHtml, "utf8");
    }
  }

  console.log(`Done. ${written} transcript page(s), ${skipped} skipped, ${listings.size} listing(s).`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
