// /admin "Site tickets": data owners edit places/<id>.ticket. Prices feed the Jordan Pass card. Every change is logged.
import { html, raw, qs, esc } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { icon, placeIcon } from "../ui/icons.js";
import { validateTicket, sameData } from "../admin-validate.js";
import { FS, TODAY, CHANGED, freshBlock, saveWithLog } from "./admin-common.js";
import { field, evidenceFields, saveBar } from "./admin-form.js";
import { miniMap } from "./admin-map.js";

const FORM_FIELDS = ["jod", "status", "verifiedOn", "notes", "source", "sourceUrl", "method"];

export const TICKETS_NOTE = "Ticket prices feed the Jordan Pass card (“Bought separately”). A change here changes what travellers see within 6 hours.";
const PETRA_NOTE = "The Jordan Pass card prices Petra by number of days from the Jordan Pass settings, not from this ticket.";

/** The site's detail panel: header (map pin, Jordan Pass coverage), one ticket card, save bar, History. */
export function ticketDetail(p, { ro }) {
  const t = p.ticket || {};
  const data = (f) => `data-f="${f}"`;
  const id = (f) => `f-ticket-${esc(p.id)}-${f}`;
  return html`
    <div class="detail" data-detail data-kind="ticket" data-id="${p.id}" hidden>
      <header class="detail-head card">
        <div class="detail-text">
          <p class="eyebrow">Site ticket</p>
          <h3 class="detail-title" tabindex="-1">${p.name}</h3>
          <p class="detail-places">${raw(icon("pin"))}<span>${p.name}, Jordan</span></p>
          <p class="detail-badges">
            ${t.coveredByJordanPass ? raw('<span class="pill ok"><span class="pill-glyph" aria-hidden="true">✓</span>Covered by the Jordan Pass</span>')
              : raw('<span class="pill info">Not covered by the Jordan Pass</span>')}
          </p>
          ${p.id === "petra" ? raw(html`<p class="detail-note">${PETRA_NOTE}</p>`) : ""}
        </div>
        <div class="detail-map">${raw(miniMap([p]))}</div>
      </header>
      <div class="opt-list">
        <article class="opt-card" aria-labelledby="${id("title")}">
          <header class="opt-head">
            <span class="opt-icon">${raw(icon(placeIcon(p.id)))}</span>
            <div class="opt-name">
              <h4 id="${id("title")}">${t.label || "Ticket"}</h4>
              <p class="opt-tags"><span class="op-chip">Entry ticket</span></p>
            </div>
            <div class="opt-fresh fresh-slot" data-fresh>${raw(freshBlock(t))}</div>
          </header>
          <div class="opt-body">
            <fieldset class="fgroup"><legend>Price</legend>
              <div class="fgrid fgrid-2">
                ${raw(field({ id: id("jod"), label: "Price (JOD)", type: "number", value: t.jod == null ? "" : t.jod, data: data("jod"), ro,
                  attrs: 'min="0" step="any" inputmode="decimal" placeholder="unknown"', hint: "Empty when the price is unknown" }))}
              </div>
            </fieldset>
            <fieldset class="fgroup"><legend>Evidence</legend>
              ${raw(evidenceFields(t, { id, data, ro }))}
            </fieldset>
            <fieldset class="fgroup"><legend>Notes</legend>
              ${raw(field({ id: id("notes"), label: "Notes", value: t.notes || "", data: data("notes"), ro, attrs: 'maxlength="300"' }))}
            </fieldset>
          </div>
        </article>
      </div>
      ${raw(saveBar(ro))}
      <section class="card detail-hist" data-history aria-label="History"></section>
    </div>`;
}

/** Signed-in: the live places (not the 6 h traveller cache). */
export async function fetchPlaces() {
  const [{ db }, { collection, getDocs }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
  const snap = await getDocs(collection(db, "places"));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export const ticketInput = (panel, f) => qs(`[data-f="${f}"]`, panel);

/** Save with the concurrency guard (saveWithLog). → true when something was written. */
export async function saveTicket(panel, place, email) {
  const btn = qs("[data-save]", panel);
  const errEl = qs("[data-error]", panel);
  const warnEl = qs("[data-warn]", panel);
  errEl.hidden = true;
  warnEl.hidden = true;
  const opened = place.ticket || {}; // the snapshot this form was built from
  const r = ticketInput(panel, "jod").validity.badInput ? { error: `${opened.label || place.name}: the price must be a number.` }
    : validateTicket(opened, Object.fromEntries(FORM_FIELDS.map((f) => [f, ticketInput(panel, f).value.trim()])), TODAY);
  if (r.error) {
    errEl.textContent = r.error;
    errEl.hidden = false;
    return false;
  }
  if (r.warnings.length) { // shown, never blocking
    warnEl.textContent = `Check: ${r.warnings.join(" ")}`;
    warnEl.hidden = false;
  }
  if (!r.changes.length) {
    toast("No changes to save");
    return false;
  }
  btn.disabled = true;
  try {
    const [{ db }, { doc }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
    const operator = email.split("@")[1];
    const entries = r.changes.map((c) => ({ operator, legId: "", placeId: place.id, field: `ticket.${c.field}`, from: c.from, to: c.to, fromValue: c.fromValue, toValue: c.toValue, by: email }));
    await saveWithLog(doc(db, "places", place.id), (live) => sameData(live.ticket, place.ticket), { ticket: r.ticket }, entries);
    place.ticket = r.ticket;
    qs("[data-fresh]", panel).innerHTML = freshBlock(r.ticket);
    toast("Saved · travellers see it within 6 hours");
    return true;
  } catch (e) {
    console.warn("Darb: ticket save failed", e);
    errEl.textContent = e.code === CHANGED ? "This ticket changed since you opened it — reload the page to see the latest, then redo your edit."
      : e.code === "permission-denied" ? "Your account isn’t allowed to change this data." : "Couldn’t save. Check your connection and try again.";
    errEl.hidden = false;
    return false;
  } finally {
    btn.disabled = false;
  }
}
