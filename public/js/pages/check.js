// 03 Reality Check — load the trip, re-run the rules client-side, choose fixes, Fix all → fixed.html.
import { initPage } from "../ui/nav.js";
import { stepper } from "../ui/stepper.js";
import { icon } from "../ui/icons.js";
import { countsLine } from "../ui/pills.js";
import { dayCard } from "../ui/day-card.js";
import { toast } from "../ui/toast.js";
import { mountStickyCta } from "../ui/sticky-cta.js";
import { html, raw, qs, qsa } from "../ui/dom.js";
import { loadModel } from "../data.js";
import { check, dayRoute, usableOptions, chosenKey, eventSummary } from "../engine/rules.js";
import { fix } from "../engine/fixer.js";
import { fmtCost, fmtDuration, fmtDate, monthName } from "../engine/format.js";
import { shortName } from "../engine/model.js";
import { routeMap } from "../map.js";
import { saveTrip, loadTrip, logEvent } from "../store.js";

const PENDING_KEY = "darb:pending";
const SAVE_TIMEOUT_MS = 10000;
const DEFAULT_SETTINGS = { airport: "AMM", departAirport: null, month: 10, travelers: 1, budget: "mid", car: false, startDate: null, pace: "balanced" };

initPage();
qs("#stepper").innerHTML = stepper(2);
const root = qs("#check-root");

const params = new URLSearchParams(location.search);
const tripId = params.get("t");
const isLocal = !tripId && params.get("local") === "1";

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// ---------- Page state ----------
let model, trip, result, suggestions;
const choices = {};   // "<n>|<legKey>" → option label
let addNights = [];   // ["<n>|<legKey>"]
const extraFixes = {}; // "<n>|<legKey>" → option fix chosen on leg.html that isn't one of the listed fixes
let busy = false;
let sticky = null;

// ---------- Helpers ----------
const nameOf = (id) => (model.airports.some((a) => a.id === id) ? id : shortName(model.byId[id]));

/** "JETT bus Abdali → Wadi Musa · 06:30 · 4 h to Petra · 10 JOD (verified 24 Sep)" for the first leg of the day. */
function legSummary(leg) {
  const car = !!trip.settings.car;
  if (car) return `Drive · ${fmtDuration(leg.driveMin)} to ${nameOf(leg.to)}`;
  const o = usableOptions(leg, false).find((x) => x.arrivesOk !== false) || leg.options[0];
  if (!o) return "";
  const c = fmtCost(o);
  const dur = fmtDuration(o.durationMin ?? leg.driveMin);
  return [
    o.label,
    o.departs,
    dur ? `${dur} to ${nameOf(leg.to)}` : `to ${nameOf(leg.to)}`,
    c.text ? (c.verified ? `${c.text} (verified ${fmtDate(o.verifiedOn)})` : c.text) : ""
  ].filter(Boolean).join(" · ");
}

function daySub(route, d, day) {
  const first = route.legs[0];
  if (first && day.issues.some((it) => it.severity !== "info" && it.legKey === first.key)) {
    // Don't present a transport fix as the plan: describe the problem leg instead.
    const planned = d.hints?.mode ? ` · planned by ${d.hints.mode}` : "";
    return `${nameOf(first.from)} → ${nameOf(first.to)} · about ${fmtDuration(first.driveMin)} by road${planned}`;
  }
  if (first) return legSummary(first);
  return d.placeIds.length ? `Stay in ${nameOf(d.placeIds[0])} — no transfer needed` : "Free day";
}

/** Choosable fixes of a day, grouped per leg: [{ key, legKey, from, to, fixes:[Fix] }]. */
function fixGroups(day, i) {
  const structural = day.issues.some((it) => it.severity !== "info" && it.fixes.some((f) => f.kind === "reorder"));
  const groups = new Map();
  for (const it of day.issues) {
    if (it.severity === "info" || !it.legKey) continue;
    // A risky transport leg on a day that gets reordered disappears after Fix all — the reorder suggestion covers it.
    if (structural && it.severity !== "nf") continue;
    const key = chosenKey(trip.days[i].n, it.legKey);
    const g = groups.get(key) || { key, legKey: it.legKey, from: it.from, to: it.to, fixes: [] };
    // One transport option (the recommended one) + the "More relaxed" extra night; other options live on leg.html.
    const opts = it.fixes.filter((f) => f.kind === "option");
    const rec = opts.find((f) => f.recommended) || opts[0];
    // Chosen on leg.html (?use=): show it as a card even when it isn't one of the listed fixes.
    const used = opts.find((f) => f !== rec && f.label === choices[key]) || (choices[key] === extraFixes[key]?.label ? extraFixes[key] : null);
    const pick = [rec, used, ...it.fixes.filter((f) => f.kind === "addNight")];
    for (const f of pick) {
      if (f && !g.fixes.some((x) => x.kind === f.kind && x.label === f.label)) g.fixes.push(f);
    }
    if (g.fixes.length) groups.set(key, g);
  }
  return [...groups.values()];
}

function selectedIndex(g) {
  if (addNights.includes(g.key)) {
    const k = g.fixes.findIndex((f) => f.kind === "addNight");
    if (k >= 0) return k;
  }
  if (choices[g.key]) {
    const k = g.fixes.findIndex((f) => f.kind === "option" && f.label === choices[g.key]);
    if (k >= 0) return k;
  }
  const rec = g.fixes.findIndex((f) => f.recommended);
  return rec >= 0 ? rec : 0;
}

function select(key, f) {
  if (f.kind === "addNight") {
    delete choices[key];
    if (!addNights.includes(key)) addNights = [...addNights, key];
  } else {
    choices[key] = f.label;
    addNights = addNights.filter((k) => k !== key);
  }
}

const tripForEngine = () => ({ ...trip, days: trip.days, settings: trip.settings });
const runFix = () => fix(tripForEngine(), model, { choices: { ...choices }, addNights: [...addNights] });

// ---------- Renderers ----------
function renderDay(day, i) {
  const d = trip.days[i];
  const route = dayRoute(trip.days, i, trip.settings, model);
  const hard = day.issues.filter((it) => it.severity !== "info");
  const info = day.issues.filter((it) => it.severity === "info");
  const change = suggestions.filter((c) => c.day === d.n && c.kind !== "option").map((c) => c.text).join(" ");

  const groups = fixGroups(day, i);
  const fixes = groups.flatMap((g) => {
    const sel = selectedIndex(g);
    const legName = `${nameOf(g.from)} → ${nameOf(g.to)}`;
    return g.fixes.map((f, k) => ({
      id: `${g.key}#${k}`,
      tag: f.kind === "addNight" ? "More relaxed" : f.recommended ? "Recommended" : "",
      label: f.label,
      sub: f.kind === "option" ? [legName, f.sub].filter(Boolean).join(" · ") : f.sub,
      costText: f.costText,
      selected: k === sel
    }));
  });

  const why = hard.length
    ? { text: [...new Set(hard.map((it) => it.reason))].join(" ") + (change ? ` Suggested fix: ${change}` : "") }
    : null;

  const notCovered = (d.notCovered || []).length
    ? html`<p class="ck-not-covered">Not covered yet: ${d.notCovered.join(", ")} — Darb doesn’t check this part of the day.</p>`
    : "";
  const infoHtml = notCovered + info.map((it) => html`<p class="ck-info">${raw(icon("warn"))}<span>${it.reason}</span></p>`).join("");
  const q = (legKey) => (tripId ? `t=${encodeURIComponent(tripId)}` : "local=1") + `&day=${d.n}&leg=${encodeURIComponent(legKey)}`;
  const legLinks = route.legs.map((l) =>
    html`<a class="leg-link" href="${`/leg.html?${q(l.key)}`}">${nameOf(l.from)} → ${nameOf(l.to)} <span class="leg-link-cta">Leg detail →</span></a>`).join("");

  return dayCard({
    n: d.n,
    title: d.title,
    sub: daySub(route, d, day),
    status: day.status,
    why,
    fixes,
    itemsHtml: infoHtml,
    footHtml: legLinks ? `<div class="leg-links">${legLinks}</div>` : ""
  });
}

function scoreClass(score) {
  return score >= 85 ? "good" : score < 60 ? "bad" : "";
}

function renderScore() {
  const { counts, score } = result;
  const needs = counts.nf + counts.risky;
  const headline = counts.nf > 0 ? "This plan won’t work as written" : counts.risky > 0 ? "A few things to fix" : "Ready to travel";
  const sub = needs ? `${needs} day${needs > 1 ? "s" : ""} need${needs > 1 ? "" : "s"} changes before you travel.` : "Every day works as planned.";
  return html`
    <div class="card ck-score">
      <div class="${`score-ring ${scoreClass(score)}`}" role="img" aria-label="${`Reality Score ${score} out of 100`}">${score}</div>
      <div>
        <p class="ck-eyebrow">Reality Score</p>
        <h2 class="ck-score-title">${headline}</h2>
        <p class="small muted">${sub}</p>
      </div>
    </div>`;
}

function renderPass() {
  const p = result.pass;
  if (!p) return "";
  const shortTier = p.tier.name.replace(/^Jordan /, "");
  const title = p.paysOff ? `Save ~${p.savings} JOD with the ${shortTier} pass` : "The Pass doesn’t pay off for this trip";
  const visited = [...new Set(trip.days.flatMap((d) => d.placeIds))].map((id) => model.byId[id]).filter(Boolean);
  const verifiedOn = visited
    .map((pl) => pl.ticket)
    .filter((t) => t && t.coveredByJordanPass && t.status === "verified" && t.verifiedOn)
    .map((t) => t.verifiedOn).sort().at(-1);
  const smallFees = [...new Set(p.smallFees.map((label) => {
    const pl = visited.find((x) => x.ticket?.label === label);
    return label === "Small entry fees" && pl ? shortName(pl) : label;
  }))];
  const tierLine = p.visaWaived ? p.tier.name : `${p.tier.name} + visa`;
  const minNights = model.pass?.minNightsForVisaWaiver ?? 2;
  const nightsNote = p.visaWaived
    ? `Visa fee waived only if you buy the Pass before arrival and stay at least ${minNights} nights.`
    : `The visa is only waived with ${minNights}+ nights — this trip has ${p.nights}.`;
  return html`
    <section class="ck-pass" aria-labelledby="pass-title">
      <p class="ck-eyebrow ck-pass-eyebrow">${raw(icon("shield"))}Jordan Pass</p>
      <h2 class="ck-card-title" id="pass-title">${title}</h2>
      <table class="ck-pass-table">
        <caption class="sr-only">Jordan Pass compared with buying separately</caption>
        <tbody>
          ${p.items.map((it) => html`<tr><td>${it.label}</td><td>${it.jod} JOD</td></tr>`).map(raw)}
          <tr class="strong"><td>Bought separately</td><td>${p.separate} JOD</td></tr>
          <tr class="${p.paysOff ? "strong good" : "strong"}"><td>${tierLine}</td><td>${p.passCost} JOD</td></tr>
        </tbody>
      </table>
      <p class="ck-note">${nightsNote}${verifiedOn ? ` Prices last verified ${fmtDate(verifiedOn)} ${verifiedOn.slice(0, 4)}.` : ""}</p>
      ${smallFees.length ? raw(html`<p class="ck-note">Small entry fees not included: ${smallFees.join(", ")}.</p>`) : ""}
      ${p.paysOff ? raw(html`<p class="ck-note">Buy it before you fly on <a href="https://jordanpass.jo" target="_blank" rel="noopener">jordanpass.jo</a> (official site).</p>`) : ""}
    </section>`;
}

function renderFixAll(res) {
  const after = res.fixed.score;
  const clean = result.counts.nf + result.counts.risky === 0;
  const custom = addNights.length > 0 || Object.keys(choices).length > 0;
  const days = res.days.length;
  const text = clean
    ? `Every day already works. See the plan with every transport leg costed — Reality Score ${after}/100.`
    : `Reality Score goes from ${result.score} to ${after}${days !== trip.days.length ? ` · ${days} days` : ""}. You can review every change before saving.`;
  const title = clean ? "See your costed plan" : custom ? "Apply your fixes" : "Apply recommended fixes";
  return html`
    <h2 class="ck-card-title">${title}</h2>
    <p class="muted small">${text}</p>
    <button type="button" class="btn btn-primary btn-block" id="fix-all">${clean ? "Cost every leg" : "Fix all"} → ${after}/100</button>`;
}

function render() {
  const s = trip.settings;
  const airport = model.byId[s.airport]?.name || s.airport;
  const home = s.departAirport && s.departAirport !== s.airport ? `home from ${model.byId[s.departAirport]?.name || s.departAirport}` : "";
  const meta = [trip.title || `Your ${trip.days.length}-day plan`, airport, home, monthName(Number(s.month)) || "", s.car ? "with a car" : "no car"].filter(Boolean).join(" · ");
  const statuses = result.days.map((d) => d.status);
  const res = runFix();

  root.innerHTML = html`
    <div class="check-layout" data-view="days">
      <div class="ck-head">
        <h1 class="page-title">Reality Check</h1>
        <p class="muted">${meta}</p>
        <div class="ck-counts">${raw(countsLine(result.counts))}</div>
      </div>
      ${raw(renderScore())}
      <div class="tabs ck-tabs" role="group" aria-label="Show">
        <button type="button" class="tab on" id="tab-days" aria-pressed="true" aria-controls="ck-days" data-view="days">Days</button>
        <button type="button" class="tab" id="tab-map" aria-pressed="false" aria-controls="ck-map" data-view="map">Map</button>
      </div>
      <section class="ck-days stack" id="ck-days" aria-label="Your days">
        ${result.days.map((d, i) => raw(renderDay(d, i)))}
        <a class="back-link" href="/plan.html">${raw(icon("arrow-left"))}Back to your plan</a>
      </section>
      <aside class="ck-side stack">
        <section class="card ck-map" id="ck-map" aria-labelledby="map-title">
          <h2 class="ck-card-title" id="map-title">Your route</h2>
          ${raw(routeMap(trip.days, s, model, statuses))}
        </section>
        ${raw(renderPass())}
        <section class="card-dark ck-fix" id="ck-fix" aria-live="polite">${raw(renderFixAll(res))}</section>
      </aside>
    </div>`;
  root.setAttribute("aria-busy", "false");
  sticky ||= mountStickyCta("#fix-all");
  sticky.sync();
}

function renderMissing(message, { error = false } = {}) {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = html`
    <div class="card ck-missing">
      <h1 class="page-title">${error ? "We couldn’t check this plan" : "We couldn’t find this plan"}</h1>
      <p class="muted">${message}</p>
      <div class="row">
        ${error ? raw('<button type="button" class="btn btn-primary" data-retry>Try again</button>') : ""}
        <a class="${error ? "btn btn-secondary" : "btn btn-primary"}" href="/plan.html">Check a plan</a>
        <a class="btn btn-secondary" href="/build.html">Build a plan</a>
      </div>
    </div>`;
}

// ---------- Interactions ----------
function onFixCard(btn) {
  if (busy) return; // Fix all is saving — don't re-render mid-save
  const [key, k] = btn.dataset.fix.split("#");
  const day = result.days.find((d) => String(d.n) === key.split("|")[0]);
  const i = result.days.indexOf(day);
  const g = fixGroups(day, i).find((x) => x.key === key);
  const f = g?.fixes[Number(k)];
  if (!f) return;
  select(key, f);
  for (const b of qsa(".fix-card", root)) {
    if (!b.dataset.fix.startsWith(key + "#")) continue;
    const on = b === btn;
    b.classList.toggle("selected", on);
    b.setAttribute("aria-pressed", String(on));
  }
  qs("#ck-fix").innerHTML = renderFixAll(runFix());
  sticky?.sync();
}

function setView(view) {
  qs(".check-layout", root).dataset.view = view;
  for (const t of qsa(".ck-tabs .tab", root)) {
    const on = t.dataset.view === view;
    t.classList.toggle("on", on);
    t.setAttribute("aria-pressed", String(on));
  }
}

async function onFixAll(btn) {
  if (busy) return;
  busy = true;
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.textContent = "Fixing your plan…";
  sticky?.sync();

  const res = runFix();
  const days = res.days.map(({ n, title, text, placeIds, notCovered, hints }) => ({ n, title, text, placeIds, notCovered: notCovered || [], hints }));
  const sameLength = /^Your \d+-day plan$/.test(trip.title || "");
  const doc = {
    title: sameLength ? `Your ${days.length}-day plan` : trip.title,
    source: trip.source, rawText: trip.rawText, settings: trip.settings,
    days, check: res.check, fixed: res.fixed, score: res.fixed.score,
    parentId: tripId || undefined, lang: "en"
  };
  let newId = null;
  if (tripId) {
    try {
      newId = await withTimeout(saveTrip(doc), SAVE_TIMEOUT_MS);
    } catch (err) {
      console.warn("Darb: fixed plan not saved, continuing locally", err);
    }
  }
  await withTimeout(logEvent("fix", { ...eventSummary(trip, result, model), scoreAfter: res.fixed.score }), 2500).catch(() => {});

  if (newId) {
    location.href = `/fixed.html?t=${encodeURIComponent(newId)}`;
    return;
  }
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(doc)); } catch { /* blocked */ }
  if (tripId) toast("Couldn’t save online — showing your fixed plan on this device only.");
  setTimeout(() => { location.href = "/fixed.html?local=1"; }, tripId ? 1200 : 0);
}

root.addEventListener("click", (e) => {
  if (e.target.closest("[data-retry]")) return location.reload();
  const card = e.target.closest(".fix-card");
  if (card) return onFixCard(card);
  const tab = e.target.closest(".ck-tabs .tab");
  if (tab) return setView(tab.dataset.view);
  const all = e.target.closest("#fix-all");
  if (all) onFixAll(all);
});
window.addEventListener("pageshow", (e) => {
  if (!e.persisted || !busy) return;
  busy = false;
  qs("#ck-fix").innerHTML = renderFixAll(runFix());
  sticky?.sync();
});

/** ?use=<day>|<legKey>|<optionLabel> from leg.html pre-selects that fix. Returns the day number or null. */
function applyUse() {
  const use = params.get("use");
  if (!use) return null;
  const [n, legKey, ...rest] = use.split("|");
  const label = rest.join("|");
  const key = chosenKey(n, legKey);
  for (let i = 0; i < result.days.length; i++) {
    if (String(result.days[i].n) !== n) continue;
    const f = result.days[i].issues.filter((it) => it.legKey === legKey).flatMap((it) => it.fixes).find((x) => x.label === label);
    if (f) { select(key, f); return Number(n); }
    // Any other usable option of that leg (e.g. the bus) still counts as the user's choice.
    const leg = dayRoute(trip.days, i, trip.settings, model).legs.find((l) => l.key === legKey);
    const o = leg && usableOptions(leg, !!trip.settings.car).find((x) => x.label === label);
    if (o) {
      extraFixes[key] = { kind: "option", legKey, label: o.label, sub: fmtDuration(o.durationMin ?? leg.driveMin), costText: fmtCost(o).text, recommended: false };
      select(key, extraFixes[key]);
      return Number(n);
    }
  }
  return null;
}

// ---------- Boot ----------
function readPending() {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY)); } catch { return null; }
}

try {
  model = await loadModel();
  trip = isLocal ? readPending() : tripId ? await loadTrip(tripId) : null;
  const validDays = Array.isArray(trip?.days) && trip.days.length &&
    trip.days.every((d) => Array.isArray(d.placeIds) && d.placeIds.every((id) => model.byId[id]));
  if (!trip || !validDays) {
    renderMissing(tripId || isLocal
      ? "The link may be mistyped, or the plan was saved on another device while offline."
      : "Start by pasting your itinerary or building one with a few questions.");
  } else {
    trip = { ...trip, settings: { ...DEFAULT_SETTINGS, ...(trip.settings || {}) } };
    result = check(tripForEngine(), model);          // never trust a stored result
    suggestions = fix(tripForEngine(), model).fixed.changes;
    const usedDay = applyUse();
    document.title = `Reality Check ${result.score}/100 — Darb`;
    render();
    if (usedDay != null) qs(`.day-card[data-day="${usedDay}"]`, root)?.scrollIntoView({ block: "center" });
  }
} catch (err) {
  console.error("Darb: Reality Check failed", err);
  renderMissing("Darb couldn’t load its data or this plan just now. Check your connection and try again.", { error: true });
}
