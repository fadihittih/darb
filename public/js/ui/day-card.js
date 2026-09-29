// Day card used on 03 Reality Check, 04 Fixed plan and the shared trip page.
import { esc } from "./dom.js";
import { statusPill } from "./pills.js";

const WHY_TITLE = { nf: "Why it breaks", risky: "Why it's risky", info: "Good to know", ok: "Good to know" };

/**
 * dayCard({ n, title, sub, status, why, fixes, itemsHtml, footHtml }) → HTML string.
 * - title / sub / why.text / fix fields are plain text (escaped here).
 * - why = { title?, text } → .why-box (title defaults to "Why it breaks" / "Why it's risky").
 * - fixes = [{ id, tag, label, sub, costText, selected }] → "Choose a fix" grid of
 *   <button class="fix-card" data-fix="id" aria-pressed>. Pages attach the click handlers.
 * - itemsHtml / footHtml are trusted HTML (e.g. .item-row list, links) inserted as-is.
 * - status omitted → no pill (e.g. fixed-plan cards).
 */
export function dayCard({ n, title = "", sub = "", status = "", why = null, fixes = null, itemsHtml = "", footHtml = "" } = {}) {
  const st = ["ok", "risky", "nf", "info"].includes(status) ? status : "";
  const whyHtml = why && why.text
    ? `<div class="why-box ${st === "nf" || st === "risky" ? st : ""}">
        <p class="why-title">${esc(why.title || WHY_TITLE[st] || "Why")}</p>
        <p>${esc(why.text)}</p>
      </div>`
    : "";
  const fixHtml = Array.isArray(fixes) && fixes.length
    ? `<div class="fix-block">
        <p class="fix-heading">Choose a fix</p>
        <div class="fix-grid">${fixes.map((f) => `
          <button type="button" class="fix-card${f.selected ? " selected" : ""}" data-fix="${esc(f.id)}" aria-pressed="${f.selected ? "true" : "false"}">
            ${f.tag ? `<span class="fix-tag">${esc(f.tag)}</span>` : ""}
            <span class="fix-label">${esc(f.label)}</span>
            ${f.sub ? `<span class="fix-sub">${esc(f.sub)}</span>` : ""}
            ${f.costText ? `<span class="fix-cost">${esc(f.costText)}</span>` : ""}
          </button>`).join("")}
        </div>
      </div>`
    : "";
  return `
    <article class="day-card${st ? " " + st : ""}" data-day="${esc(n)}">
      <header class="day-head">
        <span class="day-badge">Day ${esc(n)}</span>
        <div class="day-titles">
          <h3 class="day-title">${esc(title)}</h3>
          ${sub ? `<p class="day-sub">${esc(sub)}</p>` : ""}
        </div>
        ${st ? `<div class="day-status">${statusPill(st)}</div>` : ""}
      </header>
      ${whyHtml}${fixHtml}
      ${itemsHtml ? `<div class="day-items">${itemsHtml}</div>` : ""}
      ${footHtml ? `<div class="day-foot">${footHtml}</div>` : ""}
    </article>`;
}
