// Calendar export: RFC 5545 .ics (one all-day event per day + one timed event per transport leg)
// and a Google Calendar template link for the whole trip. Pure — no DOM, runs in Node.
import { shortName } from "./engine/model.js";
import { fmtDuration } from "./engine/format.js";

const TZID = "Asia/Amman";
const CRLF = "\r\n";
const DEFAULT_LEG_MIN = 60;
const SLOTS = [8 * 60, 13 * 60, 17 * 60]; // leg start when there's no departure time: before 0 / 1 / 2+ visits

const pad = (n, w = 2) => String(n).padStart(w, "0");

/** "YYYYMMDD" of a UTC-midnight date (all date maths in UTC, so the host timezone never shifts a day). */
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
/** Local wall-clock date-time (Asia/Amman) as a floating "YYYYMMDDTHHMMSS". minutes may exceed 24 h. */
const localDt = (day, minutes) => {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, minutes));
  return `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
};
const utcStamp = (d) => `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/**
 * First day of the trip (UTC-midnight Date): settings.startDate if set; else, when the month is the current
 * one, tomorrow; else the 1st of that month at its next occurrence (this year or next). Never in the past.
 */
export function tripStartDate(settings = {}, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(settings.startDate || "");
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const cur = today.getUTCMonth() + 1;
  const month = Number(settings.month) || cur;
  if (month === cur) return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  const year = today.getUTCFullYear() + (month < cur ? 1 : 0);
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Stable short hash (FNV-1a, hex) — gives unsaved trips a UID that doesn't collide with other trips. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** UID stem: the saved trip id, else "local-<hash of title + day titles and items>". */
export function uidStem(trip, fixed) {
  if (trip?.id) return trip.id;
  const sig = JSON.stringify([trip?.title || "", (fixed?.days || []).map((d) => [d.title, (d.items || []).map((i) => i.label)])]);
  return `local-${hash(sig)}`;
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
export const escText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold a content line at 75 octets (continuation lines start with a space), never splitting a UTF-8 character. */
export function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 75) {
      out.push(cur);
      cur = " "; // continuation line: leading space counts toward the 75 octets
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join(CRLF);
}

const placeName = (model, id) => (model?.byId?.[id] ? shortName(model.byId[id]) : String(id ?? ""));
const fullName = (model, id) => model?.byId?.[id]?.name || placeName(model, id);

function itemLine(it) {
  return [it.label, it.sub, it.costText].filter(Boolean).join(" — ");
}

const parseHm = (s) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Timed legs of one fixed day: [{ item, k, start, end }] in minutes from local midnight. */
function legTimes(day) {
  const out = [];
  let visits = 0;
  let prevEnd = 0;
  let k = 0;
  for (const it of day.items || []) {
    if (it.kind === "visit") { visits++; continue; }
    if (it.kind !== "leg") continue;
    const dur = Number(it.option?.durationMin) > 0 ? Number(it.option.durationMin) : DEFAULT_LEG_MIN;
    const departs = parseHm(it.option?.departs);
    const start = departs ?? Math.max(SLOTS[Math.min(visits, SLOTS.length - 1)], prevEnd);
    out.push({ item: it, k: ++k, start, end: start + dur });
    prevEnd = start + dur;
  }
  return out;
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0300",
  "TZNAME:+03",
  "END:STANDARD",
  "END:VTIMEZONE"
];

/**
 * buildIcs(trip, fixed, model, { today?, now? }) → .ics text (CRLF, folded).
 * trip = { id, title, settings }, fixed = trip.fixed (days[].items with legs/visits).
 */
export function buildIcs(trip, fixed, model, opts = {}) {
  const today = opts.today ? new Date(opts.today) : new Date();
  const stamp = utcStamp(opts.now ? new Date(opts.now) : new Date());
  const start = tripStartDate(trip?.settings, today);
  const id = uidStem(trip, fixed);
  const title = trip?.title || "Jordan trip";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Darb//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escText(title)}`,
    `X-WR-TIMEZONE:${TZID}`,
    ...VTIMEZONE
  ];

  (fixed?.days || []).forEach((day, i) => {
    const date = addDays(start, i);
    const n = day.n ?? i + 1;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${id}-d${n}@darb`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(date)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(date, 1))}`,
      `SUMMARY:${escText(`Day ${n} — ${day.title || ""}`)}`,
      `DESCRIPTION:${escText((day.items || []).map(itemLine).join("\n"))}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );

    for (const { item, k, start: s, end: e } of legTimes(day)) {
      const o = item.option || {};
      const from = model?.byId?.[item.from];
      const summary = `${placeName(model, item.from)} → ${placeName(model, item.to)} · ${o.label || "Transport"}`;
      // No published departure → the clock time is our planning slot, not a timetable: say so first.
      const desc = [
        ...(parseHm(o.departs) == null ? ["Suggested time — not a timetable."] : []),
        `${o.label || "Transport"}${o.departs ? ` · departs ${o.departs}` : ""}${o.durationMin ? ` · ${fmtDuration(o.durationMin)}` : ""}`,
        `Cost: ${item.costText || "Price on request"}${item.verified ? " (verified)" : ""}`,
        `If you're late: ${item.lateAlt || "ask your hotel or camp to book a taxi / driver"}`,
        "Planned with Darb — prices marked est. are ranges until verified."
      ].join("\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${id}-d${n}-l${k}@darb`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TZID}:${localDt(date, s)}`,
        `DTEND;TZID=${TZID}:${localDt(date, e)}`,
        `SUMMARY:${escText(summary)}`,
        `LOCATION:${escText(fullName(model, item.from))}`
      );
      if (from && Number.isFinite(from.lat) && Number.isFinite(from.lng)) lines.push(`GEO:${from.lat};${from.lng}`);
      lines.push(
        `DESCRIPTION:${escText(desc)}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT45M",
        `DESCRIPTION:${escText(`Leave for ${item.label || summary}`)}`,
        "END:VALARM",
        "END:VEVENT"
      );
    }
  });

  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}

/** Google Calendar "add event" link: one all-day event spanning the whole trip, day summaries in the details. */
export function googleCalendarUrl(trip, fixed, model, opts = {}) {
  const today = opts.today ? new Date(opts.today) : new Date();
  const start = tripStartDate(trip?.settings, today);
  const days = fixed?.days || [];
  const end = addDays(start, Math.max(1, days.length));
  const details = days.map((d, i) => `Day ${d.n ?? i + 1} — ${d.title || ""}`).join("\n");
  const link = opts.link ? `\n\n${opts.link}` : "";
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: trip?.title || "Jordan trip",
    dates: `${ymd(start)}/${ymd(end)}`,
    details: details + link,
    ctz: TZID
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
