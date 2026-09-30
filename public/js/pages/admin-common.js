// Shared by the /admin console (legs in admin-legs.js, tickets in admin-tickets.js, list, overview, history).
import { html, raw } from "../ui/dom.js";
import { freshness } from "../admin-validate.js";
import { STALE_DAYS } from "../engine/model.js";

export const FS = "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
// "Today" in Amman as YYYY-MM-DD (en-CA formats dates that way), for freshness and the future-date check.
export const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const CHANGED = "darb/changed-since-open";

const FRESH_MARK = { fresh: "✓", expiring: "!", stale: "✕", future: "✕", est: "" }; // colour is never the only signal

/** Badge for one stored option or ticket (state class + ✓ ! ✕ prefix + text). */
export function freshBadge(o) {
  const f = freshness(o, TODAY);
  return html`<span class="fresh fresh-${f.state}">${FRESH_MARK[f.state] ? raw(html`<span aria-hidden="true">${FRESH_MARK[f.state]} </span>`) : ""}${f.text}</span>`;
}

/** Badge plus a thin 90-day meter (how much of the verified window is left). Decorative meter: the badge text says it. */
export const freshBlock = (o) => html`${raw(freshBadge(o))}${raw(meter(freshness(o, TODAY)))}`;

/** One line counting the expiring / stale / future-dated values among `values` (options or tickets). */
export function freshSummary(values) {
  const n = { expiring: 0, stale: 0, future: 0 };
  for (const o of values) {
    const s = freshness(o, TODAY).state;
    if (s in n) n[s]++;
  }
  const parts = [];
  if (n.expiring) parts.push(`${n.expiring} ${n.expiring === 1 ? "value expires" : "values expire"} in the next 30 days`);
  if (n.stale) parts.push(`${n.stale} stale`);
  if (n.future) parts.push(`${n.future} dated in the future`);
  return parts.length ? parts.join(" · ") : "Every verified value is good for more than 30 days.";
}

/* ---------- item state for the list and the overview ---------- */

/** freshness() state → one of the four buckets the console counts: fresh | expiring | stale | est (future-dated counts as stale). */
export const bucket = (o) => {
  const s = freshness(o, TODAY).state;
  return s === "future" ? "stale" : s;
};

/** Worst state among an item's values, in order of attention: stale > expiring > fresh > est. */
export function worstState(values) {
  const b = new Set(values.map(bucket));
  return b.has("stale") ? "stale" : b.has("expiring") ? "expiring" : b.has("fresh") ? "fresh" : "est";
}

/** The verified value closest to expiry → its freshness() (null when the item has none). */
export function soonest(values) {
  let best = null;
  for (const o of values) {
    const f = freshness(o, TODAY);
    if (f.state === "est") continue;
    const left = f.left ?? -Infinity; // no date = already stale
    if (!best || left < (best.left ?? -Infinity)) best = f;
  }
  return best;
}

const PILL = {
  fresh: ["ok", "✓", "verified"], expiring: ["risky", "!", "expiring"],
  stale: ["nf", "✕", "stale"], est: ["info", "", "est."]
};

/** Status pill for a list row (worst state). */
export function statePill(state) {
  const [cls, glyph, text] = PILL[state];
  return html`<span class="pill ${cls}">${glyph ? raw(html`<span class="pill-glyph" aria-hidden="true">${glyph}</span>`) : ""}${text}</span>`;
}

/** Thin 90-day meter: the share of the verified window left. Empty track for est. values (keeps rows the same height). */
export function meter(f) {
  if (!f || f.state === "est") return `<span class="meter" aria-hidden="true"></span>`;
  const left = Math.max(0, Math.min(STALE_DAYS, f.left ?? 0));
  const pct = f.state === "stale" || f.state === "future" ? 100 : Math.round((left / STALE_DAYS) * 100);
  return `<span class="meter meter-${f.state}" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
}

/**
 * One transaction: re-read `ref`; if it is missing or guard(liveData) is false, abort with code CHANGED;
 * else update it and add one operatorUpdates doc per log entry (at = server time). All land or none.
 */
export async function saveWithLog(ref, guard, update, entries) {
  const [{ db }, { doc, collection, runTransaction, serverTimestamp }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
  await runTransaction(db, async (tx) => {
    const live = await tx.get(ref);
    if (!live.exists() || !guard(live.data())) throw Object.assign(new Error("Changed since it was opened"), { code: CHANGED });
    tx.update(ref, update);
    for (const e of entries) tx.set(doc(collection(db, "operatorUpdates")), { ...e, at: serverTimestamp() });
  });
}
