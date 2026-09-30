// /admin "Recent changes": the latest 30 operatorUpdates across every leg and ticket, grouped by day (Amman time).
// Public data, so it also loads in ?debug=1. Entries: button[data-change][data-kind][data-id] open that leg or site.
import { html, raw, qs } from "../ui/dom.js";
import { updateWhat } from "../admin-validate.js";
import { FS } from "./admin-common.js";
import { dayText, clockText, valueText } from "./admin-history.js";

const LIMIT = 30;
const EMPTY = "No changes recorded yet — every saved edit appears here and on the Ministry dashboard.";

/**
 * el = the tab panel's body. resolve(update) → { kind: "leg"|"ticket", id, name, labels } or null (unknown item).
 * open(kind, id) switches to that item. → { show(), stale() }.
 */
export function mountActivity(el, { resolve, open }) {
  el.innerHTML = html`<div class="act-body" aria-live="polite"></div>`;
  const out = qs(".act-body", el);
  let loaded = false;
  let shown = false;
  let seq = 0;

  function render(updates) {
    if (!updates.length) return html`<p class="act-msg muted">${EMPTY}</p>`;
    const days = [];
    for (const u of updates) {
      const d = u.at?.toDate?.();
      const day = d ? dayText(d) : "Date pending";
      if (days.at(-1)?.day !== day) days.push({ day, items: [] });
      days.at(-1).items.push({ u, d });
    }
    return days.map(({ day, items }) => html`
      <section class="act-day">
        <h3 class="act-day-h">${day}</h3>
        <ol class="timeline act-list">${items.map(({ u, d }) => {
          const it = resolve(u);
          const inner = html`
            <span class="tl-meta"><span class="act-time">${d ? clockText(d) : ""}</span> · ${u.by || u.operator || ""}</span>
            <span class="act-what"><strong>${it ? it.name : u.legId || u.placeId || "—"}</strong> · ${updateWhat(u, it?.labels || [])}</span>
            <span class="tl-change"><span class="tl-from">${raw(valueText(u.from))}</span> <span aria-hidden="true">→</span><span class="sr-only">to</span> <span class="tl-to">${raw(valueText(u.to))}</span></span>`;
          return html`<li class="tl-item"><span class="tl-dot" aria-hidden="true"></span>${it
            ? raw(html`<button type="button" class="act-link" data-change data-kind="${it.kind}" data-id="${it.id}">${raw(inner)}</button>`)
            : raw(html`<div class="act-link act-static">${raw(inner)}</div>`)}</li>`;
        }).map(raw)}</ol>
      </section>`).join("");
  }

  async function load() {
    const mine = ++seq;
    out.innerHTML = html`<p class="act-msg muted">Loading…</p>`;
    try {
      const [{ db }, { collection, query, orderBy, limit, getDocs }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
      const snap = await getDocs(query(collection(db, "operatorUpdates"), orderBy("at", "desc"), limit(LIMIT)));
      if (mine !== seq) return;
      loaded = true;
      out.innerHTML = render(snap.docs.map((x) => x.data()));
    } catch (e) {
      if (mine !== seq) return;
      console.warn("Darb: recent changes load failed", e);
      out.innerHTML = html`<p class="act-msg hist-error">Couldn’t load the recent changes. Check your connection and try again.</p>`;
    }
  }

  out.addEventListener("click", (e) => {
    const b = e.target.closest("[data-change]");
    if (b) open(b.dataset.kind, b.dataset.id);
  });
  return {
    show() { shown = true; if (!loaded) load(); },
    stale() { loaded = false; if (shown && !el.closest("[hidden]")) load(); }
  };
}
