// /admin "Transport legs": the detail panel of one leg (header, one card per option, save bar, History) and its save.
import { html, raw, qs, esc } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { icon, modeIcon } from "../ui/icons.js";
import { fmtDuration } from "../engine/format.js";
import { validateOption, sameData } from "../admin-validate.js";
import { FS, TODAY, CHANGED, freshBlock, saveWithLog } from "./admin-common.js";
import { field, evidenceFields, saveBar } from "./admin-form.js";
import { miniMap } from "./admin-map.js";

const PT = {
  scheduled: ["ok", "✓", "Scheduled public transport"],
  limited: ["risky", "!", "Limited public transport"],
  none: ["nf", "✕", "No public transport"]
};

/** One option as a card: head (mode, label, operator, freshness + meter), then Price / Schedule / Evidence / Notes. */
function optionCard(leg, o, i, ro) {
  const data = (f) => `data-f="${f}" data-i="${i}"`;
  const id = (f) => `f-leg-${esc(leg.id)}-${i}-${f}`;
  const cost = Array.isArray(o.cost) ? o.cost : ["", ""];
  return html`
    <article class="opt-card" data-option="${i}" aria-labelledby="${id("title")}">
      <header class="opt-head">
        <span class="opt-icon">${raw(icon(modeIcon(o.mode)))}</span>
        <div class="opt-name">
          <h4 id="${id("title")}">${o.label}</h4>
          <p class="opt-tags">${o.operator ? raw(html`<span class="op-chip">${o.operator}</span>`) : ""}${o.recommended ? raw('<span class="op-chip op-rec">Recommended</span>') : ""}</p>
        </div>
        <div class="opt-fresh fresh-slot" data-fresh data-i="${i}">${raw(freshBlock(o))}</div>
      </header>
      <div class="opt-body">
        <div class="fgroups">
          <fieldset class="fgroup"><legend>Price</legend>
            <div class="fgrid fgrid-2">
              ${raw(field({ id: id("costMin"), label: "Cost min (JOD)", type: "number", value: cost[0], data: data("costMin"), ro, attrs: 'min="0" step="any" inputmode="decimal"' }))}
              ${raw(field({ id: id("costMax"), label: "Cost max (JOD)", type: "number", value: cost[1], data: data("costMax"), ro, attrs: 'min="0" step="any" inputmode="decimal"' }))}
            </div>
            <p class="field-hint">Leave both empty when the price is unknown.</p>
          </fieldset>
          <fieldset class="fgroup"><legend>Schedule</legend>
            ${raw(field({ id: id("departs"), label: "Departs", value: o.departs || "", data: data("departs"), ro,
              attrs: 'placeholder="HH:MM" maxlength="5" inputmode="numeric"', hint: "24-hour time of a single daily departure; empty if none" }))}
          </fieldset>
        </div>
        <fieldset class="fgroup"><legend>Evidence</legend>
          ${raw(evidenceFields(o, { id, data, ro }))}
        </fieldset>
        <fieldset class="fgroup"><legend>Notes</legend>
          ${raw(field({ id: id("notes"), label: "Notes for travellers", value: o.notes || "", data: data("notes"), ro, attrs: 'maxlength="300"' }))}
        </fieldset>
      </div>
    </article>`;
}

/** The leg's detail panel (without History content, which admin-history.js fills). */
export function legDetail(leg, { ro, placeName, byId }) {
  const opts = leg.options || [];
  const [cls, glyph, text] = PT[leg.publicTransport] || PT.none;
  const from = placeName(leg.from), to = placeName(leg.to);
  return html`
    <div class="detail" data-detail data-kind="leg" data-id="${leg.id}" hidden>
      <header class="detail-head card">
        <div class="detail-text">
          <p class="eyebrow">Transport leg</p>
          <h3 class="detail-title" tabindex="-1">${from} <span aria-hidden="true">→</span><span class="sr-only">to</span> ${to}</h3>
          <p class="detail-places">${raw(icon("pin"))}<span>From <strong>${from}</strong> to <strong>${to}</strong></span></p>
          <p class="detail-badges">
            <span class="pill ${cls}"><span class="pill-glyph" aria-hidden="true">${glyph}</span>${text}</span>
            ${leg.driveMin ? raw(html`<span class="pill info">${raw(icon("clock"))}${fmtDuration(leg.driveMin)} by road</span>`) : ""}
            <span class="pill info">${opts.length} ${opts.length === 1 ? "option" : "options"}</span>
          </p>
        </div>
        <div class="detail-map">${raw(miniMap([byId[leg.from], byId[leg.to]]))}</div>
      </header>
      <div class="detail-body">
      <div class="opt-list">${raw(opts.map((o, i) => optionCard(leg, o, i, ro)).join(""))}</div>
      ${raw(saveBar(ro))}
      <section class="card detail-hist" data-history aria-label="History"></section>
      </div>
    </div>`;
}

const FORM_FIELDS = ["costMin", "costMax", "departs", "status", "verifiedOn", "notes", "source", "sourceUrl", "method"];
export const legInput = (panel, i, f) => qs(`[data-i="${i}"][data-f="${f}"]`, panel);

/** Read one leg's form → { options, changes, warnings } or { error }. The rules live in admin-validate.js. */
function collect(panel, leg) {
  const options = [];
  const changes = [];
  const warnings = [];
  for (let i = 0; i < leg.options.length; i++) {
    const old = leg.options[i];
    if (legInput(panel, i, "costMin").validity.badInput || legInput(panel, i, "costMax").validity.badInput) return { error: `${old.label}: costs must be numbers.` };
    const input = Object.fromEntries(FORM_FIELDS.map((f) => [f, legInput(panel, i, f).value.trim()]));
    const r = validateOption(old, input, TODAY);
    if (r.error) return { error: r.error };
    for (const c of r.changes) changes.push({ ...c, operator: old.operator || "", field: `options[${i}].${c.field}` });
    warnings.push(...r.warnings);
    options.push(r.option);
  }
  return { options, changes, warnings };
}

/** Save with the concurrency guard (saveWithLog). → true when something was written. */
export async function saveLeg(panel, leg, email) {
  const btn = qs("[data-save]", panel);
  const errEl = qs("[data-error]", panel);
  const warnEl = qs("[data-warn]", panel);
  errEl.hidden = true;
  warnEl.hidden = true;
  const r = collect(panel, leg);
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
    const opened = leg.options; // the snapshot this form was built from
    const fallbackOp = email.split("@")[1];
    const entries = r.changes.map((c) => ({ operator: c.operator || fallbackOp, legId: leg.id, field: c.field, from: c.from, to: c.to, fromValue: c.fromValue, toValue: c.toValue, by: email }));
    await saveWithLog(doc(db, "legs", leg.id), (live) => sameData(live.options, opened), { options: r.options }, entries);
    leg.options = r.options;
    leg.options.forEach((o, i) => { qs(`[data-fresh][data-i="${i}"]`, panel).innerHTML = freshBlock(o); });
    toast("Saved · shown on the dashboard");
    return true;
  } catch (e) {
    console.warn("Darb: save failed", e);
    errEl.textContent = e.code === CHANGED ? "This leg changed since you opened it, reload the page to see the latest, then redo your edit."
      : e.code === "permission-denied" ? "Your account isn’t allowed to change this data." : "Couldn’t save. Check your connection and try again.";
    errEl.hidden = false;
    return false;
  } finally {
    btn.disabled = false;
  }
}
