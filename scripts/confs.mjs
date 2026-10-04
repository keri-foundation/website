#!/usr/bin/env node
/**
 * Helper for the galleries under confs/<ORG>/<YEAR>/<month>/ and vids/<YEAR>/<month>/.
 *
 * Usage:
 *   node scripts/confs.mjs list
 *   node scripts/confs.mjs sync-subtitles [--dry-run] [--conf KERI/2026/apr]...
 *   node scripts/confs.mjs verify [--remote https://keri.foundation] [--conf KERI/2026/apr]...
 *
 * list            Print every gallery id that has an index.json.
 *                 Conferences are ORG/YEAR/month. Monthly videos are vids/YEAR/month.
 * sync-subtitles  Copy curated .srt files from the source folders listed in
 *                 scripts/subtitle-sources.tsv into the conference folders. Only
 *                 subtitles referenced by that conference's index.json are copied
 *                 (legacy `subtitle` plus optional `subtitles` language map).
 *                 Sources are matched recursively by exact basename.
 * verify          Check that every file referenced by index.json exists (media, mp3,
 *                 subtitles, slides, posters, photos, transcript pages) and list files
 *                 that nothing references. With --remote, also HEAD-request each file
 *                 on the live site.
 */

import { readFile, readdir, stat, copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, "..");
const CONFS_ROOT = join(SITE_ROOT, "confs");
const VIDS_ROOT = join(SITE_ROOT, "vids");
const SOURCES_FILE = join(SCRIPT_DIR, "subtitle-sources.tsv");

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

/** Absolute directory of a gallery (confs/ORG/YEAR/month or vids/YEAR/month). */
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
      for (const month of (await readdir(join(VIDS_ROOT, year))).sort()) {
        if (existsSync(join(VIDS_ROOT, year, month, "index.json"))) {
          ids.push(`vids/${year}/${month}`);
        }
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

/** Collect every subtitle path on a video (`subtitle` + optional `subtitles` map). */
function collectSubtitlePaths(video) {
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
function collectRefs(config) {
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
    for (const sub of collectSubtitlePaths(v)) add("subtitle", v.title, sub);
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
    const refs = collectRefs(config);
    const confDir = galleryDir(id);
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
    if (parts.length < 4) throw new Error(`Target must be <gallery id>/<folder> (e.g. KERI/2026/apr/talks or vids/2026/jul/talks): ${target}`);
    sources.push({ conf: parts.slice(0, 3).join("/"), folder: parts.slice(3).join("/"), source });
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
    const wanted = [...new Set(
      (config.videos || [])
        .flatMap((v) => collectSubtitlePaths(v))
        .filter((s) => s && dirname(s) === folder)
        .map((s) => s.slice(folder.length + 1))
    )];
    const byBase = await indexSrtByBasename(source);
    let unchanged = 0;
    for (const name of wanted) {
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
    case "sync-subtitles":
      await cmdSyncSubtitles(opts);
      break;
    case "verify":
      await cmdVerify(opts);
      break;
    default:
      console.log("Usage: node scripts/confs.mjs <list|sync-subtitles|verify> [--conf ORG/YEAR/month|vids/YEAR/month] [--dry-run] [--remote URL]");
      process.exit(opts.command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
