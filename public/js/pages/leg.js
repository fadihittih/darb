// 05 Leg detail — every transport option for one leg, the recommended one highlighted.
import { initPage } from "../ui/nav.js";
import { html, raw, qs } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { loadModel } from "../data.js";
import { loadTrip } from "../store.js";
import { resolveLeg, shortName } from "../engine/model.js";
import { usableOptions } from "../engine/rules.js";
import { fmtCost, fmtDuration, fmtDate } from "../engine/format.js";

initPage();

const params = new URLSearchParams(location.search);
const tripId = params.get("t") || "";
// ?local=1: the check page couldn't save to Firestore; the trip JSON is in sessionStorage.
const isLocal = !tripId && params.get("local") === "1";
function pendingTrip() {
  try { return JSON.parse(sessionStorage.getItem("darb:pending")); } catch { return null; }
}
const dayN = Number(params.get("day")) || null;
const legKeyParam = params.get("leg") || "";
const root = qs("#leg");

const TRANSFER_MODES = ["transfer", "driver", "car", "own-car"];

// Petra's transport hub is the town of Wadi Musa — say so, like the design.
const TITLE_SUFFIX = { petra: " (Wadi Musa)" };
/** Full place / airport name ("Queen Alia (AMM)", "Petra (Wadi Musa)"). */
const placeTitle = (model, id) => (model.byId[id]?.name || id) + (TITLE_SUFFIX[id] || "");

function arrivesText(o, leg, isRec) {
  const sunset = !!leg.timeSensitive && /sunset/i.test(leg.timeSensitive);
  if (o.arrivesOk === false) return { ok: false, text: sunset ? "Misses sunset" : "Not practical for this day" };
  if (leg.timeSensitive) {
    if (!TRANSFER_MODES.includes(o.mode)) return { ok: true, text: "Usually in time" };
    return { ok: true, text: sunset && isRec ? "In time for sunset" : "In time" };
  }
  if (o.arrivesOk === true) return { ok: true, text: "In time" };
  return null;
}

function timeText(o) {
  const parts = [];
  if (o.departs) parts.push(`Departs ${o.departs}`);
  const d = o.durationMin != null ? `~${fmtDuration(o.durationMin)}` : o.durationText || "";
  if (d) parts.push(d);
  return parts.join(" · ") || "—";
}

function costCell(o) {
  const c = fmtCost(o);
  const sub = [o.costUnit, c.verified && o.verifiedOn ? `verified ${fmtDate(o.verifiedOn)}` : ""].filter(Boolean).join(" · ");
  const cls = c.verified ? "cost-verified" : o.cost ? "cost-est" : "";
  return html`
    <span class="${cls}">${c.text}${c.verified ? raw(' <span aria-hidden="true">✓</span><span class="sr-only">(verified)</span>') : ""}</span>
    ${sub ? raw(html`<span class="leg-cell-sub">${sub}</span>`) : ""}`;
}

function contextLine(leg, car, model) {
  const noCar = car ? "" : " You don’t have a car.";
  if (leg.timeSensitive) {
    const m = /before ~?(\d{1,2}):00/.exec(leg.timeSensitive);
    if (m && /sunset/i.test(leg.timeSensitive)) {
      const h = Number(m[1]) % 24;
      const at = `${h % 12 || 12} ${h >= 12 ? "pm" : "am"}`; // 12:00 → "12 pm", 16:00 → "4 pm", 0:00 → "12 am"
      return `You need to arrive before ~${at} for a sunset jeep tour.${noCar}`;
    }
    return `${leg.timeSensitive}${noCar}`;
  }
  const a = shortName(model.byId[leg.from]);
  const b = shortName(model.byId[leg.to]);
  return `${a} to ${b} is about ${leg.km} km — roughly ${fmtDuration(leg.driveMin)} by road.${noCar}`;
}

function notFound() {
  root.innerHTML = html`
    <section class="card empty-card">
      <h1 class="empty-title">We couldn’t find that transport leg</h1>
      <p class="muted">The link may be incomplete. Open your plan and pick a leg from the day list.</p>
      <div class="row"><a class="btn btn-primary" href="/plan.html">Check a plan</a></div>
    </section>`;
  root.setAttribute("aria-busy", "false");
}

async function main() {
  const [model, loaded] = await Promise.all([loadModel(), tripId ? loadTrip(tripId) : Promise.resolve(null)]);
  const trip = isLocal ? pendingTrip() : loaded;
  const who = tripId ? `t=${encodeURIComponent(tripId)}` : isLocal ? "local=1" : "";
  const [from, to] = legKeyParam.split("~");
  if (!from || !to || !model.byId[from] || !model.byId[to] || from === to) return notFound();

  const leg = resolveLeg(model, from, to);
  const car = !!trip?.settings?.car;
  const options = [...leg.options];
  // Highlight the option the fixed plan chose for this leg; otherwise the engine's recommended one.
  const engineRec = usableOptions(leg, car).find((o) => o.arrivesOk !== false) || null;
  const planned = trip?.fixed?.days?.find((d) => d.n === dayN)?.items
    ?.find((it) => it.kind === "leg" && it.legKey === leg.key)?.option?.label;
  const rec = options.find((o) => planned && o.label === planned) || engineRec;

  const backHref = trip && who ? `/${trip.fixed ? "fixed" : "check"}.html?${who}` : "/plan.html";
  const backText = dayN ? `Back to Day ${dayN}` : "Back to your plan";
  const eyebrow = `${dayN ? `Day ${dayN} · ` : ""}Transport leg`;
  const title = `${placeTitle(model, from)} → ${placeTitle(model, to)}`;
  document.title = `Darb — ${title}`;

  const banner = leg.publicTransport === "none"
    ? html`<div class="leg-banner" role="note">${raw(icon("x"))}<p>${leg.evidence || "No scheduled public transport on this leg — the public bus option your plan assumed isn’t available."}</p></div>`
    : "";

  const rows = options.map((o) => {
    const isRec = rec && o === rec;
    const arr = arrivesText(o, leg, isRec);
    const notes = [!car && o.requiresCar ? "Not in your plan (no car)." : "", o.notes || ""].filter(Boolean).join(" ");
    return html`
      <tr class="${isRec ? "leg-rec" : ""}">
        <th scope="row" data-label="Option">
          <span class="leg-opt">${o.label}</span>
          ${isRec ? raw('<span class="leg-tag">Recommended</span>') : ""}
        </th>
        <td data-label="Time"><div>${timeText(o)}</div></td>
        <td data-label="Cost"><div>${raw(costCell(o))}</div></td>
        <td data-label="Arrives"><div>${arr ? raw(html`<span class="${arr.ok ? "arr-ok" : "arr-no"}"><span aria-hidden="true">${arr.ok ? "✓" : "✕"}</span> ${arr.text}</span>`) : "—"}</div></td>
        <td data-label="Notes"><div>${notes || "—"}</div></td>
      </tr>`;
  });

  const a = model.byId[from];
  const b = model.byId[to];
  const mapHref = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=driving`;
  const useHref = rec && who && dayN
    ? `/check.html?${who}&use=${encodeURIComponent(`${dayN}|${leg.key}|${rec.label}`)}`
    : "";

  root.innerHTML = html`
    <a class="leg-back" href="${backHref}">${raw(icon("arrow-left"))}${backText}</a>
    <p class="leg-eyebrow">${eyebrow}</p>
    <h1 class="leg-title">${title}</h1>
    <p class="leg-context">${contextLine(leg, car, model)}</p>
    ${raw(banner)}
    <div class="card leg-table-card">
      <table class="table leg-table">
        <caption class="sr-only">Transport options from ${shortName(a)} to ${shortName(b)}</caption>
        <thead><tr><th scope="col">Option</th><th scope="col">Time</th><th scope="col">Cost</th><th scope="col">Arrives</th><th scope="col">Notes</th></tr></thead>
        <tbody>${rows.map(raw)}</tbody>
      </table>
    </div>
    <div class="row leg-actions">
      ${useHref ? raw(html`<a class="btn btn-primary" href="${useHref}">Use recommended option</a>`) : ""}
      <a class="btn btn-secondary" href="${mapHref}" target="_blank" rel="noopener">Compare on map<span class="sr-only"> (opens Google Maps in a new tab)</span></a>
    </div>
    <p class="leg-foot">Prices marked “est.” are ranges until verified by the Darb data team. Every option shows its source and last-verified date.</p>`;
  root.setAttribute("aria-busy", "false");
}

main().catch((e) => {
  console.warn("Darb: leg detail failed", e);
  notFound();
});
