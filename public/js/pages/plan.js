// 02 Input, paste a plan, confirm what the parser read, then check → save → check.html.
import { initPage } from "../ui/nav.js";
import { stepper } from "../ui/stepper.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { html, raw, qs, qsa } from "../ui/dom.js";
import { loadModel } from "../data.js";
import { parse, isUsable, previewText, notCoveredNames, departAirportFrom } from "../engine/parser.js";
import { check, eventSummary } from "../engine/rules.js";
import { saveTrip, logEvent } from "../store.js";
import { monthName } from "../engine/format.js";
import { REFERENCE_TEXT, REFERENCE_SETTINGS } from "../test-cases.js";

const DRAFT_KEY = "darb:plan-draft";
const PENDING_KEY = "darb:pending";
const SAVE_TIMEOUT_MS = 10000;

initPage();
qs("#stepper").innerHTML = stepper(1);
for (const li of qsa("#plan-checks .plan-check-t")) li.insertAdjacentHTML("afterbegin", icon("check"));

const form = qs("#plan-form");
const text = qs("#plan-text");
const preview = qs("#plan-preview");
const count = qs("#plan-count");
const btn = qs("#check-btn");
const f = {
  airport: qs("#f-airport"), depart: qs("#f-depart"), month: qs("#f-month"), travelers: qs("#f-travelers"),
  budget: qs("#f-budget"), startDate: qs("#f-start"), pace: qs("#f-pace")
};
let car = false;
let departTouched = false; // the user picked "Fly home from" themselves
let model = null;
let days = [];
let loadError = false;

// ---------- Fields ----------
const nextMonth = (new Date().getMonth() + 1) % 12 + 1;
f.month.innerHTML = Array.from({ length: 12 }, (_, i) => html`<option value="${i + 1}">${monthName(i + 1)}</option>`).join("");
f.travelers.innerHTML = Array.from({ length: 6 }, (_, i) => html`<option value="${i + 1}">${i + 1} ${i ? "adults" : "adult"}</option>`).join("");
f.month.value = String(nextMonth);
f.budget.value = "mid";
f.pace.value = "balanced";
text.placeholder = REFERENCE_TEXT;

function setCar(v) {
  car = !!v;
  for (const b of qsa("#car-toggle .chip")) {
    const on = (b.dataset.car === "yes") === car;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.querySelector(".icon")?.remove();
    if (on) b.insertAdjacentHTML("afterbegin", icon("check"));
  }
}

function settings() {
  // An <input type="date"> value is always YYYY-MM-DD; pick the month from it when set.
  const startDate = f.startDate.value || null;
  return {
    airport: f.airport.value === "AQJ" ? "AQJ" : "AMM",
    departAirport: f.depart.value === "AQJ" ? "AQJ" : "AMM",
    month: Number(f.month.value) || nextMonth,
    travelers: Number(f.travelers.value) || 1,
    budget: f.budget.value,
    car,
    startDate,
    pace: f.pace.value
  };
}

// ---------- Draft persistence (back-navigation keeps what the user typed) ----------
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: text.value, settings: settings(), departTouched })); } catch { /* blocked */ }
}
function restoreDraft() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { /* ignore */ }
  if (!d) return;
  if (typeof d.text === "string") text.value = d.text;
  const s = d.settings || {};
  if (["AMM", "AQJ"].includes(s.airport)) f.airport.value = s.airport;
  if (["AMM", "AQJ"].includes(s.departAirport)) f.depart.value = s.departAirport;
  departTouched = typeof d.departTouched === "boolean" ? d.departTouched : !!s.departAirport && s.departAirport !== s.airport;
  if (s.month >= 1 && s.month <= 12) f.month.value = String(s.month);
  if (s.travelers >= 1 && s.travelers <= 6) f.travelers.value = String(s.travelers);
  if (["budget", "mid", "comfort"].includes(s.budget)) f.budget.value = s.budget;
  if (["relaxed", "balanced", "packed"].includes(s.pace)) f.pace.value = s.pace;
  if (typeof s.startDate === "string") f.startDate.value = s.startDate;
  car = !!s.car;
}

// ---------- Live preview ----------
function update() {
  const value = text.value;
  count.textContent = value.trim() ? `${value.length} characters` : "";
  if (loadError) {
    preview.classList.add("warn");
    preview.textContent = "Couldn’t load the Jordan data, check your connection and reload.";
    btn.disabled = true;
    return;
  }
  if (!model) {
    preview.textContent = value.trim() ? "Loading Jordan places…" : "";
    btn.disabled = true;
    return;
  }
  days = parse(value, model);
  if (!departTouched) f.depart.value = departAirportFrom(days) || f.airport.value;
  const usable = isUsable(days);
  preview.classList.toggle("warn", !!value.trim() && !usable);
  if (!value.trim()) {
    preview.textContent = "Paste your itinerary above, one line or paragraph per day works best.";
  } else if (usable) {
    preview.innerHTML = html`${raw(icon("check"))}<span>${previewText(days)}</span>`;
  } else {
    const nc = notCoveredNames(days);
    preview.innerHTML = nc.length
      ? html`We don’t cover ${nc.join(", ")} yet, and found no other Jordan places we check, try ‘Day 1 – Amman…’ or <a href="/build.html">build a plan instead</a>.`
      : html`We couldn’t find any Jordan places in this text, try ‘Day 1 – Amman…’ or <a href="/build.html">build a plan instead</a>.`;
  }
  btn.disabled = !usable || busy;
}

// ---------- Submit ----------
let busy = false;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function submit(e) {
  e.preventDefault();
  if (busy || !model) return;
  days = parse(text.value, model);
  if (!isUsable(days)) return;
  busy = true;
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.textContent = "Checking your plan…";
  saveDraft();

  const trip = { title: `Your ${days.length}-day plan`, source: "paste", rawText: text.value, settings: settings(), days };
  const res = check(trip, model);
  const doc = { ...trip, check: res, score: res.score, lang: "en" };
  let id = null;
  try {
    id = await withTimeout(saveTrip(doc), SAVE_TIMEOUT_MS);
  } catch (err) {
    console.warn("Darb: trip not saved, continuing locally", err);
  }
  // Anonymous event; don't let a slow network hold the user back.
  await withTimeout(logEvent("check", eventSummary(trip, res, model)), 2500).catch(() => {});

  if (id) {
    location.href = `/check.html?t=${encodeURIComponent(id)}`;
    return;
  }
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(doc)); } catch { /* blocked */ }
  toast("Couldn’t save online, showing your check on this device only.");
  setTimeout(() => { location.href = "/check.html?local=1"; }, 1200);
}

// ---------- Wire up ----------
restoreDraft();
if (new URLSearchParams(location.search).get("demo") === "1") {
  // Sarah's example with her settings, so the demo always reproduces 58 → 94.
  const s = REFERENCE_SETTINGS;
  text.value = REFERENCE_TEXT;
  f.airport.value = s.airport; f.depart.value = s.airport; departTouched = false; f.month.value = String(s.month); f.travelers.value = String(s.travelers);
  f.budget.value = s.budget; f.pace.value = s.pace; f.startDate.value = s.startDate || "";
  car = !!s.car;
}
setCar(car);

qs("#use-example").addEventListener("click", () => {
  text.value = REFERENCE_TEXT;
  update();
  saveDraft();
  text.focus();
});
// "Copy our prompt": the traveller's own AI writes the plan in the format the parser reads best.
qs("#copy-prompt").addEventListener("click", async () => {
  const src = qs("#ai-prompt-text");
  try {
    await navigator.clipboard.writeText(src.textContent);
    toast("Prompt copied, paste it into your AI chat.");
  } catch {
    const range = document.createRange();
    range.selectNodeContents(src);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    toast("Select all and copy the highlighted prompt.");
  }
});
qs("#car-toggle").addEventListener("click", (e) => {
  const b = e.target.closest("[data-car]");
  if (!b) return;
  setCar(b.dataset.car === "yes");
  saveDraft();
});
f.depart.addEventListener("change", () => { departTouched = true; saveDraft(); });
f.airport.addEventListener("change", () => {
  if (!departTouched) f.depart.value = departAirportFrom(days) || f.airport.value;
  saveDraft();
});
text.addEventListener("input", () => { update(); saveDraft(); });
form.addEventListener("change", saveDraft);
f.startDate.addEventListener("change", () => {
  // A chosen start date decides the month (the checks are seasonal).
  const m = Number(f.startDate.value.slice(5, 7));
  if (m >= 1 && m <= 12) { f.month.value = String(m); saveDraft(); }
});
form.addEventListener("submit", submit);
// Restored from the back/forward cache after navigating on: reset the button.
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  busy = false;
  btn.removeAttribute("aria-busy");
  btn.textContent = "Check my plan →";
  update();
});

update();
try {
  model = await loadModel();
} catch (err) {
  console.warn("Darb: couldn't load reference data", err);
  loadError = true;
}
update();
