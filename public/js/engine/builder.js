// "Build a plan" logic (07): rank places, decide what fits, lay places out over the days, score the draft.
// Pure, no DOM. Everything is decided by the rules engine (rules.js / fixer.js), never guessed.
import { resolveLeg, kmBetween, shortName } from "./model.js";
import { check, airportOf, usableOptions } from "./rules.js";
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

/** The stop a place would be reached from: the nearest already-chosen place, or the arrival airport. */
export function reachFrom(placeId, selectedIds, settings, model) {
  const others = (selectedIds || []).filter((id) => id !== placeId && model.byId[id]);
  if (!others.length) return airportOf(settings, model);
  return others.reduce((best, id) => (kmBetween(model, id, placeId) < kmBetween(model, best, placeId) ? id : best));
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

/**
 * The live draft for the "Your plan so far" panel, and the fixed plan "Build my plan" saves.
 * res = fix(greedy layout): every leg gets its recommended option. The greedy nearest-next order is kept
 * unless the plain check has a not-feasible day — then the fixer's days are used (risky-only plans are not
 * reordered by us; the fixer only picks transfer options, or restructures a day it flags as overloaded/zigzag).
 * score = res.fixed.score when the plain check of the draft has no nf day, else that check's score.
 * → { trip, dropped, plain, res, score, fixedByEngine, moves }
 *   plain = check(trip) without chosen options (its risky/nf reasons are the amber lines),
 *   moves = [{ placeId, from, to }] day numbers of places the fixer moved.
 */
export function draftPlan(selectedIds, settings, model) {
  const { days, dropped } = layoutDays(selectedIds, settings, model);
  const base = {
    title: `Your ${days.length}-day plan`, source: "build", rawText: "", settings: tripSettings(settings), days
  };
  if (!days.some((d) => d.placeIds.length)) {
    return { trip: base, dropped, plain: check(base, model), res: null, score: null, fixedByEngine: false, moves: [] };
  }
  const res = fix(base, model);
  const fixedByEngine = check(base, model).counts.nf > 0;
  // The saved days are the fixer's days (so `fixed` matches `days`); without an nf day they are the greedy order.
  const trip = { ...base, days: res.days.map((d) => ({ ...d, text: d.text || "" })) };
  const plain = check(trip, model);
  const score = plain.counts.nf > 0 ? plain.score : res.fixed.score;
  const dayOf = (ds, id) => ds.find((d) => d.placeIds.includes(id))?.n ?? null;
  const moves = days.flatMap((d) => d.placeIds)
    .map((id) => ({ placeId: id, from: dayOf(days, id), to: dayOf(trip.days, id) }))
    .filter((m) => m.to && m.from !== m.to);
  return { trip, dropped, plain, res, score, fixedByEngine, moves };
}
