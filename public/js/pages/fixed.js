// 04 Fixed plan — day cards with every leg costed, trip cost, weather & packing, Save & share (06).
import { jodRates, fxLine } from "../fx.js";
import { initPage } from "../ui/nav.js";
import { stepper } from "../ui/stepper.js";
import { qs, qsa, countUp } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { loadModel } from "../data.js";
import { loadTrip } from "../store.js";
import { fix } from "../engine/fixer.js";
import {
  renderFixedDays, renderChanges, renderScoreCard, renderCostCard, renderWeatherCard, tripPlaces, notFoundCard, loadErrorCard
} from "../render/fixed-plan.js";
import { forecast, forecastWindow } from "../weather.js";
import { openShareModal } from "../share.js";
import { mountStickyCta } from "../ui/sticky-cta.js";

initPage();
qs("#stepper").innerHTML = stepper(3);
for (const el of qsa("[data-icon]")) el.outerHTML = icon(el.dataset.icon);

const params = new URLSearchParams(location.search);
const id = params.get("t");
const isLocal = !id && params.get("local") === "1";

function pendingTrip() {
  try { return JSON.parse(sessionStorage.getItem("darb:pending")); } catch { return null; }
}

function showNotFound() {
  qs("#plan").innerHTML = notFoundCard();
  qs("#plan").setAttribute("aria-busy", "false");
}

/** "5 days · no car · every leg checked against real transport" */
function subLine(trip, fixed) {
  const n = fixed.days.length;
  return [
    `${n} ${n === 1 ? "day" : "days"}`,
    trip.settings?.car ? "with a car" : "no car",
    trip.source === "build" ? "built from your interests" : "",
    "every leg checked against real transport"
  ].filter(Boolean).join(" · ");
}

/** "← Back to Reality Check" (fixed from a check), "← Back to Build a plan" (build trips), else "← Back to your plan". */
function setBack(trip) {
  const back = qs("#back-check");
  let href = "/plan.html";
  let text = "Back to your plan";
  if (trip.parentId) { href = `/check.html?t=${encodeURIComponent(trip.parentId)}`; text = "Back to Reality Check"; }
  else if (trip.source === "build") { href = "/build.html"; text = "Back to Build a plan"; }
  else if (isLocal) { href = "/check.html?local=1"; text = "Back to Reality Check"; }
  back.href = href;
  qs("#back-text", back).textContent = text;
}

async function renderWeather(trip, fixed, model) {
  const places = tripPlaces(fixed, model);
  const month = trip.settings?.month;
  const el = qs("#weather");
  el.innerHTML = renderWeatherCard(places, month);
  const start = trip.settings?.startDate;
  if (!places.length || !forecastWindow(start, fixed.days.length)) return;
  const live = await forecast(places, start, fixed.days.length);
  el.innerHTML = renderWeatherCard(places, month, { live, liveFailed: !live });
}

async function main() {
  const [model, loaded] = await Promise.all([loadModel(), id ? loadTrip(id) : Promise.resolve(null)]);
  // ?local=1: the check page couldn't save to Firestore; the trip is in sessionStorage (no id, no share link).
  const trip = isLocal ? pendingTrip() : loaded;
  if (!isLocal && loaded === undefined) throw new Error("trip fetch failed (network)"); // → load-error card with Try again
  if (!trip || !Array.isArray(trip.days) || !trip.settings) return showNotFound();

  let fixed = trip.fixed;
  let after = trip.check;
  if (!fixed || !Array.isArray(fixed.days)) {
    const r = fix(trip, model);
    fixed = r.fixed;
    after = r.check;
  }

  document.title = `Darb — ${trip.title || "Your fixed plan"}`;
  qs("#plan-sub").textContent = subLine(trip, fixed);
  qs("#score-card").innerHTML = renderScoreCard(fixed, after);
  qs("#score-card").hidden = false;
  countUp(qs("#score-card .score-ring"));
  qs("#changes").innerHTML = renderChanges(fixed);
  qs("#days").innerHTML = renderFixedDays(fixed, model, { editable: true, tripId: trip.id || "", local: !trip.id });
  qs("#cost").innerHTML = renderCostCard(fixed.cost);
  jodRates().then((r) => { const el = qs("#cost-fx"); if (el && r) el.textContent = fxLine(fixed?.cost?.total, r); }).catch(() => {});
  qs("#plan").setAttribute("aria-busy", "false");

  setBack(trip);
  qs("#btn-share").addEventListener("click", () => openShareModal(trip, fixed, model));
  qs("#btn-calendar").addEventListener("click", () => openShareModal(trip, fixed, model, { focus: "calendar" }));
  qs("#btn-pdf").addEventListener("click", () => window.print());
  qs("#actions").hidden = false;
  mountStickyCta("#btn-share");

  renderWeather(trip, fixed, model).catch((e) => console.warn("Darb: weather card failed", e));
}

main().catch((e) => {
  console.warn("Darb: fixed plan failed to load", e);
  qs("#plan").innerHTML = loadErrorCard();
  qs("#plan").setAttribute("aria-busy", "false");
  qs("#plan [data-retry]")?.addEventListener("click", () => location.reload());
});
