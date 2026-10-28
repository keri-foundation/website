/**
 * Site chrome for the gallery templates.
 * brand.json overrides DEFAULT_BRAND. Keep DEFAULT_BRAND colors in step with
 * the #brand-theme block in template-presentations-landingpage/*.html.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const BRAND_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "confs",
  "template-presentations-landingpage",
  "brand.json"
);

export const DEFAULT_BRAND = {
  siteName: "",
  titleFallback: "Videos",
  descriptionFallback: "Presentations and talks.",
  footerFallback: "",
  galleryLinks: [],
  favicon32: "",
  favicon192: "",
  appleTouchIcon: "",
  msTile: "",
  image: "",
  imageAlt: "",
  imageWidth: "1200",
  imageHeight: "630",
  wave: "",
  colors: {
    ink: "#1a2332",
    muted: "#3e4c63",
    bg: "#f4f5f7",
    panel: "#ffffff",
    stone: "#e7e9ee",
    speaker: "#e8eef6",
    accent: "#3d5a80",
    link: "#0b57d0",
    onInk: "#ffffff",
    hover: "#e4eaf3",
    play: "#2f6f4e",
    playPress: "#24573d",
    surface: "#eef1f6",
    surface2: "#e3e8f0",
    surface3: "#f7f8fa",
    surface4: "#e7ebf2",
    surface5: "#f3f5f8",
  },
};

const COLOR_PROPS = [
  ["ink", "--ink"],
  ["muted", "--muted"],
  ["bg", "--bg"],
  ["panel", "--panel"],
  ["stone", "--stone"],
  ["speaker", "--speaker"],
  ["accent", "--accent"],
  ["link", "--link"],
  ["onInk", "--on-ink"],
  ["hover", "--hover"],
  ["play", "--play"],
  ["playPress", "--play-press"],
  ["surface", "--surface"],
  ["surface2", "--surface-2"],
  ["surface3", "--surface-3"],
  ["surface4", "--surface-4"],
  ["surface5", "--surface-5"],
];

export function mergeBrand(base, extra) {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return base;
  const extraColors =
    extra.colors && typeof extra.colors === "object" && !Array.isArray(extra.colors)
      ? extra.colors
      : {};
  return {
    ...base,
    ...extra,
    colors: { ...(base.colors || {}), ...extraColors },
  };
}

export function loadBrand() {
  if (!existsSync(BRAND_FILE)) return DEFAULT_BRAND;
  return mergeBrand(DEFAULT_BRAND, JSON.parse(readFileSync(BRAND_FILE, "utf8")));
}

function cssColor(value, fallback) {
  const v = String(value || "").trim();
  return HEX.test(v) ? v : fallback;
}

/** CSS value for --waves. Empty becomes none. Rejects quotes and parentheses. */
export function cssWave(wave) {
  const v = String(wave || "").trim();
  if (!v || v === "none") return "none";
  if (!/^(?:https?:\/\/|\/|\.\/|\.\.\/)?[A-Za-z0-9._~:/?#@!$&*+,;=%-]+$/.test(v)) return "none";
  return `url("${v}")`;
}

/** Root-relative paths become absolute against origin. Others stay as written. */
export function absoluteAsset(origin, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v) || v.startsWith("data:")) return v;
  if (v.startsWith("/") && origin) return String(origin).replace(/\/+$/, "") + v;
  return v;
}

export function themeDeclarations(brand, indent = "            ", keys = null) {
  const colors = (brand && brand.colors) || {};
  const props = keys ? COLOR_PROPS.filter(([key]) => keys.includes(key)) : COLOR_PROPS;
  const lines = props.map(([key, prop]) => {
    const value = cssColor(colors[key], DEFAULT_BRAND.colors[key]);
    return `${indent}${prop}: ${value};`;
  });
  lines.push(`${indent}--waves: ${cssWave(brand && brand.wave)};`);
  return lines.join("\n");
}

export function brandThemeStyle(brand) {
  return `<style id="brand-theme">
        :root {
${themeDeclarations(brand, "            ")}
        }
    </style>`;
}
