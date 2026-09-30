// /admin rules for one transport option, freshness badges and the concurrency check. Pure: no DOM, no Firebase.
import { daysSince, STALE_DAYS } from "./engine/model.js";

export const METHODS = ["web", "phone", "field", "whatsapp", "operator", "web-est"]; // same list as scripts/check-data.mjs
export const VERIFIED_METHODS = ["web", "phone", "field", "operator"]; // whatsapp quotes and web-est estimates stay est.

const SOURCE_MAX = 200;
const EXPIRING_DAYS = 30;
const FIELDS = ["cost", "departs", "status", "verifiedOn", "notes", "source", "sourceUrl", "method"];

const timeOk = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const dateOk = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return t.toISOString().slice(0, 10) === d; // rejects 2026-02-31
};
const costText = (c) => (Array.isArray(c) ? `${c[0]}–${c[1]}` : "");
const shown = (x) => (x == null ? "" : Array.isArray(x) ? costText(x) : String(x)); // display string, as logged before
const jsonValue = (f, x) => (f === "cost" ? (Array.isArray(x) ? [x[0], x[1]] : null) : x == null || x === "" ? null : String(x));

/**
 * old = the stored option; input = the form's trimmed strings
 * { costMin, costMax, departs, status, verifiedOn, notes, source, sourceUrl, method }; today = "YYYY-MM-DD".
 * → { error } (one sentence) or { option, changes: [{ field, from, to, fromValue, toValue }], warnings: [sentence] }.
 */
export function validateOption(old, input, today) {
  const label = old.label;
  const fail = (msg) => ({ error: `${label}: ${msg}` });
  const v = (f) => String(input[f] ?? "").trim();
  const o = { ...old };
  const set = (f, x) => { if (x) o[f] = x; else delete o[f]; }; // empty optional fields are not stored as ""

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
  set("departs", departs);

  const status = v("status");
  if (status !== "verified" && status !== "est") return fail("status must be verified or est.");
  o.status = status;
  const verified = status === "verified";

  const on = v("verifiedOn");
  if (on && !dateOk(on)) return fail("Verified-on must be a date like 2026-09-24.");
  if (verified && !on) return fail("“verified” needs a Verified-on date.");
  if (verified && daysSince(on, today) < 0) return fail("Verified-on can’t be in the future.");
  set("verifiedOn", on);

  set("notes", v("notes"));

  const source = v("source");
  if (source.length > SOURCE_MAX && source !== (old.source || "")) return fail(`the Source text can be at most ${SOURCE_MAX} characters.`);
  set("source", source);

  const src = v("sourceUrl");
  if (src && !/^https:\/\/\S+$/.test(src)) return fail("the source URL must start with https://");
  if (verified && !src) return fail("“verified” needs a Source URL (the page or document that shows the value).");
  set("sourceUrl", src);

  const method = v("method");
  if (method && !METHODS.includes(method)) return fail("unknown method.");
  if (verified && !VERIFIED_METHODS.includes(method)) return fail("“verified” needs a method of web, phone, field or operator (whatsapp quotes and web-est stay est.).");
  set("method", method);

  const changes = FIELDS.filter((f) => shown(old[f]) !== shown(o[f]))
    .map((f) => ({ field: f, from: shown(old[f]), to: shown(o[f]), fromValue: jsonValue(f, old[f]), toValue: jsonValue(f, o[f]) }));

  const warnings = [];
  if (verified && daysSince(on, today) > STALE_DAYS) {
    warnings.push(`${label}: was verified more than ${STALE_DAYS} days ago — travellers will see it as est. until it is re-checked.`);
  }
  const moved = changes.some((c) => c.field === "verifiedOn" || c.field === "sourceUrl");
  if (moved && source && source === (old.source || "").trim()) {
    warnings.push(`${label}: the Source text still reads “${source}” — update it so it matches the new date or URL.`);
  }
  return { option: o, changes, warnings };
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
