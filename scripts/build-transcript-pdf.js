#!/usr/bin/env node
/**
 * Build a designed PDF of transcripts from the `.srt` files in one event folder.
 *
 * Pipeline:
 *   1. Resolve a gallery directory (confs/<ORG>/<YEAR>/<month> or vids/<YEAR>/<month>)
 *   2. Recursively collect every `*.srt` file in that directory
 *   3. Parse SRT cues and group them into readable paragraphs.
 *      A sibling summary (`foo.srt` → `foo.md`) is included when present.
 *   4. Render an HTML document with a cover page, table of contents,
 *      and one chapter per talk, using the keri.foundation look:
 *      pale ground, cream header, gold marks, and waves-kim-1.png
 *   5. Drive the locally installed Google Chrome (via puppeteer-core)
 *      to print the HTML to a paged PDF
 *
 * Usage:
 *   node scripts/build-transcript-pdf.js KERI/2026/apr [--open]
 *   node scripts/build-transcript-pdf.js SEDI/2025/nov [--open]
 *   node scripts/build-transcript-pdf.js vids/2026/jul [--open]
 *
 * Output (under the gallery):
 *   transcripts/pdf/talks/{slug-with-dashes}-Transcripts.pdf
 *   If index.json nav or transcriptLinks already links a transcripts/pdf/*.pdf,
 *   that path is used.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { readSummaryParagraphs } from "./talk-summary.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFS_DIR = join(ROOT, "confs");
const VIDS_DIR = join(ROOT, "vids");

const BOM = "\uFEFF";
const TIMESTAMP_RE = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/;
const CLIP_NAME_RE = /^(\d{2})-(\d{2})-(\d{2})--(\d{2})-(\d{2})-(\d{2})-(.+)$/;
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  const positional = argv.filter((a) => !a.startsWith("-"));
  return {
    slug: positional[0] ?? "",
    openAfter: flags.has("--open"),
    dryRun: flags.has("--dry-run"),
  };
}

function usage() {
  console.error("Usage: node scripts/build-transcript-pdf.js <gallery-id> [--open] [--dry-run]");
  console.error("Examples:");
  console.error("  node scripts/build-transcript-pdf.js KERI/2026/apr");
  console.error("  node scripts/build-transcript-pdf.js vids/2026/jul");
}

// ─── Event directory ────────────────────────────────────────────────────────

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

async function findEventDir(slug) {
  const normalized = slug.replace(/^\/+|\/+$/g, "");
  const candidates = [
    resolve(slug),
    resolve(ROOT, normalized),
    join(CONFS_DIR, normalized),
    normalized.startsWith("vids/") ? join(ROOT, normalized) : join(VIDS_DIR, normalized),
  ];
  for (const candidate of candidates) {
    if (isDirectory(candidate)) return candidate;
  }

  throw new Error(
    `Could not find a gallery directory "${slug}". Examples: KERI/2026/apr (under ${CONFS_DIR}) or vids/2026/jul.`
  );
}

// ─── SRT collection ─────────────────────────────────────────────────────────

async function collectSrtFiles(eventDir) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (/\.srt$/i.test(entry.name) && !/\.[a-z]{2,3}\.srt$/i.test(entry.name)) {
        // Skip language tracks such as foo.nl.srt; English is foo.srt.
        files.push(path);
      }
    }
  }

  await walk(eventDir);
  return files;
}

// ─── Event / PROGRAM.md metadata ────────────────────────────────────────────

const MONTHS = {
  jan: "January", feb: "February", mar: "March", apr: "April",
  may: "May", jun: "June", jul: "July", aug: "August",
  sep: "September", oct: "October", nov: "November", dec: "December",
};

function eventFromSlug(slug) {
  const conf = slug.match(/^([A-Za-z][A-Za-z0-9_-]*)\/(\d{4})\/([a-z]{3})$/i);
  if (conf) {
    const org = conf[1];
    const year = conf[2];
    const month = MONTHS[conf[3].toLowerCase()] || conf[3];
    return { slug, year, shortName: org, name: `${org} ${month} ${year}`, date: "" };
  }
  const vids = slug.match(/^vids\/(\d{4})\/([a-z]{3})$/i);
  if (vids) {
    const year = vids[1];
    const month = MONTHS[vids[2].toLowerCase()] || vids[2];
    return {
      slug,
      year,
      shortName: `${month} ${year} Videos`,
      name: `${month} ${year} Videos`,
      date: "",
    };
  }
  const match = slug.match(/^(\d{4})(?:-(\d{2}))?-([A-Za-z0-9][A-Za-z0-9-]*)$/);
  if (!match) {
    return { slug, year: "", shortName: slug, name: slug, date: "" };
  }
  const year = match[1];
  const shortName = match[3].replace(/-/g, " ");
  return { slug, year, shortName, name: `${shortName} ${year}`, date: "" };
}

function splitSpeakerAffiliation(speakerCell) {
  if (speakerCell.includes(";")) {
    return { speaker: speakerCell, affiliation: "" };
  }

  let depth = 0;
  let comma = -1;
  for (let i = 0; i < speakerCell.length; i++) {
    const ch = speakerCell[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      comma = i;
      break;
    }
  }

  let speaker = speakerCell;
  let affiliation = "";
  if (comma !== -1) {
    speaker = speakerCell.slice(0, comma).trim();
    affiliation = speakerCell.slice(comma + 1).trim();
  } else {
    const paren = speakerCell.match(/^(.+?)\s*\((.+)\)\s*$/);
    if (paren) {
      speaker = paren[1].trim();
      affiliation = paren[2].trim();
    }
  }
  return { speaker, affiliation };
}

function parseProgram(text) {
  const eventName = text.match(/\*\*Event:\*\*\s*(.+)/)?.[1]?.trim() ?? "";
  const date = text.match(/\*\*Date:\*\*\s*(.+)/)?.[1]?.trim() ?? "";
  const byStem = new Map();

  for (const line of text.split(/\r?\n/)) {
    const row = line.match(/\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/);
    if (!row) continue;
    const stem = basename(row[1]).replace(/\.(mp4|srt)$/i, "");
    const speakerCell = row[2].trim();
    if (!stem || !speakerCell || speakerCell === "Speaker") continue;

    const { speaker, affiliation } = splitSpeakerAffiliation(speakerCell);
    byStem.set(stem, { speaker, affiliation, speakerCell });
  }

  return { eventName, date, byStem };
}

async function loadEventMeta(eventDir, slug) {
  const event = eventFromSlug(slug);
  const programPath = join(eventDir, "PROGRAM.md");
  if (existsSync(programPath)) {
    const program = parseProgram(await readFile(programPath, "utf8"));
    if (program.eventName) event.name = program.eventName;
    if (program.date) event.date = program.date;

    const acronym = program.eventName.match(/\(([A-Z][A-Z0-9]+)\)/)?.[1];
    if (acronym) {
      const after = program.eventName.replace(/.*\)\s*/, "").trim();
      event.shortName = after ? `${acronym} ${after}` : acronym;
    }

    return { ...event, byStem: program.byStem };
  }

  const indexPath = join(eventDir, "index.json");
  if (existsSync(indexPath)) {
    try {
      const config = JSON.parse(await readFile(indexPath, "utf8"));
      const heading = config?.page?.heading || config?.page?.title;
      if (typeof heading === "string" && heading.trim()) {
        event.name = heading.trim();
        event.shortName = heading.trim();
      }
    } catch {
      // ignore malformed index.json; slug-derived names remain
    }
  }

  return { ...event, byStem: new Map() };
}

async function resolvePdfOutputPath(eventDir, slug) {
  const defaultRel = join(
    "transcripts",
    "pdf",
    "talks",
    `${slug.replace(/[\\/]+/g, "-")}-Transcripts.pdf`
  );
  const indexPath = join(eventDir, "index.json");
  if (existsSync(indexPath)) {
    try {
      const config = JSON.parse(await readFile(indexPath, "utf8"));
      const candidates = [
        ...(Array.isArray(config?.page?.nav) ? config.page.nav : []),
        ...(Array.isArray(config?.page?.transcriptLinks) ? config.page.transcriptLinks : []),
      ];
      for (const item of candidates) {
        const href = item?.href;
        if (
          typeof href === "string" &&
          href.includes("transcripts/pdf/") &&
          href.endsWith(".pdf") &&
          !href.startsWith("/") &&
          !/^https?:\/\//i.test(href)
        ) {
          return join(eventDir, href);
        }
      }
    } catch {
      // fall through to default
    }
  }
  return join(eventDir, defaultRel);
}

function coverTitleParts(event) {
  const acronym = event.name.match(/\(([A-Z][A-Z0-9]+)\)/)?.[1];
  let parts;
  if (acronym) {
    const after = event.name.replace(/.*\)\s*/, "").trim();
    parts = { line1: acronym, line2: after || "Transcripts", accent: event.year };
  } else {
    const words = (event.shortName || event.name).split(/\s+/).filter(Boolean);
    parts = words.length >= 2
      ? { line1: words[0], line2: words.slice(1).join(" "), accent: event.year }
      : { line1: event.shortName || event.slug, line2: "Transcripts", accent: event.year };
  }
  const shown = `${parts.line1} ${parts.line2}`;
  if (parts.accent && shown.includes(parts.accent)) parts.accent = "";
  return parts;
}

// ─── SRT parsing ────────────────────────────────────────────────────────────

function parseSrt(text) {
  const stripped = text.startsWith(BOM) ? text.slice(1) : text;
  return stripped
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/))
    .map((lines) => {
      const tsIdx = lines.findIndex((l) => TIMESTAMP_RE.test(l));
      if (tsIdx === -1) return null;
      const match = lines[tsIdx].match(TIMESTAMP_RE);
      const content = lines
        .slice(tsIdx + 1)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        start: toSeconds(match[1]),
        end: toSeconds(match[2]),
        text: content,
      };
    })
    .filter(Boolean);
}

function toSeconds(ts) {
  const [h, m, rest] = ts.split(":");
  const [s, ms] = rest.split(",");
  return +h * 3600 + +m * 60 + +s + +ms / 1000;
}

function formatTimestamp(seconds) {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── Filename → metadata ────────────────────────────────────────────────────

const SEP = "｜"; // fullwidth vertical line used in conference filenames

function stripSrtExtension(filename) {
  return filename.replace(/\.srt$/i, "");
}

function sessionFromPath(filePath, eventDir) {
  const rel = relative(eventDir, dirname(filePath));
  const parts = rel.split(sep).filter((p) => p && p !== "." && p !== "speakers");
  if (!parts.length) return "";
  const sessionDir = parts[0];
  const known = sessionDir.match(/(Morning[- ]Session|Lunch[- ]Panel|Afternoon[- ]Session)$/i);
  if (known) return known[1].replace(/-/g, " ");
  return sessionDir.replace(/-/g, " ");
}

function sessionRank(session) {
  const value = (session || "").toLowerCase();
  if (value.includes("morning")) return 0;
  if (value.includes("lunch")) return 1;
  if (value.includes("afternoon")) return 2;
  return 10;
}

function parseConferenceFilename(filename) {
  const base = stripSrtExtension(filename);
  let core = base;
  const tagRe = /\s*[｜|]\s*KERI\s*Conf(?:erence)?\s*\d{4}\s*$/i;
  const tagMatch = base.match(tagRe);
  if (tagMatch) core = base.slice(0, tagMatch.index);

  const parts = core.split(SEP).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { speaker: parts[0], title: parts.slice(1).join(` ${SEP} `).trim() };
  }
  return { speaker: "", title: core.trim() };
}

function parseClipFilename(filename) {
  const base = stripSrtExtension(filename);
  const match = base.match(CLIP_NAME_RE);
  if (!match) return null;
  return {
    startKey: `${match[1]}${match[2]}${match[3]}`,
    speaker: match[7].replace(/-/g, " ").trim(),
  };
}

function parseTalkMeta(filePath, eventDir, byStem) {
  const filename = basename(filePath);
  const stem = stripSrtExtension(filename);
  const session = sessionFromPath(filePath, eventDir);
  const clip = parseClipFilename(filename);
  const program = byStem.get(stem);

  if (clip) {
    let speaker = clip.speaker;
    let affiliation = "";
    if (program) {
      if (program.speaker.length <= 40) speaker = program.speaker;
      affiliation =
        program.affiliation ||
        (program.speaker.length > 40 ? program.speakerCell : "");
    }
    return {
      speaker,
      title: session || speaker,
      affiliation,
      session,
      startKey: clip.startKey,
      style: "clip",
    };
  }

  const conference = parseConferenceFilename(filename);
  return {
    speaker: conference.speaker,
    title: conference.title,
    affiliation: "",
    session,
    startKey: "",
    style: "conference",
  };
}

function sortTalks(talks) {
  return talks.sort((a, b) => {
    const session = sessionRank(a.session) - sessionRank(b.session);
    if (session) return session;
    if (a.startKey && b.startKey && a.startKey !== b.startKey) {
      return a.startKey.localeCompare(b.startKey);
    }
    return a.filename.localeCompare(b.filename, "en", { sensitivity: "base" });
  });
}

// ─── Cue → paragraph grouping ───────────────────────────────────────────────

const SENTENCE_END = /[.!?]["'”’)\]]?$/;
const SENTENCE_BOUNDARY = /[.!?]["'”’)\]]?(?:\s|$)/g;
const FILLER = /^\s*[\[(](?:inaudible|applause|laughter|music|silence|indistinct|cross ?talk)[^\])]*[\])]\s*$/i;

function countSentences(text) {
  const matches = text.match(SENTENCE_BOUNDARY);
  return matches ? matches.length : 0;
}

function groupIntoParagraphs(cues) {
  const cleaned = cues
    .filter((c, i) => !(i === 0 && c.text.length > 0 && c.end - c.start < 4))
    .filter((c) => c.text.length > 0)
    .filter((c) => !FILLER.test(c.text));

  const paragraphs = [];
  let current = null;

  const flush = () => {
    if (current && current.text.trim()) {
      current.text = current.text.replace(/\s+/g, " ").trim();
      paragraphs.push(current);
    }
    current = null;
  };

  for (const cue of cleaned) {
    if (!current) {
      current = { start: cue.start, end: cue.end, text: cue.text, sentences: countSentences(cue.text) };
      continue;
    }

    const gap = cue.start - current.end;
    current.end = cue.end;

    const endsSentence = SENTENCE_END.test(current.text);
    const sentenceCount = current.sentences;
    const longEnough = current.text.length >= 220;

    if ((endsSentence && sentenceCount >= 2 && longEnough) || gap > 12) {
      flush();
      current = { start: cue.start, end: cue.end, text: cue.text, sentences: countSentences(cue.text) };
    } else {
      const needsSpace = !current.text.endsWith(" ") && !cue.text.startsWith(" ");
      current.text += (needsSpace ? " " : "") + cue.text;
      current.sentences += countSentences(cue.text);
    }
  }
  flush();

  return paragraphs;
}

// ─── HTML escaping ──────────────────────────────────────────────────────────

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const romanNumerals = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
  "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII", "XXIX", "XXX",
];
function toRoman(n) {
  return romanNumerals[n - 1] ?? String(n);
}

function chapterHeading(talk) {
  if (talk.style === "conference" && talk.title) {
    return { title: talk.title, speaker: talk.speaker };
  }
  return {
    title: talk.speaker || talk.title,
    speaker: talk.affiliation || talk.session,
  };
}

function chapterMeta(talk, event) {
  const parts = [event.shortName || event.name];
  if (talk.session) parts.push(talk.session);
  parts.push(formatTimestamp(talk.duration));
  return parts.filter(Boolean).join(" · ");
}

/** Sibling `foo.md` of an `.srt`, or [] when that file is missing or empty. */
function summaryForSrt(srtPath) {
  return readSummaryParagraphs(srtPath.replace(/\.srt$/i, ".md"));
}

function summaryHtml(paragraphs) {
  if (!paragraphs?.length) return "";
  const body = paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("\n");
  return `
        <div class="summary">
          <h2>Summary</h2>
          ${body}
        </div>`;
}

// ─── HTML assembly ──────────────────────────────────────────────────────────

// Same files the foundation theme paints on the header, titles, and asides.
const BRAND = {
  waves: "custom/img/waves-kim-1.png",
  mark: "custom/img/logo-horizontal-line.png",
  logo: "custom/img/logo-keri-foundation-color-transparent.png",
  corner: "custom/img/logo-F.png",
};

function markRow(label, labelClass) {
  return `
        <div class="mark-row">
          <img class="brush" src="${BRAND.mark}" alt="">
          <div class="${labelClass}">${label}</div>
          <img class="brush flip" src="${BRAND.mark}" alt="">
        </div>`;
}

function buildHtml(talks, generatedOn, event) {
  const cover = coverTitleParts(event);
  const coverSub = event.date
    ? `A complete transcript of every recorded talk from the ${event.name} — ${event.date}.`
    : `A complete transcript of every recorded talk from the ${event.name}.`;

  const talkRows = talks
    .map((t, i) => {
      const num = String(i + 1).padStart(2, "0");
      const speaker = t.speaker || t.title;
      const tocTitle = t.style === "conference" ? t.title : t.session || t.title;
      const distinct = tocTitle && tocTitle !== speaker;
      return `
        <a class="toc-row" href="#talk-${i}">
          <span class="toc-num">${num}</span>
          <span class="${distinct ? "toc-speaker" : "toc-speaker toc-span"}">${esc(speaker)}</span>
          ${distinct ? `<span class="toc-title">${esc(tocTitle)}</span>` : ""}
          <span class="toc-dots"></span>
          <span class="toc-page-no">${formatTimestamp(t.duration)}</span>
        </a>`;
    })
    .join("");

  const chapters = talks
    .map((t, i) => {
      const paragraphs = t.paragraphs
        .map((p) => `<p>${esc(p.text)}</p>`)
        .join("\n");
      const heading = chapterHeading(t);

      return `
      <section class="chapter">
        <div class="chapter-opener">
          <img class="hero-wave hero-wave-tl" src="${BRAND.waves}" alt="">
          <img class="hero-wave hero-wave-br" src="${BRAND.waves}" alt="">
          <div class="chapter-opener-inner">
            ${markRow(`Talk ${toRoman(i + 1)}`, "chapter-mark")}
            <h1 class="chapter-title">${esc(heading.title)}</h1>
            ${
              heading.speaker && heading.speaker !== heading.title
                ? `<div class="chapter-speaker">${esc(heading.speaker)}</div>`
                : ""
            }
            <div class="chapter-meta">${esc(chapterMeta(t, event))}</div>
          </div>
        </div>
        ${summaryHtml(t.summary)}
        <div class="transcript" id="talk-${i}">
          ${paragraphs}
        </div>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(event.name)} — Transcripts</title>
<style>
  /* keri.foundation: pale ground, cream header (#e8e6de), gold #986c32, sage #61783e.
     Waves and the gold corner mark are the theme images. */
  @page {
    size: A4;
    margin: 0 0 12mm 0;
    @bottom-left {
      content: "KERI Foundation";
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #61783e;
      margin-left: 14mm;
    }
    @bottom-right {
      content: counter(page);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 8pt;
      font-weight: 700;
      color: #986c32;
      margin-right: 14mm;
    }
  }
  @page cover { @bottom-left { content: none; } @bottom-right { content: none; } }
  @page opener { @bottom-left { content: none; } @bottom-right { content: none; } }
  @page toc { @bottom-right { content: counter(page); } }

  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif;
    color: #1f2937;
    font-size: 11pt;
    line-height: 1.5;
    letter-spacing: -0.006em;
    text-rendering: optimizeLegibility;
    background: linear-gradient(to right, #f3f9f9, #f2f7f9);
  }

  /* Waves repeat the foundation theme: rotated under the header (header::after)
     and sitting in the bottom-right corner (aside). */
  .wave-tl, .wave-br { position: fixed; pointer-events: none; z-index: 0; }
  .wave-tl {
    left: 0;
    top: 16mm;
    width: 110mm;
    height: 63mm;
    object-fit: fill;
    transform: rotate(180deg);
    opacity: 0.55;
  }
  .wave-br {
    right: 0;
    bottom: 10mm;
    width: 92mm;
    height: 53mm;
    object-fit: fill;
    opacity: 0.8;
  }
  table.sheet { width: 100%; border-collapse: collapse; }
  table.sheet td { padding: 0; vertical-align: top; }
  thead { display: table-header-group; }
  .running-head {
    position: relative;
    height: 16mm;
    box-sizing: border-box;
    padding: 2mm 18mm 2mm 6mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6mm;
    background: #e8e6de;
    z-index: 5;
  }
  .running-head .logo { height: 12mm; width: auto; }
  .corner-f {
    position: absolute;
    right: 4mm;
    bottom: 1mm;
    width: 8mm;
    height: 7mm;
    object-fit: contain;
    transform: rotate(180deg);
  }
  .running-event {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #111827;
    text-align: right;
    max-width: 115mm;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mark-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4mm;
  }
  .brush { width: 12mm; height: 4.5mm; object-fit: contain; }
  .brush.flip { transform: rotate(180deg); }
  .cover-eyebrow, .chapter-mark, .toc-heading {
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #986c32;
  }

  /* ─── Cover ─── */
  .hero-wave { position: absolute; z-index: 0; pointer-events: none; }
  .hero-wave-tl {
    left: 0;
    top: 14mm;
    width: 125mm;
    height: 72mm;
    object-fit: fill;
    transform: rotate(180deg);
    opacity: 0.8;
  }
  .hero-wave-br {
    right: 0;
    bottom: 0;
    width: 120mm;
    height: 69mm;
    object-fit: fill;
    opacity: 0.95;
  }
  .cover {
    page: cover;
    page-break-after: always;
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: 269mm;
    margin: 0;
    background: linear-gradient(to right, #f3f9f9, #f2f7f9);
    color: #111827;
    overflow: hidden;
  }
  .cover-inner {
    position: relative;
    z-index: 1;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 14mm;
    padding: 28mm 18mm 26mm 18mm;
  }
  .cover-eyebrow { font-size: 12pt; }
  .cover-title {
    font-weight: 700;
    font-size: 40pt;
    line-height: 1.05;
    letter-spacing: -0.03em;
    color: #111827;
    margin: 5mm 0 0;
    max-width: 150mm;
  }
  .cover-title .accent { color: #986c32; font-weight: 700; }
  .cover-sub {
    margin: 6mm 0 0;
    font-size: 13pt;
    color: #4b5563;
    max-width: 125mm;
    line-height: 1.4;
  }
  .cover-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    max-width: 125mm;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #61783e;
  }
  .cover-bottom .stats { display: flex; gap: 12mm; }
  .cover-bottom .stat-num {
    display: block;
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: -0.03em;
    text-transform: none;
    color: #111827;
    margin-bottom: 1mm;
  }
  .cover-date {
    letter-spacing: 0.04em;
    text-transform: none;
    font-weight: 600;
    color: #4b5563;
    padding-bottom: 1mm;
  }

  /* ─── Table of contents ─── */
  .toc-page { page: toc; page-break-after: always; position: relative; z-index: 1; padding: 5mm 16mm 0; }
  .toc-heading { font-size: 14pt; margin: 0; }
  .toc-page .mark-row { justify-content: flex-start; margin: 0 0 4mm; }
  .toc-lede {
    color: #4b5563;
    margin: 0 0 8mm;
    font-size: 11pt;
    max-width: 150mm;
  }
  .toc-list { display: flex; flex-direction: column; }
  .toc-row {
    display: grid;
    grid-template-columns: 12mm minmax(0, 1.05fr) minmax(0, 1.5fr) auto;
    align-items: baseline;
    gap: 3mm;
    padding: 2.4mm 0;
    border-bottom: 0.4pt solid #d1d5db;
    text-decoration: none;
    color: inherit;
    break-inside: avoid;
  }
  .toc-num {
    font-size: 9pt;
    font-weight: 700;
    color: #986c32;
  }
  .toc-speaker {
    font-weight: 700;
    font-size: 10.5pt;
    color: #111827;
  }
  .toc-span { grid-column: 2 / 4; }
  .toc-title {
    color: #4b5563;
    font-size: 10.5pt;
  }
  .toc-dots { display: none; }
  .toc-page-no {
    font-size: 9pt;
    font-weight: 700;
    color: #61783e;
    text-align: right;
    white-space: nowrap;
  }

  /* ─── Chapter opener ─── */
  .chapter { page-break-before: always; }
  .chapter-opener {
    page: opener;
    page-break-after: always;
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: 269mm;
    margin: 0;
    background: linear-gradient(to right, #f3f9f9, #f2f7f9);
    color: #111827;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .chapter-opener-inner {
    position: relative;
    z-index: 1;
    text-align: center;
    padding: 20mm 18mm 28mm;
    max-width: 170mm;
  }
  .chapter-mark { font-size: 11pt; }
  .chapter-title {
    font-weight: 700;
    font-size: 26pt;
    line-height: 1.15;
    letter-spacing: -0.03em;
    color: #111827;
    margin: 8mm auto 6mm;
  }
  .chapter-speaker {
    font-size: 14pt;
    font-weight: 700;
    color: #61783e;
    margin-bottom: 4mm;
  }
  .chapter-meta {
    font-size: 10pt;
    color: #4b5563;
  }

  /* ─── Optional summary, then the transcript body ─── */
  .summary {
    position: relative;
    z-index: 1;
    margin: 5mm 16mm 7mm;
    padding: 4mm 5mm 1.5mm;
    background: #e8e6de;
    border-radius: 2mm;
    border-left: 1.4mm solid #986c32;
  }
  .summary h2 {
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #986c32;
    margin: 0 0 2.5mm;
  }
  .summary p {
    margin: 0 0 2.4mm;
    orphans: 3;
    widows: 3;
  }
  .transcript { position: relative; z-index: 1; padding: 0 16mm; }
  .transcript p {
    margin: 0 0 2.6mm;
    orphans: 3;
    widows: 3;
  }
  .transcript p:first-child::first-letter {
    font-size: 26pt;
    font-weight: 700;
    float: left;
    line-height: 0.85;
    padding: 1mm 1.6mm 0 0;
    color: #986c32;
  }
</style>
</head>
<body>

  <img class="wave-tl" src="${BRAND.waves}" alt="">
  <img class="wave-br" src="${BRAND.waves}" alt="">

  <table class="sheet">
    <thead>
      <tr>
        <td>
          <header class="running-head">
            <img class="logo" src="${BRAND.logo}" alt="KERI Foundation">
            <div class="running-event">${esc(event.name)}</div>
            <img class="corner-f" src="${BRAND.corner}" alt="">
          </header>
        </td>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>

  <div class="cover">
    <img class="hero-wave hero-wave-tl" src="${BRAND.waves}" alt="">
    <img class="hero-wave hero-wave-br" src="${BRAND.waves}" alt="">
    <div class="cover-inner">
      <div class="cover-center">
        ${markRow("Transcripts", "cover-eyebrow")}
        <h1 class="cover-title">${esc(cover.line1)}<br>${esc(cover.line2)}${
          cover.accent ? `<br><span class="accent">${esc(cover.accent)}</span>` : ""
        }</h1>
        <p class="cover-sub">${esc(coverSub)}</p>
      </div>
      <div class="cover-bottom">
        <div class="stats">
          <div><span class="stat-num">${talks.length}</span>Talks</div>
          <div><span class="stat-num">${formatTimestamp(
            talks.reduce((a, t) => a + t.duration, 0)
          )}</span>Runtime</div>
        </div>
        <div class="cover-date">${esc(generatedOn)}</div>
      </div>
    </div>
  </div>

  <div class="toc-page">
    ${markRow("Contents", "toc-heading")}
    <p class="toc-lede">Full transcripts of all ${talks.length} recorded sessions, in the order they appear in the archive.</p>
    <div class="toc-list">${talkRows}</div>
  </div>

  ${chapters}

        </td>
      </tr>
    </tbody>
  </table>

</body>
</html>`;
}

// ─── Chrome discovery ───────────────────────────────────────────────────────

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "Could not find Google Chrome / Chromium / Edge. Install Chrome or add its path to CHROME_CANDIDATES."
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { slug, openAfter, dryRun } = parseArgs(process.argv.slice(2));
  if (!slug) {
    usage();
    process.exit(1);
  }

  const eventDir = await findEventDir(slug);
  const event = await loadEventMeta(eventDir, slug);
  const outputPath = await resolvePdfOutputPath(eventDir, slug);

  const srtFiles = await collectSrtFiles(eventDir);
  if (srtFiles.length === 0) {
    console.warn(`No .srt files found in ${eventDir} — skipping PDF.`);
    return;
  }

  console.log(`Event: ${event.name}`);
  console.log(`Source: ${eventDir}`);
  console.log(`Found ${srtFiles.length} transcript files.`);
  console.log(`Output: ${outputPath}`);

  if (dryRun) {
    console.log("[dry-run] skipping Chrome render");
    return;
  }

  const talks = [];
  for (const path of srtFiles) {
    const filename = basename(path);
    const raw = await readFile(path, "utf8");
    const cues = parseSrt(raw);
    const meta = parseTalkMeta(path, eventDir, event.byStem);
    const paragraphs = groupIntoParagraphs(cues);
    const duration = cues.length ? cues[cues.length - 1].end : 0;
    const summary = summaryForSrt(path);
    talks.push({ filename, paragraphs, duration, summary, ...meta });
  }

  sortTalks(talks);

  for (const talk of talks) {
    const label = (talk.speaker || talk.title).padEnd(28);
    const subtitle = (talk.session || talk.title).slice(0, 50).padEnd(50);
    console.log(`  · ${label} ${subtitle} ${formatTimestamp(talk.duration)}`);
  }

  const generatedOn = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const html = buildHtml(talks, generatedOn, event);
  const htmlPath = join(ROOT, ".transcripts-build.html");
  await writeFile(htmlPath, html, "utf8");
  console.log(`Wrote intermediate HTML: ${htmlPath}`);

  await mkdir(dirname(outputPath), { recursive: true });

  console.log("Launching Chrome to render PDF…");
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: "new",
    userDataDir: join(ROOT, ".chrome-profile"),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
  }

  console.log(`\n✓ PDF written: ${outputPath}`);
  if (openAfter) {
    const { exec } = await import("node:child_process");
    exec(`open "${outputPath}"`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
