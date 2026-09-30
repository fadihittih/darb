// /admin form pieces shared by legs and tickets: labelled fields, the save bar, "Unsaved changes" tracking.
// DOM contract (one scheme for both kinds): inside a detail panel [data-detail][data-kind][data-id],
// inputs carry data-f="<field>" (plus data-i="<option index>" on legs); [data-save], [data-error], [data-warn], [data-dirty].
import { html, raw, qs, qsa } from "../ui/dom.js";
import { METHODS } from "../admin-validate.js";

/** Labelled input. data = trusted attribute string (data-f / data-i); hint = help line under the label. */
export function field({ id, label, hint = "", type = "text", value = "", data, ro, attrs = "", cls = "" }) {
  const hintId = hint ? `${id}-hint` : "";
  return html`<div class="field ${cls}">
    <label for="${id}">${label}</label>
    <input class="input" id="${id}" type="${type}" value="${value}" ${raw(data)} ${raw(attrs)}${hintId ? raw(` aria-describedby="${hintId}"`) : ""}${ro ? raw(" disabled") : ""}>
    ${hint ? raw(html`<span class="field-hint" id="${hintId}">${hint}</span>`) : ""}
  </div>`;
}

/** Labelled select from [value, text] pairs. */
export function selectField({ id, label, hint = "", value = "", data, ro, choices, cls = "" }) {
  const hintId = hint ? `${id}-hint` : "";
  return html`<div class="field ${cls}">
    <label for="${id}">${label}</label>
    <select class="select" id="${id}" ${raw(data)}${hintId ? raw(` aria-describedby="${hintId}"`) : ""}${ro ? raw(" disabled") : ""}>
      ${raw(choices.map(([v, t]) => html`<option value="${v}"${v === value ? raw(" selected") : ""}>${t}</option>`).join(""))}
    </select>
    ${hint ? raw(html`<span class="field-hint" id="${hintId}">${hint}</span>`) : ""}
  </div>`;
}

/** The evidence fields both kinds share: status, verified on, method, source, source URL. */
export function evidenceFields(v, { id, data, ro }) {
  return html`<div class="fgrid fgrid-3">
      ${raw(selectField({ id: id("status"), label: "Status", data: data("status"), ro, value: v.status === "verified" ? "verified" : "est",
        choices: [["verified", "verified"], ["est", "est."]], hint: "“verified” needs a date, a source URL and a method" }))}
      ${raw(field({ id: id("verifiedOn"), label: "Verified on", type: "date", value: v.verifiedOn || "", data: data("verifiedOn"), ro,
        hint: "The day someone checked the source" }))}
      ${raw(selectField({ id: id("method"), label: "Method", data: data("method"), ro, value: v.method || "",
        choices: [["", "—"], ...METHODS.map((m) => [m, m])], hint: "How it was checked" }))}
    </div>
    <div class="fgrid fgrid-2">
      ${raw(field({ id: id("source"), label: "Source", value: v.source || "", data: data("source"), ro, attrs: 'maxlength="200"',
        hint: "Who or what says so, in a few words" }))}
      ${raw(field({ id: id("sourceUrl"), label: "Source URL", type: "url", value: v.sourceUrl || "", data: data("sourceUrl"), ro,
        attrs: 'maxlength="300" placeholder="https://…"', hint: "The page or document that shows the value" }))}
    </div>`;
}

/** Save bar of one item: the error and warning lines, the "Unsaved changes" hint (a status region from the start), Save. */
export function saveBar(ro) {
  return html`<div class="save-bar" data-savebar>
    <div class="save-msgs">
      <p class="save-dirty-line"><span class="save-dot" aria-hidden="true">●</span><span class="save-dirty" role="status" data-dirty>${ro ? "Read-only preview — nothing is saved." : ""}</span></p>
      <p class="save-error" role="alert" data-error hidden></p>
      <p class="save-warn" role="status" data-warn hidden></p>
    </div>
    <button type="button" class="btn btn-primary" data-save${ro ? raw(" disabled") : ""}>Save changes</button>
  </div>`;
}

/** Run a save with the panel's inputs disabled, so nothing typed during it is taken as the saved baseline. */
export async function lockInputs(panel, fn) {
  const els = qsa("[data-f]", panel).filter((el) => !el.disabled);
  els.forEach((el) => { el.disabled = true; });
  try { await fn(); } finally { els.forEach((el) => { el.disabled = false; }); }
}

/**
 * Watch a panel's [data-f] inputs against a snapshot of their values. onChange(dirty) runs when that flips.
 * → { reset() } — call after a save so the saved values become the new baseline.
 */
export function trackDirty(panel, onChange) {
  const inputs = () => qsa("[data-f]", panel);
  let base = new Map();
  let dirty = false;
  const hint = qs("[data-dirty]", panel);
  const check = () => {
    const now = inputs().some((el) => el.value !== base.get(el));
    if (now === dirty) return;
    dirty = now;
    hint.textContent = dirty ? "Unsaved changes" : "";
    panel.classList.toggle("is-dirty", dirty);
    onChange(dirty);
  };
  const reset = () => {
    base = new Map(inputs().map((el) => [el, el.value]));
    check();
  };
  panel.addEventListener("input", check);
  panel.addEventListener("change", check);
  reset();
  return { reset };
}
