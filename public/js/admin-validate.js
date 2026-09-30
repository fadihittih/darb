// /admin rules for one transport option or site ticket, freshness badges and the concurrency check. Pure: no DOM, no Firebase.
import { daysSince, STALE_DAYS } from "./engine/model.js";

export const METHODS = ["web", "phone", "field", "whatsapp", "operator", "web-est"]; // same list as scripts/check-data.mjs
export const VERIFIED_METHODS = ["web", "phone", "field", "operator"]; // whatsapp quotes and web-est estimates stay est.

const SOURCE_MAX = 200;
const EXPIRING_DAYS = 30;
const OPTION_FIELDS = ["cost", "departs", "status", "verifiedOn", "notes", "source", "sourceUrl", "method"];
const TICKET_FIELDS = ["jod", "status", "verifiedOn", "notes", "source", "sourceUrl", "method"];

const timeOk = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const dateOk = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return t.toISOString().slice(0, 10) === d; // rejects 2026-02-31
};
const costText = (c) => (Array.isArray(c) ? `${c[0]}–${c[1]}` : "");
const shown = (x) => (x == null ? "" : Array.isArray(x) ? costText(x) : String(x)); // display string, as logged before
const jsonValue = (f, x) => (f === "cost" ? (Array.isArray(x) ? [x[0], x[1]] : null)
  : f === "jod" ? (Number.isFinite(x) ? x : null) : x == null || x === "" ? null : String(x));

/**
 * The rules options and tickets share (priceMissing = the caller's price is empty; “verified” then needs one): status, verifiedOn, notes, source, sourceUrl, method (in that order).
 * Writes them onto `o` (empty optional fields are removed, not stored as ""); → an error sentence or "".
 */
function checkProvenance(old, o, v, today, priceMissing) {
  const set = (f, x) => { if (x) o[f] = x; else delete o[f]; };

  const status = v("status");
  if (status !== "verified" && status !== "est") return "status must be verified or est.";
  o.status = status;
  const verified = status === "verified";
  if (verified && priceMissing) return priceMissing;

  const on = v("verifiedOn");
  if (on && !dateOk(on)) return "Verified-on must be a date like 2026-09-24.";
  if (verified && !on) return "“verified” needs a Verified-on date.";
  if (verified && daysSince(on, today) < 0) return "Verified-on can’t be in the future.";
  set("verifiedOn", on);

  set("notes", v("notes"));

  const source = v("source");
  if (source.length > SOURCE_MAX && source !== (old.source || "")) return `the Source text can be at most ${SOURCE_MAX} characters.`;
  set("source", source);

  const src = v("sourceUrl");
  if (src && !/^https:\/\/\S+$/.test(src)) return "the source URL must start with https://";
  if (verified && !src) return "“verified” needs a Source URL (the page or document that shows the value).";
  set("sourceUrl", src);

  const method = v("method");
  if (method && !METHODS.includes(method)) return "unknown method.";
  if (verified && !VERIFIED_METHODS.includes(method)) return "“verified” needs a method of web, phone, field or operator (whatsapp quotes and web-est stay est.).";
  set("method", method);
  return "";
}

/** Changes between old and new over `fields`, plus the non-blocking warnings (stale date; Source text left behind). */
function diff(label, fields, old, o, today) {
  const changes = fields.filter((f) => shown(old[f]) !== shown(o[f]))
    .map((f) => ({ field: f, from: shown(old[f]), to: shown(o[f]), fromValue: jsonValue(f, old[f]), toValue: jsonValue(f, o[f]) }));

  const warnings = [];
  if (o.status === "verified" && daysSince(o.verifiedOn, today) > STALE_DAYS) {
    warnings.push(`${label}: was verified more than ${STALE_DAYS} days ago — travellers will see it as est. until it is re-checked.`);
  }
  const moved = changes.some((c) => c.field === "verifiedOn" || c.field === "sourceUrl");
  const source = o.source || "";
  if (moved && source && source === (old.source || "").trim()) {
    warnings.push(`${label}: the Source text still reads “${source}” — update it so it matches the new date or URL.`);
  }
  return { changes, warnings };
}

const reader = (input) => (f) => String(input[f] ?? "").trim();

/**
 * old = the stored option; input = the form's trimmed strings
 * { costMin, costMax, departs, status, verifiedOn, notes, source, sourceUrl, method }; today = "YYYY-MM-DD".
 * → { error } (one sentence) or { option, changes: [{ field, from, to, fromValue, toValue }], warnings: [sentence] }.
 */
export function validateOption(old, input, today) {
  const label = old.label;
  const fail = (msg) => ({ error: `${label}: ${msg}` });
  const v = reader(input);
  const o = { ...old };

  const min = v("costMin"), max = v("costMax");
  if ((min === "") !== (max === "")) return fail("enter both cost min and cost max, or leave both empty.");
  if (min === "") o.cost = null;
  else {
    const a = Number(min), b = Number(max);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return fail("costs must be positive numbers.");
    if (a > b) return fail("cost min can’t be higher than cost max.");
    o.cost = [a, b];
  }

  const departs = v("departs");
  if (departs && !timeOk(departs)) return fail("departs must look like 06:30.");
  if (departs) o.departs = departs; else delete o.departs;

  const bad = checkProvenance(old, o, v, today, o.cost ? "" : "“verified” needs a cost (enter cost min and cost max).");
  if (bad) return fail(bad);
  return { option: o, ...diff(label, OPTION_FIELDS, old, o, today) };
}

/**
 * old = the stored places/<id>.ticket; input = the form's trimmed strings
 * { jod, status, verifiedOn, notes, source, sourceUrl, method }. jod empty = null = price unknown.
 * Other keys (label, coveredByJordanPass) are carried through. → { error } or { ticket, changes, warnings }.
 */
export function validateTicket(old, input, today) {
  const label = old.label || "Ticket";
  const fail = (msg) => ({ error: `${label}: ${msg}` });
  const v = reader(input);
  const t = { ...old };

  const jod = v("jod");
  if (jod === "") t.jod = null;
  else {
    const n = Number(jod);
    if (!Number.isFinite(n) || n < 0) return fail("the price must be a number of 0 or more (leave it empty if unknown).");
    t.jod = n;
  }

  const bad = checkProvenance(old, t, v, today, t.jod === null ? "“verified” needs a price." : "");
  if (bad) return fail(bad);
  return { ticket: t, ...diff(label, TICKET_FIELDS, old, t, today) };
}

/** Freshness of a verified option or ticket → { state: est|future|stale|expiring|fresh, days, left, text }. */
export function freshness(o, today) {
  if (!o || o.status !== "verified") return { state: "est", days: null, left: null, text: "est." };
  const days = daysSince(o.verifiedOn, today);
  if (!Number.isFinite(days)) return { state: "stale", days: null, left: null, text: "stale — shown as est." };
  const left = STALE_DAYS - days;
  if (days < 0) return { state: "future", days, left, text: "date is in the future" };
  if (days > STALE_DAYS) return { state: "stale", days, left, text: "stale — shown as est." };
  return { state: left <= EXPIRING_DAYS ? "expiring" : "fresh", days, left, text: `verified ${days} d ago · expires in ${left} d` };
}

/** Deep equality that ignores object key order (Firestore does not keep map key order). */
export function sameData(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameData(a[k], b[k]));
}

/* ---------- history rows (operatorUpdates) and revert ---------- */

const FIELD_LABEL = { cost: "cost", departs: "departs", status: "status", verifiedOn: "verified on", notes: "notes", source: "source", sourceUrl: "source URL", method: "method" };
const TICKET_LABEL = { jod: "Price (JOD)", status: "Status", verifiedOn: "Verified on", method: "Method", source: "Source", sourceUrl: "Source URL", notes: "Notes" };

/** "options[2].cost" → { kind: "option", index: 2, field: "cost" }; "ticket.jod" → { kind: "ticket", field: "jod" }; else null. */
export function parseUpdateField(s) {
  if (typeof s !== "string") return null;
  const o = /^options\[(\d+)\]\.([A-Za-z]+)$/.exec(s);
  if (o && OPTION_FIELDS.includes(o[2])) return { kind: "option", index: Number(o[1]), field: o[2] };
  const t = /^ticket\.([A-Za-z]+)$/.exec(s);
  if (t && TICKET_FIELDS.includes(t[1])) return { kind: "ticket", field: t[1] };
  return null;
}

/**
 * The form inputs that put an update's `fromValue` back: { inputName: string } (cost → costMin + costMax), or null when the
 * row can't be reverted (no `fromValue` key — written before it was logged — an unknown field, or a value of the wrong shape).
 */
export function revertInputs(update) {
  if (!update || !Object.prototype.hasOwnProperty.call(update, "fromValue")) return null;
  const p = parseUpdateField(update.field);
  if (!p) return null;
  const v = update.fromValue;
  if (p.field === "cost") {
    if (v === null) return { costMin: "", costMax: "" };
    return Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? { costMin: String(v[0]), costMax: String(v[1]) } : null;
  }
  if (p.field === "jod") return v === null ? { jod: "" } : Number.isFinite(v) ? { jod: String(v) } : null;
  if (v !== null && typeof v !== "string") return null;
  return { [p.field]: v === null ? (p.field === "status" ? "est" : "") : v }; // no status = not verified
}

/** What a history row changed, readable: "JETT bus · cost" for a leg option (labels[i] = option label), "Price (JOD)" for a ticket. */
export function updateWhat(update, optionLabels = []) {
  const p = parseUpdateField(update?.field);
  if (!p) return String(update?.field ?? "");
  if (p.kind === "ticket") return TICKET_LABEL[p.field];
  return `${optionLabels[p.index] || `Option ${p.index + 1}`} · ${FIELD_LABEL[p.field]}`;
}
