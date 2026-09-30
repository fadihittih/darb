// /admin "History": the last 50 logged changes of one leg or one place's ticket, with a Revert that only refills the form.
import { html, raw, qs } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { parseUpdateField, revertInputs, updateWhat } from "../admin-validate.js";
import { FS } from "./admin-common.js";

const LIMIT = 50;
const AMMAN = { timeZone: "Asia/Amman" };
const dayFmt = new Intl.DateTimeFormat("en-US", { ...AMMAN, day: "numeric", month: "short" }); // parts: en-GB says "Sept"
const timeFmt = new Intl.DateTimeFormat("en-GB", { ...AMMAN, hour: "2-digit", minute: "2-digit", hour12: false });
const atMillis = (u) => u.at?.toMillis?.() ?? 0;

/** "30 Sep · 14:05" (Amman time) for a Firestore Timestamp; "" when the row has none. */
const whenText = (at) => {
  const d = at?.toDate?.();
  if (!d) return "";
  const p = Object.fromEntries(dayFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} · ${timeFmt.format(d)}`;
};
const valueText = (s) => (s === "" || s == null ? html`<em>empty</em>` : html`${s}`);

/** One row per update (plain objects from operatorUpdates), newest first. Everything is escaped by html``. */
export function historyRows(updates, { labels = [], ro = false } = {}) {
  return html`<ol class="hist-list">${updates.map((u, i) => {
    const what = updateWhat(u, labels);
    const can = revertInputs(u) !== null;
    const from = u.from === "" || u.from == null ? "empty" : u.from;
    return html`<li class="hist-row">
      <span class="hist-when">${whenText(u.at)}</span><span class="hist-by">${u.by}</span>
      <span class="hist-what"><strong>${what}</strong> <span class="hist-change">${raw(valueText(u.from))} → ${raw(valueText(u.to))}</span></span>
      ${can ? raw(html`<button type="button" class="btn btn-secondary btn-sm hist-revert" data-revert="${i}" aria-label="${`Revert ${what} to ${from}`}"${ro ? " disabled" : ""}>Revert</button>`) : ""}
    </li>`;
  }).map(raw)}</ol>`;
}

async function fetchUpdates(kind, id) {
  const [{ db }, { collection, query, where, orderBy, limit, getDocs }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
  const col = collection(db, "operatorUpdates");
  const eq = where(kind === "place" ? "placeId" : "legId", "==", id);
  try {
    const snap = await getDocs(query(col, eq, orderBy("at", "desc"), limit(LIMIT)));
    return { updates: snap.docs.map((d) => d.data()), path: "ordered" };
  } catch (e) {
    if (e.code !== "failed-precondition") throw e; // index missing or still building: equality only, sorted here
    const snap = await getDocs(query(col, eq));
    return { updates: snap.docs.map((d) => d.data()).sort((a, b) => atMillis(b) - atMillis(a)).slice(0, LIMIT), path: "fallback" };
  }
}

/**
 * Append a lazy "History" disclosure to `body` (a card's .leg-body).
 *  kind "leg" | "place", id = leg or place id; labels() → option labels (legs); findInput(parsedField, inputName) → the form control.
 *  A `darb:saved` event bubbling from the card refreshes an open History (or the next open).
 */
export function mountHistory(body, { kind, id, ro, labels = () => [], findInput }) {
  const det = document.createElement("details");
  det.className = "hist";
  det.innerHTML = html`<summary>History</summary><div class="hist-body" aria-live="polite"></div>`;
  body.append(det);
  const out = qs(".hist-body", det);
  let updates = [];
  let loaded = false;
  let seq = 0; // ignores a slow load that a newer one has replaced

  async function load() {
    const mine = ++seq;
    out.innerHTML = html`<p class="hist-msg muted">Loading…</p>`;
    try {
      const r = await fetchUpdates(kind, id);
      if (mine !== seq) return;
      updates = r.updates;
      loaded = true;
      out.innerHTML = updates.length ? historyRows(updates, { labels: labels(), ro }) : html`<p class="hist-msg muted">No changes recorded yet.</p>`;
      out.dataset.path = r.path;
    } catch (e) {
      if (mine !== seq) return;
      console.warn("Darb: history load failed", e);
      out.innerHTML = html`<p class="hist-msg hist-error">Couldn’t load the history.</p>`;
    }
  }

  det.addEventListener("toggle", () => { if (det.open && !loaded) load(); });
  body.closest("details.leg")?.addEventListener("darb:saved", () => { loaded = false; if (det.open) load(); });
  out.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-revert]");
    if (!b || ro) return;
    const u = updates[Number(b.dataset.revert)];
    const values = revertInputs(u);
    const p = parseUpdateField(u?.field);
    if (!values || !p) return;
    const els = Object.keys(values).map((name) => findInput(p, name));
    if (els.some((el) => !el)) { toast("That option is no longer on this leg"); return; }
    Object.entries(values).forEach(([name, v], n) => { els[n].value = v; });
    els[0].scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    els[0].focus({ preventScroll: true });
    toast("Form filled with the earlier value — review it and press Save");
  });
}

/** Tell an open History that a save landed. */
export const announceSaved = (card, kind, id) => card?.dispatchEvent(new CustomEvent("darb:saved", { bubbles: true, detail: { kind, id } }));
