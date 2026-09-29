// Rule-based itinerary parser: free text → days[]. Unknown words are ignored, never guessed.
import { shortName } from "./model.js";

const TIMES = ["morning", "afternoon", "sunset", "evening", "night"];
const MODE_WORDS = [
  ["bus", /\b(bus|buses|jett|coach)\b/],
  ["car", /\b(drive|driving|rent|rental|car)\b/],
  ["taxi", /\b(taxi|driver|transfer|uber|careem)\b/]
];
const AIRPORT_WORDS = /\b(airport|amm|qaia|queen alia|king hussein|aqj|fly|flight)\b/;
const ARRIVE = /\b(arrive|arriving|arrival|land|landing)\b/;
const DEPART = /\b(depart|departure|departing)\b/;
const FLY_HOME = /\b(fly|flight|flying) (home|back|out)\b/;
const AQJ_OUT = /\b(aqj|king hussein)\b|\baqaba (international )?airport\b|\b(fly|flight|flying)( home| out| back)? from aqaba\b/;
const AMM_OUT = /\b(qaia|queen alia)\b|\bamm\b|\bamman (international )?airport\b|\b(fly|flight|flying)( home| out| back)? from amman\b/;
const MAX_DAYS = 21;
const MAX_RANGE = 7;

// "Day 1", "### Day 1:", "**Day 1 – Amman**", "- Day 2", "📍 Day 3", "Days 3–4", "Day 1-2", "اليوم ١".
// A range only counts when the second number ends the marker ("Day 1 - 2 hours" is Day 1).
const PREFIX = "[ \\t#>*_•·\\-–—\\p{Extended_Pictographic}\\u{FE0F}\\u{200D}]*";
const NUM = "([\\d٠-٩]{1,2})";
const MARKER = new RegExp(
  `(?:^|\\n)${PREFIX}(?:days?|اليوم)[ \\t]*${NUM}(?:[ \\t]*(?:-|–|—|to|&|and)[ \\t]*${NUM}(?=[ \\t*_]*(?:[-–—:.)]|\\n|$)))?[ \\t*_]*[-–—:.)]?`,
  "giu"
);

/**
 * Known places Darb does not cover yet. They are listed per day ("Not covered yet: …") and masked
 * before place matching, so "Little Petra" never reads as Petra and "Feynan" never reads as Dana.
 */
export const NOT_COVERED = [
  { name: "Desert Castles", keywords: ["desert castles", "desert castle", "qasr amra", "qusayr amra", "qasr kharana", "qasr al kharanah"] },
  { name: "Azraq", keywords: ["azraq", "الازرق"] },
  { name: "Wadi Mujib", keywords: ["wadi mujib", "mujib", "siq trail", "الموجب"] },
  { name: "Little Petra", keywords: ["little petra", "siq al barid", "البترا الصغيره"] },
  { name: "Feynan", keywords: ["feynan", "فينان"] },
  { name: "Shobak", keywords: ["shobak", "shoubak", "montreal castle", "الشوبك"] },
  { name: "Baptism Site", keywords: ["baptism site", "bethany", "al maghtas", "المغطس"] },
  { name: "Irbid", keywords: ["irbid", "اربد"] },
  { name: "Ma'in", keywords: ["ma'in", "hammamat"] },
  { name: "Aqaba Marine Park", keywords: ["marine park"] }
];

const toInt = (s) => Number(String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660));

const SOFT = "\u00AD";

/**
 * Lower-case; strip Latin accents (Ammān → amman), Arabic diacritics and tatweel; fold ء/آ/أ/إ → ا,
 * ة → ه, ى → ي; "->"/"=>" → "→"; hyphens, underscores, apostrophes and dots → space; collapse spaces.
 * Keywords go through the same function, so "Dead-Sea" matches "dead sea" and "البتراء" matches itself.
 */
export function normalize(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ً-ٰٕـ]/g, "")
    .replace(/[ءآأإ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/->|=>|[>➜➔➡⟶]/g, " → ")
    // "Amman - Petra" is a connector ("–"); "Amman-Petra" becomes a soft hyphen, which keyword matching
    // treats like a space ("Dead-Sea" = "dead sea") and CONNECTOR treats like "–".
    .replace(/[ \t]-[ \t]/g, " – ")
    .replace(/(?<=\p{L})-(?=\p{L})/gu, SOFT)
    .replace(/[-_'’.]/g, " ")
    .replace(/[ \t]+/g, " ");
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Optional Arabic "و" (and) prefix: "والعقبة" = "and Aqaba".
const kwRegex = (kw) => new RegExp(`(^|[^\\p{L}\\p{N}])(و?)(${esc(normalize(kw)).replace(/[ \u00AD]/g, "[ \\u00AD]")})(?=$|[^\\p{L}\\p{N}])`, "u");

/** First match of any keyword in a normalized string → { start, end } or null. */
function firstMatch(n, keywords) {
  let best = null;
  for (const kw of keywords) {
    const m = kwRegex(kw).exec(n);
    if (!m) continue;
    const start = m.index + m[1].length + m[2].length;
    if (!best || start < best.start) best = { start, end: start + m[3].length };
  }
  return best;
}

/** Split raw text into day chunks. A range marker ("Days 3–4") repeats its chunk once per day. */
export function splitDays(text) {
  const t = String(text || "").replace(/\r/g, "").trim();
  if (!t) return [];
  const marks = [...t.matchAll(MARKER)];
  if (marks.length) {
    return marks.flatMap((m, i) => {
      const chunk = t.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : t.length).trim();
      const a = toInt(m[1]);
      const b = m[2] ? toInt(m[2]) : a;
      const count = b > a ? Math.min(MAX_RANGE, b - a + 1) : 1;
      return Array.from({ length: count }, () => chunk);
    });
  }
  const blocks = t.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  return t.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Not-covered place names in a normalized chunk + the chunk with those names blanked out. */
function maskNotCovered(n) {
  const names = [];
  let masked = n;
  for (const nc of NOT_COVERED) {
    let hit = false;
    for (const kw of nc.keywords) {
      const re = new RegExp(kwRegex(kw).source, "gu");
      masked = masked.replace(re, (all, pre, wa, word) => { hit = true; return pre + " ".repeat(wa.length + word.length); });
    }
    if (hit) names.push(nc.name);
  }
  return { names, masked };
}

/** [{ id, start, end }] for each place mentioned in a normalized chunk, by first appearance. */
function placeHits(n, places) {
  const hits = [];
  for (const p of places) {
    const m = firstMatch(n, p.keywords);
    if (m) hits.push({ id: p.id, ...m });
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** Place ids mentioned in a chunk, in order of first appearance (not-covered names are ignored). */
export function findPlaces(chunk, places) {
  return placeHits(maskNotCovered(normalize(chunk)).masked, places).map((h) => h.id);
}

// "Amman to Petra", "Amman → Petra", "Wadi Rum to the Dead Sea" (a route) and "Petra – Wadi Rum",
// "Amman-Petra" (a dash: also how people list sights, "Jerash - Ajloun - Umm Qais").
const ROUTE = /^[\s*_:,]*(to|→)(\s+the)?[\s*_]*$/u;
const CONNECTOR = /^[\s*_:,]*(to|→|–|—|\u00AD)(\s+the)?[\s*_]*$/u;
// "from Amman", "depart Amman", "leave Petra" just before the place name.
const ORIGIN_WORD = /\b(from|depart|departing|leave|leaving)\s*$/;

/**
 * The place yesterday ended in, named as today's starting point, is not a visit: "Amman to Petra",
 * "Amman → Petra", "from Petra back to Amman", "Depart Amman on the JETT bus to Petra". It is dropped —
 * or moved to the end when the chunk names it again later ("Amman → Jerash → Amman" ends back in Amman).
 * "Morning at Petra, then head to Wadi Rum" keeps Petra: the words between the two places are not a bare
 * connector, and nothing like "from" comes before Petra.
 * After Day 1, a first place followed by "to" or an arrow ("Amman to Petra") is the origin even when
 * yesterday ended elsewhere (a day trip to Jerash, or a Day 1 with no place). A dash ("Jerash - Ajloun")
 * only marks the origin when the first place is where yesterday ended — otherwise it is a list of sights.
 */
function dropOrigin(hits, n, prevLast, places, i) {
  if (hits.length < 2) return hits;
  const lead = i > 0 && ROUTE.test(n.slice(hits[0].end, hits[1].start));
  const k = lead ? 0 : prevLast ? hits.findIndex((h) => h.id === prevLast) : -1;
  if (k < 0) return hits;
  const h = hits[k];
  const arrow = k === 0 && (lead || CONNECTOR.test(n.slice(h.end, hits[1].start)));
  const origin = ORIGIN_WORD.test(n.slice(Math.max(0, h.start - 12), h.start));
  if (!arrow && !origin) return hits;
  const rest = hits.filter((_, j) => j !== k);
  const after = k === 0 ? hits[1].end : h.end;
  const place = places.find((p) => p.id === h.id);
  return firstMatch(n.slice(after), place.keywords) ? [...rest, h] : rest;
}

/** "A" happens and airport words follow it later in the same chunk. */
const followedBy = (n, a, b) => {
  const m = a.exec(n);
  return !!m && b.test(n.slice(m.index));
};

function hintsFor(n, i, total) {
  let mode = null;
  let at = Infinity;
  for (const [m, re] of MODE_WORDS) {
    const hit = re.exec(n);
    if (hit && hit.index < at) { at = hit.index; mode = m; }
  }
  return {
    mode,
    times: TIMES.filter((w) => new RegExp(`\\b${w}\\b`).test(n)),
    // Mid-trip "arrive in Petra" / "depart Amman on the JETT" are not airport arrivals / departures.
    arrive: i === 0 || followedBy(n, ARRIVE, AIRPORT_WORDS),
    depart: i === total - 1 || FLY_HOME.test(n) || followedBy(n, DEPART, AIRPORT_WORDS)
  };
}

export function dayTitle(placeIds, model) {
  return placeIds.map((id) => shortName(model.byId[id])).join(" + ") || "Free day";
}

/** text → [{ n, title, text, placeIds, notCovered, hints }] */
export function parse(text, model) {
  const chunks = splitDays(text || "").slice(0, MAX_DAYS);
  let prevLast = null;
  return chunks.map((chunk, i) => {
    const n = normalize(chunk);
    const { names, masked } = maskNotCovered(n);
    const placeIds = dropOrigin(placeHits(masked, model.places), masked, prevLast, model.places, i).map((h) => h.id);
    if (placeIds.length) prevLast = placeIds.at(-1);
    return {
      n: i + 1, title: dayTitle(placeIds, model), text: chunk.slice(0, 300), placeIds,
      notCovered: names, hints: hintsFor(n, i, chunks.length)
    };
  });
}

/** Airport named on the last day ("fly home from AQJ", "King Hussein airport") → "AQJ" | "AMM" | null. */
export function departAirportFrom(days) {
  const last = days?.at(-1);
  if (!last) return null;
  const n = normalize(last.text || "");
  if (AQJ_OUT.test(n)) return "AQJ";
  if (AMM_OUT.test(n)) return "AMM";
  return null;
}

/** True when the text gave us something we can check (at least one known place). */
export const isUsable = (days) => days.length > 0 && days.some((d) => d.placeIds.length > 0);

/** Distinct not-covered names across the trip, in order. */
export const notCoveredNames = (days) => [...new Set(days.flatMap((d) => d.notCovered || []))];

function previewDay(d) {
  if (d.placeIds.length) return d.title;
  if (d.notCovered?.length) return `${d.notCovered.join(" + ")} (not covered yet)`;
  return d.hints?.depart ? "Fly home" : "Free day";
}

/** "We read 5 days: Day 1 Amman · Day 2 Petra … · Not covered yet: Azraq, Wadi Mujib." */
export function previewText(days) {
  if (!isUsable(days)) return "";
  const names = notCoveredNames(days);
  return `We read ${days.length} day${days.length > 1 ? "s" : ""}: ` + days.map((d) => `Day ${d.n} ${previewDay(d)}`).join(" · ") +
    (names.length ? ` · Not covered yet: ${names.join(", ")}.` : "");
}
