// "Build a plan" logic (07): rank places, decide what fits, lay places out over the days, score the draft.
// Pure, no DOM. Everything is decided by the rules engine (rules.js / fixer.js), never guessed.
import { resolveLeg, kmBetween, shortName } from "./model.js";
import { check, dayIssues, airportOf, departAirportOf, usableOptions } from "./rules.js";
import { fix } from "./fixer.js";
import { fmtCost, fmtDuration } from "./format.js";

export const INTERESTS = [
  { id: "history", label: "History & ruins" },
  { id: "nature", label: "Nature & hiking" },
  { id: "desert", label: "Desert & stars" },
  { id: "food", label: "Food & culture" },
  { id: "beach", label: "Beach & relaxation" },
  { id: "faith", label: "Faith & pilgrimage" }
];

export const MIN_DAYS = 2;
export const MAX_DAYS = 14;
export const DEFAULT_DAYS = 5;

const MAX_DRIVE_MIN = 240;   // a leg longer than 4 h eats the day
const DAY_HOURS = 10;         // visit + drive must fit in a normal day
const TRANSFER_MIN = 60;       // no car + no public transport + a longer drive = a pre-arranged transfer day
const PAIR_MAX_HOURS = 3;     // two short visits may share a day…
const PAIR_MAX_KM = 60;       // …when they are close together

const clampDays = (n) => Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(Number(n)) || DEFAULT_DAYS));

/**
 * The stop a place would be reached from. A place already in the plan: the stop before it in the
 * greedy order (or the airport). Any other place: the nearest chosen place, or the airport when none.
 */
export function reachFrom(placeId, selectedIds, settings, model) {
  const chosen = (selectedIds || []).filter((id) => model.byId[id]);
  if (chosen.includes(placeId)) {
    const order = greedyOrder(chosen, settings, model);
    const k = order.indexOf(placeId);
    return k > 0 ? order[k - 1] : airportOf(settings, model);
  }
  if (!chosen.length) return airportOf(settings, model);
  return chosen.reduce((best, id) => (kmBetween(model, id, placeId) < kmBetween(model, best, placeId) ? id : best));
}

/**
 * fitInfo → { fits, from, leg, reason }. Fits your trip when:
 * - the leg from the nearest chosen stop (or the airport) is ≤ 4 h,
 * - without a car: some option needs no car and gets there in time, and the leg is not a
 *   no-public-transport drive of more than 1 h (that needs a pre-arranged transfer → "Needs +1 day or a car"),
 * - the visit + drive fits a 10 h day.
 * reason = one line explaining a "Needs" verdict (null when it fits).
 */
export function fitInfo(placeId, selectedIds, settings, model) {
  const place = model.byId[placeId];
  if (!place) return { fits: false, from: null, leg: null, reason: null };
  const car = !!settings?.car;
  const from = reachFrom(placeId, selectedIds, settings, model);
  const leg = resolveLeg(model, from, placeId);
  const fromName = shortName(model.byId[from]);
  const out = (reason) => ({ fits: !reason, from, leg, reason });
  if (leg.driveMin > MAX_DRIVE_MIN) return out(`About ${fmtDuration(leg.driveMin)} by road from ${fromName} — a day on the road`);
  if (!car) {
    const opts = usableOptions(leg, false).filter((o) => o.arrivesOk !== false);
    if (!opts.length) return out(`No way to get there from ${fromName} without a car`);
    if (leg.publicTransport === "none" && leg.driveMin > TRANSFER_MIN) {
      const o = opts[0];
      const cost = fmtCost(o).text;
      return out(`Needs a ${o.label.toLowerCase()} from ${fromName}${cost ? ` · ${cost}` : ""}`);
    }
  }
  if (place.minHours + leg.driveMin / 60 > DAY_HOURS) return out(`${place.minHours} h on site plus ${fmtDuration(leg.driveMin)} on the road won’t fit one day`);
  return out(null);
}

/** fits(placeId, selectedIds, settings, model) → boolean (see fitInfo). */
export const fits = (placeId, selectedIds, settings, model) => fitInfo(placeId, selectedIds, settings, model).fits;

/**
 * Places ranked for the chosen interests: interest overlap (+0.5 for a hidden gem that fits),
 * then reachability (fits first, then the shortest drive from where it would be reached from).
 * → [{ place, match, fits, reason, driveMin, score }]
 */
export function rankPlaces(interests, selectedIds, settings, model) {
  const want = new Set(interests || []);
  return model.places
    .map((place, i) => {
      const match = place.interests.filter((x) => want.has(x)).length;
      const f = fitInfo(place.id, selectedIds, settings, model);
      const score = match + (place.hiddenGem && f.fits ? 0.5 : 0);
      return { place, match, fits: f.fits, reason: f.reason, driveMin: f.leg.driveMin, score, i };
    })
    .sort((a, b) => b.score - a.score || Number(b.fits) - Number(a.fits) || a.driveMin - b.driveMin || a.i - b.i)
    .map(({ i, ...r }) => r);
}

/** Nearest-next order of the chosen places, starting from the arrival airport. */
export function greedyOrder(selectedIds, settings, model) {
  const left = [...new Set(selectedIds || [])].filter((id) => model.byId[id] && !model.airports.some((a) => a.id === id));
  const order = [];
  let cur = airportOf(settings, model);
  while (left.length) {
    let k = 0;
    for (let j = 1; j < left.length; j++) if (kmBetween(model, cur, left[j]) < kmBetween(model, cur, left[k])) k = j;
    cur = left.splice(k, 1)[0];
    order.push(cur);
  }
  return order;
}

const dayTitle = (placeIds, model) => placeIds.map((id) => shortName(model.byId[id])).join(" & ") || "Free day";

const STRUCTURAL = ["DAY_OVERLOAD", "ZIGZAG", "PETRA_TOO_SHORT"];

function daysFromSlots(slots, nDays, model) {
  return Array.from({ length: nDays }, (_, i) => {
    const placeIds = slots[i] ? [...slots[i]] : [];
    return {
      n: i + 1,
      title: dayTitle(placeIds, model),
      text: "",
      placeIds,
      hints: { mode: null, times: [], arrive: i === 0, depart: i === nDays - 1 }
    };
  });
}

/** Order a shared day's places the way the fixer does (least km from the previous base to the next stop). */
function orderPairs(days, settings, model) {
  const ap = airportOf(settings, model);
  days.forEach((d, i) => {
    if (d.placeIds.length !== 2) return;
    const base = days.slice(0, i).reverse().find((x) => x.placeIds.length)?.placeIds.at(-1) || ap;
    const next = d.hints.depart ? (i === days.length - 1 ? departAirportOf(settings, model) : ap) : days.slice(i + 1).find((x) => x.placeIds.length)?.placeIds[0];
    const cost = (p) => {
      const path = [base, ...p, ...(next ? [next] : [])];
      let km = 0;
      for (let k = 0; k + 1 < path.length; k++) km += kmBetween(model, path[k], path[k + 1]);
      return km;
    };
    const [a, b] = d.placeIds;
    if (cost([b, a]) < cost([a, b]) - 1e-9) d.placeIds = [b, a];
    d.title = dayTitle(d.placeIds, model);
  });
  return days;
}

/**
 * Lay the chosen places out over settings.days days (default 5).
 * Greedy nearest-next order, one place per day. With more places than days, two short visits
 * (≤ 3 h each, ≤ 60 km apart) may share a day — never the arrive or depart day (6 h budget), and never
 * when the rules engine would flag that day (DAY_OVERLOAD / ZIGZAG). So the fixer has nothing to restructure.
 * → { days, dropped } — days in the §3 trip shape; dropped = places that don't fit (removed from the draft).
 */
export function layoutDays(selectedIds, settings, model) {
  const nDays = clampDays(settings?.days ?? DEFAULT_DAYS);
  const trip = (days) => ({ days, settings: tripSettings(settings) });
  const slots = greedyOrder(selectedIds, settings, model).map((id) => [id]);
  const short = (s) => s.length === 1 && model.byId[s[0]].minHours <= PAIR_MAX_HOURS;

  // Merged slot a only moves to a lower index later on, so 1 ≤ a ≤ nDays − 2 keeps it off Day 1 and the last day.
  while (slots.length > nDays) {
    const cands = [];
    for (let a = 1; a <= nDays - 2 && a < slots.length; a++) {
      if (!short(slots[a])) continue;
      for (let b = a + 1; b < slots.length; b++) {
        if (!short(slots[b])) continue;
        const km = kmBetween(model, slots[a][0], slots[b][0]);
        if (km <= PAIR_MAX_KM) cands.push({ a, b, km });
      }
    }
    cands.sort((x, y) => x.km - y.km);
    let merged = false;
    for (const { a, b } of cands) {
      const next = slots.map((s) => [...s]);
      next[a].push(next[b][0]);
      next.splice(b, 1);
      const days = orderPairs(daysFromSlots(next, nDays, model), settings, model);
      if (dayIssues(trip(days), a, model).some((x) => STRUCTURAL.includes(x.code) && x.severity !== "info")) continue;
      slots.splice(0, slots.length, ...next);
      merged = true;
      break;
    }
    if (!merged) break;
  }

  const dropped = slots.slice(nDays).flat();
  const days = orderPairs(daysFromSlots(slots.slice(0, nDays), nDays, model), settings, model);
  return { days, dropped };
}

/** buildDays(selectedIds, settings, model) → days[] (see layoutDays). */
export const buildDays = (selectedIds, settings, model) => layoutDays(selectedIds, settings, model).days;

/** The §3 settings object (drops the builder-only `days` count). */
export function tripSettings(s = {}) {
  return {
    airport: s.airport === "AQJ" ? "AQJ" : "AMM",
    departAirport: ["AMM", "AQJ"].includes(s.departAirport) ? s.departAirport : (s.airport === "AQJ" ? "AQJ" : "AMM"),
    month: Number(s.month) || 10,
    travelers: Number(s.travelers) || 1,
    budget: s.budget || "mid",
    car: !!s.car,
    startDate: s.startDate || null,
    pace: ["relaxed", "balanced", "packed"].includes(s.pace) ? s.pace : "balanced"
  };
}

const sameDays = (a, b) => JSON.stringify(a.map((d) => d.placeIds)) === JSON.stringify(b.map((d) => d.placeIds));

/**
 * The live draft for the "Your plan so far" panel, and what "Build my plan" saves.
 * res = fix(builder days): every leg gets its recommended option. The builder never pairs places into a day
 * with a structural issue, so res.days normally keep the greedy order. Two cases differ:
 * - the plain check has a not-feasible day → the fixer may move places (the one exception; `moves` lists them);
 * - a risky-only single-place day makes the fixer restructure → we keep the greedy days and treat the plan
 *   as not clean (needsReorder), so the Reality Check shows why and "Fix all" does the reorder in the open.
 * clean = res.days are the draft days and no risky / nf day is left after fix() → saved as a fixed plan
 * (score = res.fixed.score). Otherwise saved as a checked plan (score = plain.score).
 * → { trip, dropped, plain, res, clean, needsReorder, score, moves }
 *   plain = check(trip) without chosen options (its risky/nf reasons are the amber lines).
 */
export function draftPlan(selectedIds, settings, model) {
  const { days, dropped } = layoutDays(selectedIds, settings, model);
  const base = {
    title: `Your ${days.length}-day plan`, source: "build", rawText: "", settings: tripSettings(settings), days
  };
  if (!days.some((d) => d.placeIds.length)) {
    return { trip: base, dropped, plain: check(base, model), res: null, clean: false, needsReorder: false, score: null, moves: [] };
  }
  const res = fix(base, model);
  const hasNf = check(base, model).counts.nf > 0;
  const reordered = !sameDays(res.days, days);
  const needsReorder = reordered && !hasNf;
  const trip = needsReorder ? base : { ...base, days: res.days.map((d) => ({ ...d, text: d.text || "" })) };
  const plain = check(trip, model);
  const clean = !needsReorder && res.check.counts.nf + res.check.counts.risky === 0;
  const score = clean ? res.fixed.score : plain.score;
  const dayOf = (ds, id) => ds.find((d) => d.placeIds.includes(id))?.n ?? null;
  const moves = days.flatMap((d) => d.placeIds)
    .map((id) => ({ placeId: id, from: dayOf(days, id), to: dayOf(trip.days, id) }))
    .filter((m) => m.to && m.from !== m.to);
  return { trip, dropped, plain, res, clean, needsReorder, score, moves };
}
