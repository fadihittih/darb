// Renderers shared by 04 Fixed plan (fixed.html) and the shared read-only trip page (trip.html).
// All functions return HTML strings; text is escaped through html``.
import { html, raw } from "../ui/dom.js";
import { icon, modeIcon, placeIcon } from "../ui/icons.js";
import { dayCard } from "../ui/day-card.js";
import { fmtRange, monthName } from "../engine/format.js";
import { seasonal } from "../weather.js";

/** Reference for a leg in links / confirmations: the seed leg id if it has one, else the "from~to" key. */
export const legRef = (item) => item.legId || item.legKey;

function costHtml(item) {
  const text = item.costText || "";
  if (!text) return "";
  if (item.kind === "leg") {
    return item.verified
      ? html`<span class="item-cost cost-verified">${text} <span aria-hidden="true">✓</span><span class="sr-only">(verified)</span></span>`
      : html`<span class="item-cost cost-est">${text}</span>`;
  }
  // Visits: "Jordan Pass", "Beach fee on site", "Free", "3 JOD" (verified) or "est. 5 JOD".
  if (/^est\./.test(text)) return html`<span class="item-cost cost-est">${text}</span>`;
  if (item.verified && /JOD/.test(text)) {
    return html`<span class="item-cost cost-verified">${text} <span aria-hidden="true">✓</span><span class="sr-only">(verified)</span></span>`;
  }
  return html`<span class="item-cost">${text}</span>`;
}

function itemRow(item, { editable, tripId, local, day }) {
  const ic = item.kind === "leg" ? modeIcon(item.mode) : placeIcon(item.placeId);
  const inner = html`
    <span class="item-icon">${raw(icon(ic))}</span>
    <div class="item-main">
      <p class="item-label">${item.label}</p>
      ${item.sub ? raw(html`<p class="item-sub">${item.sub}</p>`) : ""}
    </div>
    ${raw(costHtml(item))}`;
  if (item.kind === "leg" && editable && (tripId || local) && item.legKey) {
    const who = tripId ? `t=${encodeURIComponent(tripId)}` : "local=1";
    const href = `/leg.html?${who}&day=${encodeURIComponent(day)}&leg=${encodeURIComponent(item.legKey)}`;
    return html`<a class="item-row item-link" href="${href}">${raw(inner)}<span class="item-chev">${raw(icon("arrow-right"))}<span class="sr-only">See all transport options</span></span></a>`;
  }
  return html`<div class="item-row">${raw(inner)}</div>`;
}

function confirmRow(item, answered) {
  const ref = legRef(item);
  const done = answered?.(ref);
  return html`
    <div class="confirm-row" data-leg="${ref}">
      <span class="confirm-q">Was this transport there?</span>
      <span class="confirm-btns">
        <button type="button" class="btn btn-secondary btn-xs" data-answer="yes"${raw(done ? " disabled" : "")}>Yes</button>
        <button type="button" class="btn btn-secondary btn-xs" data-answer="no"${raw(done ? " disabled" : "")}>No</button>
      </span>
      ${done ? raw(html`<span class="confirm-done small muted">Thanks — noted.</span>`) : ""}
    </div>`;
}

/**
 * renderFixedDays(fixed, model, { editable, tripId, local, confirm, answered }) → HTML.
 * editable: leg rows link to leg.html (?t=<tripId>, or ?local=1 for an unsaved trip in sessionStorage). confirm: add the post-trip "Was this transport there?" row under each leg
 * (answered(ref) → true disables its buttons).
 */
export function renderFixedDays(fixed, model, { editable = false, tripId = "", local = false, confirm = false, answered = null } = {}) {
  return (fixed?.days || []).map((d) => {
    const items = (d.items || []).map((it) => {
      const row = itemRow(it, { editable, tripId, local, day: d.n });
      return confirm && it.kind === "leg" ? row + confirmRow(it, answered) : row;
    }).join("");
    return dayCard({ n: d.n, title: d.title, itemsHtml: items }); // no status pill: every fixed day is OK (green badge)
  }).join("");
}

/** "What changed" list from fixed.changes. Empty string when nothing changed. */
export function renderChanges(fixed) {
  const ch = fixed?.changes || [];
  if (!ch.length) return "";
  return html`
    <section class="card changes-card" aria-labelledby="changes-title">
      <h2 class="side-title" id="changes-title">What changed</h2>
      <ul class="changes-list">
        ${ch.map((c) => html`<li><span class="changes-day">Day ${c.day}</span><span>${c.text}</span></li>`).map(raw)}
      </ul>
    </section>`;
}

export function scoreHeadline(score) {
  if (score >= 85) return "Ready to travel";
  if (score >= 60) return "Almost there";
  return "This plan won’t work as written";
}
export const ringClass = (score) => (score >= 85 ? "good" : score < 60 ? "bad" : "");

/** Top-right score card: ring + "Reality Score / Ready to travel / 2 fixes applied · 0 issues left". */
export function renderScoreCard(fixed, check) {
  const score = Number(fixed?.score) || 0;
  const n = Number(fixed?.fixesApplied) || 0;
  const left = check?.counts ? (check.counts.nf || 0) + (check.counts.risky || 0) : 0;
  return html`
    <div class="score-ring ${ringClass(score)}" aria-hidden="true">${score}</div>
    <div>
      <p class="score-kicker">Reality Score<span class="sr-only"> ${score} out of 100</span></p>
      <p class="score-head">${scoreHeadline(score)}</p>
      <p class="small muted">${n} ${n === 1 ? "fix" : "fixes"} applied · ${left} ${left === 1 ? "issue" : "issues"} left</p>
    </div>`;
}

/** Trip cost card (§4.6). */
export function renderCostCard(cost) {
  if (!cost) return "";
  const [tMin, tMax] = cost.transfers || [0, 0];
  const rows = [
    html`<div class="cost-row"><span>${cost.pass?.label || "Jordan Pass"}</span><span>${cost.passJod} JOD</span></div>`
  ];
  if (cost.busJod > 0) {
    rows.push(html`<div class="cost-row"><span>JETT bus</span><span class="cost-verified">${cost.busJod} JOD <span aria-hidden="true">✓</span><span class="sr-only">(verified)</span></span></div>`);
  }
  if (tMax > 0) {
    rows.push(html`<div class="cost-row"><span>Transfers &amp; drivers</span><span class="cost-est">est. ${fmtRange([tMin, tMax])}</span></div>`);
  }
  if (cost.unknownLegs > 0) {
    rows.push(html`<div class="cost-row"><span>${cost.unknownLegs} ${cost.unknownLegs === 1 ? "leg" : "legs"} priced on the day</span><span class="muted">not included</span></div>`);
  }
  const total = cost.total || [0, 0];
  return html`
    <section class="card side-card cost-card" aria-labelledby="cost-title">
      <h2 class="side-title" id="cost-title">Trip cost</h2>
      <div class="cost-rows">${rows.map(raw)}</div>
      <div class="cost-total">
        <span>Estimated total</span>
        <strong>${total[0] === total[1] ? `${total[0]} JOD` : `${total[0]}–${total[1]} JOD`}</strong>
      </div>
      ${cost.savings > 0 ? raw(html`<p class="cost-save">You save ~${cost.savings} JOD with the Jordan Pass</p>`) : ""}
      <p class="side-note">Excludes camp, meals and small site fees. Estimates show ranges until verified; every price shows its last-verified date.</p>
    </section>`;
}

/** Distinct places visited in the fixed plan, in order (airports excluded). */
export function tripPlaces(fixed, model) {
  const seen = new Set();
  const out = [];
  for (const d of fixed?.days || []) {
    for (const it of d.items || []) {
      if (it.kind === "visit" && model.byId[it.placeId] && !seen.has(it.placeId)) {
        seen.add(it.placeId);
        out.push(model.byId[it.placeId]);
      }
    }
  }
  return out;
}

/**
 * Weather & what to pack card. live = forecast() result ({ [id]: {day, night} }) or null;
 * liveFailed = a forecast was attempted and failed (then say we fell back to seasonal).
 */
export function renderWeatherCard(places, month, { live = null, liveFailed = false } = {}) {
  const rows = places.map((p) => {
    const s = seasonal(p, month);
    const l = live?.[p.id];
    const day = l && l.day != null ? l.day : s.day;
    const night = l && l.night != null ? l.night : s.night;
    const temps = day != null ? `${day}° / ${night ?? "–"}°` : "";
    return html`
      <li class="wx-row">
        <span class="item-icon">${raw(icon(placeIcon(p.id)))}</span>
        <div class="item-main">
          <p class="item-label">${p.name}</p>
          ${s.tip ? raw(html`<p class="item-sub">${s.tip}</p>`) : ""}
        </div>
        <span class="wx-temp"${raw(temps ? ` aria-label="${`Day ${day}°, night ${night ?? "unknown"}°`}"` : "")}>${temps}</span>
      </li>`;
  });
  const note = live
    ? "Live forecast from Open-Meteo for your travel dates (daily high / low)."
    : liveFailed
      ? "Live forecast unavailable right now — showing seasonal averages per site."
      : "Seasonal averages per site; live 7-day forecast appears when your trip is within a week.";
  return html`
    <section class="card side-card wx-card" aria-labelledby="wx-title">
      <div class="side-head">
        <h2 class="side-title" id="wx-title">Weather &amp; what to pack</h2>
        <span class="small muted">${live ? "Live forecast" : monthName(Number(month)) || ""}</span>
      </div>
      <ul class="plain-list wx-list">${rows.map(raw)}</ul>
      <p class="side-note">${note}</p>
    </section>`;
}

/** Friendly "not found" card. */
export function notFoundCard(message = "We couldn’t find that plan") {
  return html`
    <section class="card empty-card">
      <h1 class="empty-title">${message}</h1>
      <p class="muted">The link may be mistyped, or the plan was never saved. Plans are private: only people with the exact link can open one.</p>
      <div class="row">
        <a class="btn btn-primary" href="/plan.html">Check a plan</a>
        <a class="btn btn-secondary" href="/build.html">Build a plan</a>
      </div>
    </section>`;
}
