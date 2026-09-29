// "Build a plan" logic (07): rank places, decide what fits, lay places out over the days, score the draft.
// Pure, no DOM. Everything is decided by the rules engine (rules.js / fixer.js), never guessed.
import { resolveLeg, kmBetween, shortName } from "./model.js";
import { check, airportOf } from "./rules.js";
import { fix } from "./fixer.js";

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
const FULL_DAY_HOURS = 5;     // Petra, Wadi Rum, Dana take a whole day
const PAIR_MAX_HOURS = 3;     // two short visits may share a day…
const PAIR_MAX_KM = 60;       // …when they are close together

const clampDays = (n) => Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(Number(n)) || DEFAULT_DAYS));

/** The stop a place would be reached from: the nearest already-chosen place, or the arrival airport. */
export function reachFrom(placeId, selectedIds, settings, model) {
  const others = (selectedIds || []).filter((id) => id !== placeId && model.byId[id]);
  if (!others.length) return airportOf(settings, model);
  return others.reduce((best, id) => (kmBetween(model, id, placeId) < kmBetween(model, best, placeId) ? id : best));
}

/**
 * Fits your trip: reachable from the nearest chosen stop (or the airport) in ≤ 4 h,
 * by car or by an option that needs no car and gets there in time, and the visit + drive fits a 10 h day.
 */
export function fits(placeId, selectedIds, settings, model) {
  const place = model.byId[placeId];
  if (!place) return false;
  const from = reachFrom(placeId, selectedIds, settings, model);
  const leg = resolveLeg(model, from, placeId);
  if (leg.driveMin > MAX_DRIVE_MIN) return false;
  const reachable = !!settings?.car || leg.options.some((o) => !o.requiresCar && o.arrivesOk !== false);
  return reachable && place.minHours + leg.driveMin / 60 <= DAY_HOURS;
}

/**
 * Places ranked for the chosen interests: interest overlap (+0.5 for a hidden gem that fits),
 * then reachability (fits first, then the shortest drive from where it would be reached from).
 * → [{ place, match, fits, driveMin, score }]
 */
export function rankPlaces(interests, selectedIds, settings, model) {
  const want = new Set(interests || []);
  return model.places
    .map((place, i) => {
      const match = place.interests.filter((x) => want.has(x)).length;
      const ok = fits(place.id, selectedIds, settings, model);
      const from = reachFrom(place.id, selectedIds, settings, model);
      const driveMin = resolveLeg(model, from, place.id).driveMin;
      const score = match + (place.hiddenGem && ok ? 0.5 : 0);
      return { place, match, fits: ok, driveMin, score, i };
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

/**
 * Lay the chosen places out over settings.days days (default 5).
 * → { days, dropped } — days in the §3 trip shape; dropped = places that don't fit (removed from the draft).
 */
export function layoutDays(selectedIds, settings, model) {
  const nDays = clampDays(settings?.days ?? DEFAULT_DAYS);
  const slots = greedyOrder(selectedIds, settings, model).map((id) => [id]);
  const short = (s) => s.length === 1 && model.byId[s[0]].minHours <= PAIR_MAX_HOURS;

  // More places than days: let two short, nearby visits share a day (closest pair first).
  while (slots.length > nDays) {
    let best = null;
    for (let a = 0; a < slots.length; a++) {
      if (!short(slots[a])) continue;
      for (let b = a + 1; b < slots.length; b++) {
        if (!short(slots[b])) continue;
        const km = kmBetween(model, slots[a][0], slots[b][0]);
        if (km <= PAIR_MAX_KM && (!best || km < best.km)) best = { a, b, km };
      }
    }
    if (!best) break;
    slots[best.a].push(slots[best.b][0]);
    slots.splice(best.b, 1);
  }

  const dropped = slots.slice(nDays).flat();
  const kept = slots.slice(0, nDays);
  const days = Array.from({ length: nDays }, (_, i) => {
    const placeIds = kept[i] || [];
    return {
      n: i + 1,
      title: dayTitle(placeIds, model),
      text: "",
      placeIds: [...placeIds],
      hints: { mode: null, times: [], arrive: i === 0, depart: i === nDays - 1 }
    };
  });
  return { days, dropped };
}

/** buildDays(selectedIds, settings, model) → days[] (see layoutDays). */
export const buildDays = (selectedIds, settings, model) => layoutDays(selectedIds, settings, model).days;

/** The §3 settings object (drops the builder-only `days` count). */
export function tripSettings(s = {}) {
  return {
    airport: s.airport === "AQJ" ? "AQJ" : "AMM",
    month: Number(s.month) || 10,
    travelers: Number(s.travelers) || 1,
    budget: s.budget || "mid",
    car: !!s.car,
    startDate: s.startDate || null,
    pace: ["relaxed", "balanced", "packed"].includes(s.pace) ? s.pace : "balanced"
  };
}

const hasProblems = (c) => c.counts.nf + c.counts.risky > 0;

/**
 * The live draft for the "Your plan so far" panel.
 * Greedy layout → if any day is risky / not feasible, the fixer's days are used instead.
 * score = the draft's check score while problems remain, otherwise the score a clean plan gets (fixed score).
 * → { trip, dropped, check, plain, score, fixedByEngine, moves }
 *   check = check(trip) with the fixer's chosen options (the problems really left once transport is booked),
 *   plain = check(trip) as the Reality Check page will first show it, moves = [{ placeId, from, to }] day numbers.
 */
export function draftPlan(selectedIds, settings, model) {
  const { days, dropped } = layoutDays(selectedIds, settings, model);
  const nDays = days.length;
  const base = {
    title: `Your ${nDays}-day plan`, source: "build", rawText: "", settings: tripSettings(settings), days
  };
  if (!days.some((d) => d.placeIds.length)) {
    const c = check(base, model);
    return { trip: base, dropped, check: c, plain: c, score: null, fixedByEngine: false, moves: [] };
  }
  const first = check(base, model);
  const res = fix(base, model);
  const fixedByEngine = hasProblems(first);
  const trip = fixedByEngine
    ? { ...base, days: res.days.map((d) => ({ ...d, text: d.text || "" })) }
    : base;
  const after = fixedByEngine ? res.check : check(trip, model, res.chosen);
  const score = hasProblems(after) ? after.score : res.fixed.score;
  const dayOf = (ds, id) => ds.find((d) => d.placeIds.includes(id))?.n ?? null;
  const moves = fixedByEngine
    ? days.flatMap((d) => d.placeIds)
      .map((id) => ({ placeId: id, from: dayOf(days, id), to: dayOf(trip.days, id) }))
      .filter((m) => m.to && m.from !== m.to)
    : [];
  return { trip, dropped, check: after, plain: fixedByEngine ? check(trip, model) : first, score, fixedByEngine, moves };
}
