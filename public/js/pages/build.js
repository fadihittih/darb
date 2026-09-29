// 07 Build a plan — pick interests and settings, add places that really fit, watch the draft score, save → fixed.html (clean plan) or check.html.
import { initPage } from "../ui/nav.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { html, raw, qs, qsa } from "../ui/dom.js";
import { loadModel } from "../data.js";
import { saveTrip, logEvent } from "../store.js";
import { eventSummary } from "../engine/rules.js";
import { shortName } from "../engine/model.js";
import { monthName } from "../engine/format.js";
import { INTERESTS, MIN_DAYS, MAX_DAYS, DEFAULT_DAYS, rankPlaces, draftPlan } from "../engine/builder.js";

initPage();

const STORE_KEY = "darb:build:v1";

/** One-line hooks — facts only from places.json / legs.json. */
const HOOKS = {
  amman: "Citadel & Roman Theatre · 45 min by taxi from Queen Alia airport",
  jerash: "Roman city · taxi or minibus from Amman",
  ajloun: "Ajloun Castle · cooler forest hills north of Amman",
  "umm-qais": "Lesser-visited · Gadara ruins · bus via Irbid",
  "as-salt": "UNESCO old town · half day from Amman",
  "dead-sea": "No public bus · about 1 h by taxi from Amman",
  madaba: "Mosaics & Mount Nebo · minibus from Amman’s South station",
  petra: "Jordan Pass covers entry · JETT bus 06:30 from Amman",
  "wadi-rum": "Needs a pre-arranged transfer from Petra · est. 35–45 JOD", // no-car wording; see hookFor()
  aqaba: "Red Sea beaches · next to King Hussein airport (AQJ)",
  dana: "Canyon hikes & eco-lodge · needs a driver",
  kerak: "Castle with dark passages · about 2 h on site"
};

/** With a car, the transfer / driver wording doesn't apply (legs.json: rental car Petra → Wadi Rum 90 min, Amman → Dana 180 min). */
const CAR_HOOKS = {
  "wadi-rum": "1 h 30 from Petra by car",
  dana: "Canyon hikes & eco-lodge · 3 h from Amman by car"
};
const hookFor = (id) => (state.car && CAR_HOOKS[id]) || HOOKS[id] || "";

const nextMonth = () => (new Date().getMonth() + 1) % 12 + 1;
const DEFAULTS = { interests: [], days: DEFAULT_DAYS, airport: "AMM", departAirport: "AMM", month: nextMonth(), car: false, pace: "balanced", selected: [] };

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!s || typeof s !== "object") return { ...DEFAULTS };
    return {
      interests: Array.isArray(s.interests) ? s.interests.filter((x) => INTERESTS.some((i) => i.id === x)) : [],
      days: Math.min(MAX_DAYS, Math.max(MIN_DAYS, Number(s.days) || DEFAULT_DAYS)),
      airport: s.airport === "AQJ" ? "AQJ" : "AMM",
      departAirport: s.departAirport === "AQJ" ? "AQJ" : s.departAirport === "AMM" ? "AMM" : (s.airport === "AQJ" ? "AQJ" : "AMM"),
      month: Number(s.month) >= 1 && Number(s.month) <= 12 ? Number(s.month) : DEFAULTS.month,
      car: !!s.car,
      pace: ["relaxed", "balanced", "packed"].includes(s.pace) ? s.pace : "balanced",
      selected: Array.isArray(s.selected) ? s.selected.filter((x) => typeof x === "string") : []
    };
  } catch {
    return { ...DEFAULTS };
  }
}

const state = loadState();
const saveState = () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
};

const settings = () => ({ airport: state.airport, departAirport: state.departAirport, month: state.month, travelers: 1, budget: "mid", car: state.car, startDate: null, pace: state.pace, days: state.days });

let model = null;
let draft = null;

/* ---------- Form ---------- */

function renderForm() {
  qs("#interests").innerHTML = INTERESTS.map((i) => {
    const on = state.interests.includes(i.id);
    return html`<button type="button" class="${`chip${on ? " on" : ""}`}" data-id="${i.id}" aria-pressed="${String(on)}">${i.label}${raw(on ? icon("check", "chip-check") : "")}</button>`;
  }).join("");

  const days = qs("#f-days");
  if (!days.options.length) {
    days.innerHTML = Array.from({ length: MAX_DAYS - MIN_DAYS + 1 }, (_, k) => `<option value="${k + MIN_DAYS}">${k + MIN_DAYS}</option>`).join("");
    qs("#f-month").innerHTML = Array.from({ length: 12 }, (_, k) => `<option value="${k + 1}">${monthName(k + 1)}</option>`).join("");
  }
  days.value = String(state.days);
  qs("#f-airport").value = state.airport;
  qs("#f-depart").value = state.departAirport;
  qs("#f-month").value = String(state.month);

  for (const b of qsa("#f-car button")) {
    const on = (b.dataset.value === "yes") === state.car;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  }
  for (const b of qsa("#f-pace button")) {
    const on = b.dataset.value === state.pace;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.innerHTML = html`${b.textContent.trim()}${raw(on ? icon("check", "chip-check") : "")}`;
  }

  const step = state.selected.length ? 3 : state.interests.length ? 2 : 1;
  for (const li of qsa("#build-steps .build-step")) {
    const cur = Number(li.dataset.step) === step;
    li.classList.toggle("on", cur);
    if (cur) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
  }
}

/* ---------- Places ---------- */

function placeCard(r) {
  const { place } = r;
  const added = state.selected.includes(place.id);
  const fitPill = r.fits
    ? html`<span class="fit-pill ok">${raw(icon("check"))}Fits your trip</span>`
    : html`<span class="fit-pill need"><span aria-hidden="true">!</span>Needs +1 day or a car</span>`;
  return html`
    <li class="${`card place-card${added ? " added" : ""}`}">
      <div class="place-top">
        <h3 class="place-name">${place.name}</h3>
        ${place.hiddenGem ? raw(`<span class="gem-tag">Hidden gem</span>`) : ""}
      </div>
      <p class="place-hook">${r.fits ? hookFor(place.id) : r.reason || hookFor(place.id)}</p>
      <div class="place-foot">
        ${raw(fitPill)}
        <button type="button" class="${`btn btn-sm ${added ? "btn-dark" : "btn-secondary"} place-btn`}" data-id="${place.id}" aria-pressed="${String(added)}" aria-label="${`${added ? "Remove" : "Add"} ${place.name}${added ? " from" : " to"} your plan`}">${added ? raw(`Added ${icon("check")}`) : "+ Add"}</button>
      </div>
    </li>`;
}

function renderPlaces() {
  const ranked = rankPlaces(state.interests, state.selected, settings(), model);
  const list = qs("#places");
  list.innerHTML = ranked.map(placeCard).join("");
  list.setAttribute("aria-busy", "false");
  const fitting = ranked.filter((r) => r.fits).length;
  qs("#places-note").textContent = state.interests.length
    ? `Ranked for ${state.interests.map((id) => INTERESTS.find((i) => i.id === id).label.toLowerCase()).join(", ")} · ${fitting} of ${ranked.length} fit your trip.`
    : `Pick what you enjoy above to rank these · ${fitting} of ${ranked.length} fit your trip.`;
}

/* ---------- Plan panel ---------- */

const nameOf = (id) => shortName(model.byId[id]);

function rowText(d, isLast) {
  if (!d.placeIds.length) return isLast && d.hints.depart ? "Free day — add a place, then fly home" : "Free day — add a place";
  const names = d.placeIds.map((id) => {
    const p = model.byId[id];
    return p.minHours >= 5 && d.placeIds.length === 1 ? `${nameOf(id)} (full day)` : nameOf(id);
  }).join(" & ");
  if (d.hints.arrive && d.n === 1) return `Arrive · ${names}`;
  if (d.hints.depart && isLast) return `${names}, then fly home`;
  return names;
}

const warnLine = (text) => html`<li class="plan-warn">${raw(icon("warn"))}<span>${text}</span></li>`;

function renderPlan() {
  const body = qs("#plan-body");
  const btn = qs("#build-btn");
  if (!state.selected.length) {
    body.innerHTML = html`
      <ol class="plain-list plan-days">
        ${Array.from({ length: state.days }, (_, i) => html`<li class="plan-day free"><span class="plan-n">Day ${i + 1}</span><span class="plan-t">Free day — add a place</span></li>`).map(raw)}
      </ol>
      <p class="plan-empty">Add places from the list to start your plan. We order them for you and check every day as you go.</p>`;
    btn.disabled = true;
    draft = null;
    return;
  }
  draft = draftPlan(state.selected, settings(), model);
  const { trip, plain, dropped, moves, score } = draft;
  const days = trip.days;

  const rows = days.map((d, i) => {
    const warns = [];
    for (const m of moves.filter((x) => x.to === d.n)) {
      warns.push(`${nameOf(m.placeId)} moves to Day ${m.to} so every day fits`);
    }
    const dayCheck = plain.days[i];
    for (const it of dayCheck.issues) {
      if (it.severity === "risky" || it.severity === "nf") warns.push(it.reason);
    }
    return html`
      <li class="${`plan-day${d.placeIds.length ? "" : " free"}`}">
        <span class="plan-n">Day ${d.n}</span>
        <span class="plan-t">${rowText(d, i === days.length - 1)}</span>
        ${warns.length ? raw(html`<ul class="plain-list plan-warns">${warns.map((w) => raw(warnLine(w)))}</ul>`) : ""}
      </li>`;
  });

  const extra = dropped.length
    ? warnLine(`${dropped.length} ${dropped.length > 1 ? "places don’t" : "place doesn’t"} fit in ${days.length} days — add a day or remove one (${dropped.map(nameOf).join(", ")} left out)`)
    : "";
  const plainNote = !draft.clean
    ? html`<p class="plan-score-note">${draft.needsReorder
      ? "Some days need reordering — Build my plan opens the Reality Check, where Fix all shows each change."
      : "Some days still don’t work — Build my plan opens the Reality Check to show why."}</p>`
    : plain.score !== score
      ? html`<p class="plan-score-note">With the recommended transfer for every leg — you’ll see each one, costed, on the next screen.</p>`
      : "";

  body.innerHTML = html`
    <ol class="plain-list plan-days">${rows.map(raw)}</ol>
    ${extra ? raw(`<ul class="plain-list plan-warns plan-dropped">${extra}</ul>`) : ""}
    <div class="plan-score">
      <span>Reality Score (draft)</span>
      <strong aria-label="${`${score} out of 100`}">${score}</strong>
    </div>
    ${raw(plainNote)}`;
  btn.disabled = false;
}

function render() {
  renderForm();
  if (!model) return;
  renderPlaces();
  renderPlan();
}

function update(change) {
  change();
  saveState();
  render();
}

/* ---------- Events ---------- */

qs("#interests").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b) return;
  update(() => {
    const id = b.dataset.id;
    state.interests = state.interests.includes(id) ? state.interests.filter((x) => x !== id) : [...state.interests, id];
  });
  qs(`#interests button[data-id="${b.dataset.id}"]`)?.focus();
});
qs("#f-days").addEventListener("change", (e) => update(() => { state.days = Number(e.target.value); }));
qs("#f-airport").addEventListener("change", (e) => update(() => {
  // Default "fly home from" follows the arrival airport until the user changes it.
  if (state.departAirport === state.airport) state.departAirport = e.target.value;
  state.airport = e.target.value;
}));
qs("#f-depart").addEventListener("change", (e) => update(() => { state.departAirport = e.target.value; }));
qs("#f-month").addEventListener("change", (e) => update(() => { state.month = Number(e.target.value); }));
qs("#f-car").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-value]");
  if (b) update(() => { state.car = b.dataset.value === "yes"; });
});
qs("#f-pace").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-value]");
  if (!b) return;
  update(() => { state.pace = b.dataset.value; });
  qs(`#f-pace button[data-value="${b.dataset.value}"]`)?.focus();
});
qs("#places").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b || !model) return;
  const id = b.dataset.id;
  update(() => {
    state.selected = state.selected.includes(id) ? state.selected.filter((x) => x !== id) : [...state.selected, id];
  });
  qs(`#places button[data-id="${id}"]`)?.focus();
});

qs("#build-btn").addEventListener("click", async () => {
  if (!draft || !model) return;
  const btn = qs("#build-btn");
  const { trip, plain, res, clean } = draft;
  // A clean built plan is already a fixed plan (every leg has its recommended option) → fixed.html.
  // Otherwise save it as a checked plan → check.html, so the user sees why.
  const doc = clean
    ? { ...trip, check: res.check, fixed: res.fixed, score: res.fixed.score, lang: "en" }
    : { ...trip, check: plain, score: plain.score, lang: "en" };
  const page = clean ? "/fixed.html" : "/check.html";
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.firstChild.textContent = "Saving your plan… ";
  try {
    const id = await saveTrip(doc);
    // logEvent never throws; don't let a slow network hold the navigation for long.
    await Promise.race([logEvent("build", { ...eventSummary(trip, plain, model), ...(clean ? { scoreAfter: res.fixed.score } : {}) }), new Promise((r) => setTimeout(r, 1500))]);
    location.href = `${page}?t=${encodeURIComponent(id)}`;
  } catch (err) {
    console.warn("Darb: couldn't save the plan, continuing offline", err);
    try { sessionStorage.setItem("darb:pending", JSON.stringify(doc)); } catch { /* storage blocked */ }
    toast("Couldn’t save online — opening your plan on this device.");
    location.href = `${page}?local=1`;
  }
});

// Coming back with the browser's Back button (bfcache): reset the saving state.
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  const btn = qs("#build-btn");
  btn.removeAttribute("aria-busy");
  btn.firstChild.textContent = "Build my plan ";
  btn.disabled = !draft;
});

/* ---------- Boot ---------- */

qs("#build-arrow").innerHTML = icon("arrow-right");
render();
try {
  model = await loadModel();
  state.selected = state.selected.filter((id) => model.places.some((p) => p.id === id));
  render();
} catch (e) {
  console.warn("Darb: build page couldn't load places", e);
  qs("#places").replaceChildren();
  qs("#places").setAttribute("aria-busy", "false");
  qs("#places-note").textContent = "The destinations couldn’t load. Check your connection and reload.";
  qs("#plan-body").innerHTML = `<p class="muted small">Your plan will appear here once the destinations load.</p>`;
}
