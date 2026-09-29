// Rule-based itinerary parser: free text → days[]. Unknown words are ignored, never guessed.
import { shortName } from "./model.js";

const TIMES = ["morning", "afternoon", "sunset", "evening", "night"];
const MODE_WORDS = [
  ["bus", /\b(bus|buses|jett|coach)\b/],
  ["car", /\b(drive|driving|rent|rental|car)\b/],
  ["taxi", /\b(taxi|driver|transfer|uber|careem)\b/]
];
const ARRIVE = /\b(arrive|arriving|arrival|land|landing)\b/;
const DEPART = /(fly home|fly back|flight home|depart|departure)/;
const MARKER = /(?:^|\n)[ \t]*(?:day|اليوم)[ \t]*(\d{1,2})[ \t]*[-–—:.)]?/giu;

/** Lower-case and strip Arabic diacritics / tatweel, unify alef forms. */
export function normalize(s) {
  return s.toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي");
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const kwRegex = (kw) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(normalize(kw))}(?=$|[^\\p{L}\\p{N}])`, "u");

/** Split raw text into day chunks. */
export function splitDays(text) {
  const t = text.replace(/\r/g, "").trim();
  if (!t) return [];
  const marks = [...t.matchAll(MARKER)];
  if (marks.length) {
    return marks.map((m, i) => t.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : t.length).trim());
  }
  const blocks = t.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  return t.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Place ids mentioned in a chunk, in order of first appearance. */
export function findPlaces(chunk, places) {
  const n = normalize(chunk);
  const hits = [];
  for (const p of places) {
    let first = Infinity;
    for (const kw of p.keywords) {
      const m = kwRegex(kw).exec(n);
      if (m) first = Math.min(first, m.index + m[1].length);
    }
    if (first < Infinity) hits.push([first, p.id]);
  }
  return hits.sort((a, b) => a[0] - b[0]).map((h) => h[1]);
}

function hintsFor(chunk, i, total) {
  const n = normalize(chunk);
  let mode = null;
  let at = Infinity;
  for (const [m, re] of MODE_WORDS) {
    const hit = re.exec(n);
    if (hit && hit.index < at) { at = hit.index; mode = m; }
  }
  return {
    mode,
    times: TIMES.filter((w) => new RegExp(`\\b${w}\\b`).test(n)),
    arrive: i === 0 || ARRIVE.test(n),
    depart: i === total - 1 || DEPART.test(n)
  };
}

export function dayTitle(placeIds, model) {
  return placeIds.map((id) => shortName(model.byId[id])).join(" + ") || "Free day";
}

/** text → [{ n, title, text, placeIds, hints }] */
export function parse(text, model) {
  const chunks = splitDays(text || "").slice(0, 21);
  return chunks.map((chunk, i) => {
    const placeIds = findPlaces(chunk, model.places);
    return { n: i + 1, title: dayTitle(placeIds, model), text: chunk.slice(0, 300), placeIds, hints: hintsFor(chunk, i, chunks.length) };
  });
}

/** True when the text gave us something we can check (at least one known place). */
export const isUsable = (days) => days.length > 0 && days.some((d) => d.placeIds.length > 0);

/** "We read 5 days: Day 1 Amman · Day 2 Petra …" */
export function previewText(days) {
  if (!isUsable(days)) return "";
  return `We read ${days.length} day${days.length > 1 ? "s" : ""}: ` + days.map((d) => `Day ${d.n} ${d.title}`).join(" · ");
}
