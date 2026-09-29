// 01 Landing — the demo card runs Sarah's example through the real engine (never hard-coded numbers).
import { initPage } from "../ui/nav.js";
import { icon } from "../ui/icons.js";
import { statusPill } from "../ui/pills.js";
import { html, raw, qs, qsa } from "../ui/dom.js";
import { loadModel } from "../data.js";
import { parse } from "../engine/parser.js";
import { check } from "../engine/rules.js";
import { fix } from "../engine/fixer.js";
import { monthName } from "../engine/format.js";
import { shortName } from "../engine/model.js";
import { REFERENCE_TEXT, REFERENCE_SETTINGS } from "../test-cases.js";

initPage();

// Decorative icons (inline SVG, no emoji).
for (const li of qsa("#hero-checks li")) li.insertAdjacentHTML("afterbegin", icon("check"));
for (const card of qsa("#why-cards [data-icon]")) card.insertAdjacentHTML("afterbegin", icon(card.dataset.icon));

const demo = qs("#demo");

/** Route-style row title: "Amman → Petra" when the day moves on from the previous day's base. */
function rowTitle(days, i, model) {
  const d = days[i];
  const prev = i > 0 ? days[i - 1].placeIds.at(-1) : null;
  const nameOf = (id) => shortName(model.byId[id]);
  if (!prev || !d.placeIds.length || !model.byId[prev]) return d.title;
  if (d.placeIds[0] === prev && d.placeIds.length > 1) return d.placeIds.map(nameOf).join(" → ");
  if (d.placeIds.length === 1 && d.placeIds[0] !== prev) return `${nameOf(prev)} → ${nameOf(d.placeIds[0])}`;
  return d.title;
}

function renderDemo({ trip, result, fixed, model }) {
  const s = trip.settings;
  const meta = ["Pasted from ChatGPT", s.car ? "with a car" : "no car", monthName(s.month)].join(" · ");
  const scoreCls = result.score >= 85 ? " good" : "";
  demo.innerHTML = html`
    <div class="demo-head">
      <div>
        <h2>Sarah’s ${trip.days.length}-day plan</h2>
        <p class="small muted">${meta}</p>
      </div>
      <div class="demo-score${scoreCls}" aria-label="${`Reality Score ${result.score} out of 100`}">
        <strong>${result.score}</strong><span aria-hidden="true">/100<br>reality</span>
      </div>
    </div>
    <ol class="demo-days">
      ${result.days.map((d, i) => html`
        <li class="demo-day">
          <span class="demo-n">Day ${d.n}</span>
          <span class="demo-t">${rowTitle(trip.days, i, model)}</span>
          ${raw(statusPill(d.status))}
        </li>`).map(raw)}
    </ol>
    <a class="btn btn-primary btn-block" href="/plan.html?demo=1">Fix all → ${fixed.score}/100</a>
    <p class="demo-note">Live result from the Darb engine — not a screenshot.</p>`;
  demo.setAttribute("aria-busy", "false");

  const p = result.pass;
  if (p && p.paysOff) {
    qs("#pass-line").textContent =
      `Sarah’s ${trip.days.length}-day plan: ${p.tier.name} ${p.tier.jod} JOD vs ${p.separate} JOD bought separately — save ~${p.savings} JOD.`;
  }
}

function renderError() {
  demo.setAttribute("aria-busy", "false");
  demo.innerHTML = `
    <div class="stack">
      <h2>The live demo couldn’t load</h2>
      <p class="muted small">Check your connection and reload, or run your own plan.</p>
      <a class="btn btn-primary btn-block" href="/plan.html">Check my plan</a>
    </div>`;
}

try {
  const model = await loadModel();
  const trip = { title: "Sarah’s plan", days: parse(REFERENCE_TEXT, model), settings: { ...REFERENCE_SETTINGS } };
  const result = check(trip, model);
  const { fixed } = fix(trip, model);
  renderDemo({ trip, result, fixed, model });
} catch (e) {
  console.warn("Darb: demo card failed", e);
  renderError();
}
