// Shared by the /admin editors (transport legs in admin.js, site tickets in admin-tickets.js).
import { html, raw } from "../ui/dom.js";
import { freshness } from "../admin-validate.js";

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
