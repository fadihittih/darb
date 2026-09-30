// /admin overview strip: four stat tiles (dashboard KPI style) and one stacked freshness bar with a text legend.
// Tester hooks: [data-stat="total|verified|expiring|stale"] .stat-value, [data-seg="…"], [data-legend="…"] .legend-n.
import { html, raw, qs } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { bucket, freshSummary } from "./admin-common.js";

const SEGS = [
  ["fresh", "✓", "Verified, fresh"],
  ["expiring", "!", "Expiring within 30 days"],
  ["stale", "✕", "Stale or undated"],
  ["est", "", "Estimates (est.)"]
];
const TILES = [
  ["total", "Values you maintain", "shield"],
  ["verified", "Verified", "check"],
  ["expiring", "Expiring within 30 days", "clock"],
  ["stale", "Stale or undated", "warn"]
];

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Render the strip into `el`; → update(options, tickets) to recount after a save. */
export function mountOverview(el) {
  el.innerHTML = html`
    <h2 class="sr-only">Overview</h2>
    <div class="ov-tiles">
      ${raw(TILES.map(([k, label, ic]) => html`
        <div class="card ov-tile" data-stat="${k}">
          <p class="ov-label"><span>${label}</span><span class="ov-icon">${raw(icon(ic))}</span></p>
          <p class="ov-value stat-value">–</p>
          <p class="ov-note" data-note></p>
        </div>`).join(""))}
    </div>
    <div class="card ov-fresh">
      <div class="ov-fresh-head">
        <h3>Freshness of every value</h3>
        <p class="ov-summary" role="status" data-summary></p>
      </div>
      <div class="fbar" aria-hidden="true">${raw(SEGS.map(([k]) => `<span class="fbar-seg fbar-${k}" data-seg="${k}"></span>`).join(""))}</div>
      <ul class="fbar-legend">
        ${raw(SEGS.map(([k, glyph, label]) => html`<li data-legend="${k}"><span class="sw sw-${k}" aria-hidden="true"></span><span class="lg-label">${glyph ? raw(html`<span class="lg-glyph lg-${k}" aria-hidden="true">${glyph}</span>`) : ""}${label}</span> <strong class="legend-n"></strong></li>`).join(""))}
      </ul>
    </div>`;

  return function update(options, tickets) {
    const values = [...options, ...tickets];
    const n = { fresh: 0, expiring: 0, stale: 0, est: 0 };
    for (const v of values) n[bucket(v)]++;
    const total = values.length;
    const verified = n.fresh + n.expiring;
    const set = (k, value, note) => {
      const tile = qs(`[data-stat="${k}"]`, el);
      qs(".stat-value", tile).textContent = value;
      qs("[data-note]", tile).textContent = note;
      tile.classList.toggle("ov-alert", k !== "total" && k !== "verified" && Number(value) > 0);
    };
    set("total", total, `${plural(options.length, "transport option", "transport options")} · ${plural(tickets.length, "site ticket", "site tickets")}`);
    set("verified", verified, `${pct(verified, total)}% of values · shown with ✓`);
    set("expiring", n.expiring, n.expiring ? "Re-check these before they turn est." : "Nothing expires in the next 30 days");
    set("stale", n.stale, n.stale ? "Travellers see these as est. until re-checked" : "No stale or undated values");
    for (const [k] of SEGS) {
      const seg = qs(`[data-seg="${k}"]`, el);
      seg.style.width = `${total ? (n[k] / total) * 100 : 0}%`;
      seg.hidden = !n[k];
      qs(`[data-legend="${k}"] .legend-n`, el).textContent = `${n[k]} · ${pct(n[k], total)}%`;
    }
    qs("[data-summary]", el).textContent = freshSummary(values);
  };
}
