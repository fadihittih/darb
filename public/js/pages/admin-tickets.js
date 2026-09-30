// /admin "Site tickets": data owners edit places/<id>.ticket. Prices feed the Jordan Pass card. Every change is logged.
import { html, raw, qs, qsa, esc } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { METHODS, validateTicket, sameData } from "../admin-validate.js";
import { mountHistory, announceSaved } from "./admin-history.js";
import { FS, TODAY, CHANGED, freshBadge, freshSummary, saveWithLog } from "./admin-common.js";

const ticketsEl = qs("#tickets");
const placeCache = new Map(); // id → place as loaded (its .ticket is the snapshot a save is guarded against)

const FORM_FIELDS = ["jod", "status", "verifiedOn", "notes", "source", "sourceUrl", "method"];

function ticketCard(p, ro) {
  const t = p.ticket || {};
  const dis = ro ? " disabled" : "";
  const k = `data-place="${esc(p.id)}"`;
  const id = (f) => `t-${esc(p.id)}-${f}`;
  return html`
    <details class="card leg ticket" data-ticket-card="${p.id}">
      <summary>${p.name}<span class="leg-meta">· ${t.label || "ticket"}</span></summary>
      <div class="leg-body">
        ${raw(p.id === "petra" ? '<p class="muted small">The Jordan Pass card prices Petra by number of days from the Jordan Pass settings, not from this ticket.</p>' : "")}
        <dl class="ticket-facts">
          <div><dt>Label</dt><dd>${t.label || "—"}</dd></div>
          <div><dt>Jordan Pass</dt><dd>${t.coveredByJordanPass ? "Covered by the Jordan Pass" : "Not covered"}</dd></div>
        </dl>
        <div class="ticket-grid">
          <div class="field"><label for="${raw(id("jod"))}">Price (JOD)</label>
            <input class="input" id="${raw(id("jod"))}" type="number" min="0" step="any" inputmode="decimal" placeholder="unknown" ${raw(k)} data-f="jod" value="${t.jod == null ? "" : t.jod}"${raw(dis)}></div>
          <div class="field"><label for="${raw(id("status"))}">Status</label>
            <select class="select" id="${raw(id("status"))}" ${raw(k)} data-f="status"${raw(dis)}>
              <option value="verified"${t.status === "verified" ? " selected" : ""}>verified</option>
              <option value="est"${t.status !== "verified" ? " selected" : ""}>est.</option></select></div>
          <div class="field"><label for="${raw(id("verifiedOn"))}">Verified on</label>
            <input class="input" id="${raw(id("verifiedOn"))}" type="date" ${raw(k)} data-f="verifiedOn" value="${t.verifiedOn || ""}"${raw(dis)}>
            <span class="fresh-slot" ${raw(k)} data-fresh>${raw(freshBadge(t))}</span></div>
          <div class="field"><label for="${raw(id("method"))}">Method</label>
            <select class="select" id="${raw(id("method"))}" ${raw(k)} data-f="method"${raw(dis)}>
              <option value=""${t.method ? "" : " selected"}>—</option>
              ${raw(METHODS.map((m) => `<option value="${m}"${t.method === m ? " selected" : ""}>${m}</option>`).join(""))}</select></div>
          <div class="field ticket-wide"><label for="${raw(id("source"))}">Source</label>
            <input class="input" id="${raw(id("source"))}" type="text" maxlength="200" ${raw(k)} data-f="source" value="${t.source || ""}"${raw(dis)}></div>
          <div class="field ticket-wide"><label for="${raw(id("sourceUrl"))}">Source URL</label>
            <input class="input" id="${raw(id("sourceUrl"))}" type="url" maxlength="300" placeholder="https://…" ${raw(k)} data-f="sourceUrl" value="${t.sourceUrl || ""}"${raw(dis)}></div>
          <div class="field ticket-wide"><label for="${raw(id("notes"))}">Notes</label>
            <input class="input" id="${raw(id("notes"))}" type="text" maxlength="300" ${raw(k)} data-f="notes" value="${t.notes || ""}"${raw(dis)}></div>
        </div>
        <div class="leg-foot">
          <button type="button" class="btn btn-primary btn-sm" data-save-ticket="${p.id}"${ro ? " disabled" : ""}>Save</button>
          <p class="leg-error" role="alert" data-ticket-error="${p.id}" hidden></p>
        </div>
        <p class="leg-warn" role="status" data-ticket-warn="${p.id}" hidden></p>
      </div>
    </details>`;
}

const ticketSummary = () => freshSummary([...placeCache.values()].map((p) => p.ticket || {}));

/** Render the section: note, freshness line, one card per place sorted by name. ro = debug preview (never writes). */
export function renderTickets(places, { ro, email }) {
  placeCache.clear();
  const sorted = [...places].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach((p) => placeCache.set(p.id, p));
  ticketsEl.innerHTML =
    html`<h2 class="admin-h2">Site tickets</h2>
    <p class="card ticket-note">Ticket prices feed the Jordan Pass card (“Bought separately”). A change here changes what travellers see within 6 hours.</p>` +
    (ro ? html`<p class="card debug-note">Debug preview — seed tickets from /data/places.json, read-only. Nothing is saved.</p>` : "") +
    html`<p class="fresh-summary" id="ticket-fresh-summary"></p>` +
    `<div class="stack" id="ticket-list">${sorted.map((p) => ticketCard(p, ro)).join("")}</div>`;
  qs("#ticket-fresh-summary", ticketsEl).textContent = ticketSummary();
  if (!ro) for (const b of qsa("[data-save-ticket]", ticketsEl)) b.addEventListener("click", () => saveTicket(b.dataset.saveTicket, email, b));
  for (const p of sorted) {
    mountHistory(qs(`[data-ticket-card="${CSS.escape(p.id)}"] .leg-body`, ticketsEl), {
      kind: "place", id: p.id, ro, findInput: (f, name) => (f.kind === "ticket" ? input(p.id, name) : null)
    });
  }
}

/** Signed-in: read the live places (not the 6 h traveller cache) and render them editable. */
export async function loadTickets(email) {
  const [{ db }, { collection, getDocs }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
  const snap = await getDocs(collection(db, "places"));
  renderTickets(snap.docs.map((d) => ({ ...d.data(), id: d.id })), { ro: false, email });
}

const input = (placeId, f) => qs(`[data-place="${CSS.escape(placeId)}"][data-f="${f}"]`, ticketsEl);

async function saveTicket(placeId, email, btn) {
  const place = placeCache.get(placeId);
  const errEl = qs(`[data-ticket-error="${CSS.escape(placeId)}"]`, ticketsEl);
  const warnEl = qs(`[data-ticket-warn="${CSS.escape(placeId)}"]`, ticketsEl);
  errEl.hidden = true;
  warnEl.hidden = true;
  const opened = place.ticket || {}; // the snapshot this form was built from
  const r = input(placeId, "jod").validity.badInput ? { error: `${opened.label || place.name}: the price must be a number.` }
    : validateTicket(opened, Object.fromEntries(FORM_FIELDS.map((f) => [f, input(placeId, f).value.trim()])), TODAY);
  if (r.error) {
    errEl.textContent = r.error;
    errEl.hidden = false;
    return;
  }
  if (r.warnings.length) { // shown, never blocking
    warnEl.textContent = `Check: ${r.warnings.join(" ")}`;
    warnEl.hidden = false;
  }
  if (!r.changes.length) {
    toast("No changes to save");
    return;
  }
  btn.disabled = true;
  try {
    const [{ db }, { doc }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
    const operator = email.split("@")[1];
    const entries = r.changes.map((c) => ({ operator, legId: "", placeId, field: `ticket.${c.field}`, from: c.from, to: c.to, fromValue: c.fromValue, toValue: c.toValue, by: email }));
    await saveWithLog(doc(db, "places", placeId), (live) => sameData(live.ticket, place.ticket), { ticket: r.ticket }, entries);
    place.ticket = r.ticket;
    qs(`[data-fresh][data-place="${CSS.escape(placeId)}"]`, ticketsEl).innerHTML = freshBadge(r.ticket);
    qs("#ticket-fresh-summary", ticketsEl).textContent = ticketSummary();
    toast("Saved · travellers see it within 6 hours");
    announceSaved(qs(`[data-ticket-card="${CSS.escape(placeId)}"]`, ticketsEl), "place", placeId);
  } catch (e) {
    console.warn("Darb: ticket save failed", e);
    errEl.textContent = e.code === CHANGED ? "This ticket changed since you opened it — reload the page to see the latest, then redo your edit."
      : e.code === "permission-denied" ? "Your account isn’t allowed to change this data." : "Couldn’t save. Check your connection and try again.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}
