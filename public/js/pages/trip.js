// Shared read-only trip page, served at /t/<id> (firebase.json rewrite) or /trip.html?t=<id>.
// Same day renderer as 04 without edit links, plus the post-trip "Was this transport there?" loop.
import { jodRates, fxLine } from "../fx.js";
import { initPage } from "../ui/nav.js";
import { qs } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { loadModel } from "../data.js";
import { loadTrip, logConfirmation } from "../store.js";
import { fix } from "../engine/fixer.js";
import { monthName } from "../engine/format.js";
import {
  renderFixedDays, renderScoreCard, renderCostCard, renderWeatherCard, tripPlaces, notFoundCard
} from "../render/fixed-plan.js";
import { forecast, forecastWindow } from "../weather.js";

initPage();

const CONFIRM_PREFIX = "darb:confirm:";

function tripIdFromUrl() {
  const m = /^\/t\/([A-Za-z0-9]{1,40})\/?$/.exec(location.pathname);
  return m ? m[1] : new URLSearchParams(location.search).get("t");
}
const id = tripIdFromUrl();
// ?local=1: an unsaved trip from sessionStorage (no id → no post-trip confirmations).
const isLocal = !id && new URLSearchParams(location.search).get("local") === "1";
function pendingTrip() {
  try { return JSON.parse(sessionStorage.getItem("darb:pending")); } catch { return null; }
}

const answeredKey = (ref) => `${CONFIRM_PREFIX}${id}:${ref}`;
function answered(ref) {
  try { return !!localStorage.getItem(answeredKey(ref)); } catch { return false; }
}
function remember(ref, answer) {
  try { localStorage.setItem(answeredKey(ref), answer); } catch { /* storage blocked */ }
}

function showNotFound() {
  qs("#plan").innerHTML = notFoundCard();
  qs("#plan").setAttribute("aria-busy", "false");
}

function subLine(trip, fixed) {
  const s = trip.settings || {};
  const n = fixed.days.length;
  return [`${n} ${n === 1 ? "day" : "days"}`, s.car ? "with a car" : "no car", monthName(Number(s.month)), "every leg checked against real transport"]
    .filter(Boolean).join(" · ");
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

function bindConfirmations() {
  qs("#days").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-answer]");
    if (!btn) return;
    const row = btn.closest(".confirm-row");
    const ref = row?.dataset.leg;
    if (!ref || answered(ref)) return;
    // logConfirmation never throws (store.js swallows errors), so gate on connectivity before recording anything.
    if (!navigator.onLine) {
      toast("You’re offline — try again later");
      return;
    }
    const buttons = [...row.querySelectorAll("button")];
    for (const b of buttons) b.disabled = true;
    await logConfirmation(id, ref, btn.dataset.answer);
    remember(ref, btn.dataset.answer);
    row.insertAdjacentHTML("beforeend", '<span class="confirm-done small muted">Thanks — noted.</span>');
    toast("Thanks — this helps keep Darb accurate.");
  });
}

async function main() {
  if (!id && !isLocal) return showNotFound();
  const [model, loaded] = await Promise.all([loadModel(), id ? loadTrip(id) : Promise.resolve(null)]);
  const trip = isLocal ? pendingTrip() : loaded;
  if (!trip || !Array.isArray(trip.days) || !trip.settings) return showNotFound();

  let fixed = trip.fixed;
  let after = trip.check;
  if (!fixed || !Array.isArray(fixed.days)) {
    const r = fix(trip, model);
    fixed = r.fixed;
    after = r.check;
  }

  const title = trip.title || "A Jordan plan";
  document.title = `Darb — ${title}`;
  qs("#trip-title").textContent = title;
  qs("#plan-sub").textContent = subLine(trip, fixed);
  qs("#score-card").innerHTML = renderScoreCard(fixed, after);
  qs("#score-card").hidden = false;
  qs("#days").innerHTML = renderFixedDays(fixed, model, { editable: false, confirm: !!id, answered });
  qs("#cost").innerHTML = renderCostCard(fixed.cost);
  jodRates().then((r) => { const el = qs("#cost-fx"); if (el && r) el.textContent = fxLine(fixed.cost.total, r); });
  qs("#side-extra").hidden = false;
  qs("#plan").setAttribute("aria-busy", "false");
  qs("#btn-pdf").addEventListener("click", () => window.print());
  if (id) bindConfirmations();

  renderWeather(trip, fixed, model).catch((e) => console.warn("Darb: weather card failed", e));
}

main().catch((e) => {
  console.warn("Darb: shared trip failed to load", e);
  showNotFound();
});
