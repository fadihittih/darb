// Reality rules (§4.2–4.3): check(trip, model) → { score, counts, days, pass }. Pure, no DOM.
import { resolveLeg, kmBetween, shortName } from "./model.js";
import { bearing, bearingDiff } from "./geo.js";
import { passValue } from "./pass.js";
import { fmtCost, fmtDuration } from "./format.js";

const HUB = "amman";
const RANK = { info: 0, risky: 1, nf: 2 };
const SUMMER = [6, 7, 8];
const WINTER = [12, 1, 2];
const HOT_PLACES = ["dead-sea", "wadi-rum", "aqaba"];
const PUBLIC_MODES = ["bus", "minibus"];

export const airportOf = (settings, model) => (model.byId[settings?.airport] ? settings.airport : "AMM");
/** Airport the trip flies home from: settings.departAirport when it is a known airport, else the arrival airport. */
export const departAirportOf = (settings, model) =>
  (model.airports.some((a) => a.id === settings?.departAirport) ? settings.departAirport : airportOf(settings, model));
const name = (model, id) => shortName(model.byId[id]);
export const chosenKey = (n, legKey) => `${n}|${legKey}`;

/** Options usable for this trip, recommended first. */
export function usableOptions(leg, car) {
  const ok = leg.options.filter((o) => (car || !o.requiresCar));
  return ok.sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
}

/** A chosen option fixes a transport problem when it gets there without public transport or a car we don't have. */
export const solves = (opt, car) =>
  !!opt && opt.arrivesOk !== false && (car || !opt.requiresCar) && !PUBLIC_MODES.includes(opt.mode);

/**
 * Stops of day i: previous base (last place of the previous day with places, or the airport)
 * + today's places (+ the airport on a depart day). Consecutive duplicates removed.
 * legs[k].isTransfer = the morning move from the previous base.
 */
export function dayRoute(days, i, settings, model) {
  const ap = airportOf(settings, model);
  let base = ap;
  for (let j = i - 1; j >= 0; j--) {
    if (days[j].placeIds.length) { base = days[j].placeIds.at(-1); break; }
  }
  const d = days[i];
  const seq = [base, ...d.placeIds];
  if (d.hints?.depart) seq.push(i === days.length - 1 ? departAirportOf(settings, model) : ap);
  const stops = seq.filter((s, k) => k === 0 || s !== seq[k - 1]);
  const movesFromBase = d.placeIds.length === 0 || d.placeIds[0] !== base;
  const legs = [];
  for (let k = 0; k + 1 < stops.length; k++) {
    legs.push({ ...resolveLeg(model, stops[k], stops[k + 1]), index: k, isTransfer: k === 0 && movesFromBase });
  }
  return { base, stops, legs };
}

function optionFixes(leg, car) {
  return usableOptions(leg, car)
    .filter((o) => o.arrivesOk !== false && !PUBLIC_MODES.includes(o.mode))
    .map((o) => ({ kind: "option", legKey: leg.key, label: o.label, sub: fmtDuration(o.durationMin), costText: fmtCost(o).text, recommended: !!o.recommended }));
}

function issue(code, severity, reason, extra = {}) {
  return { code, severity, reason, fixes: [], ...extra };
}

/**
 * Visit hours (halved for a place also on the previous day) + drive hours between today's stops.
 * The morning transfer from the previous base is not counted (LONG_TRANSFER covers it) — except on the
 * arrival day, where the airport → first place drive is part of the short 6 h day.
 */
export function dayHours(d, i, prevPlaces, route, model) {
  let h = 0;
  for (const id of d.placeIds) h += model.byId[id].minHours * (prevPlaces.includes(id) ? 0.5 : 1);
  const arrival = i === 0 && !!d.hints?.arrive;
  for (const leg of route.legs) if (!leg.isTransfer || arrival) h += leg.driveMin / 60;
  return h;
}

export function dayBudget(d, settings) {
  const base = d.hints?.arrive || d.hints?.depart ? 6 : 10;
  return base + (settings.pace === "relaxed" ? -2 : settings.pace === "packed" ? 2 : 0);
}

const compass = (deg) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(deg / 45) % 8];

/** Issues of one day (transport issues are skipped for legs whose chosen option solves them). */
export function dayIssues(trip, i, model, chosen = {}, route = dayRoute(trip.days, i, trip.settings, model)) {
  const { days, settings } = trip;
  const d = days[i];
  const car = !!settings.car;
  const times = d.hints?.times || [];
  const out = [];

  for (const leg of route.legs) {
    const picked = chosen[chosenKey(d.n, leg.key)];
    if (car || solves(picked, car)) continue;
    const A = name(model, leg.from);
    const B = name(model, leg.to);
    const legInfo = { legKey: leg.key, legId: leg.id, from: leg.from, to: leg.to };
    if (leg.publicTransport === "none") {
      const sunset = !!leg.timeSensitive && times.includes("sunset");
      if (d.hints?.mode === "bus" || sunset) {
        const reason = (leg.evidence ? leg.evidence + " " : "") +
          `No scheduled public bus from ${A} gets you to ${B}${sunset ? " in time for a sunset tour" : ""}.`;
        const it = issue("NO_PUBLIC_TRANSPORT", "nf", reason, legInfo);
        it.fixes = optionFixes(leg, car);
        if (leg.timeSensitive) {
          it.fixes.push({ kind: "addNight", legKey: leg.key, label: `Full day in ${A}, ${B} next morning`, sub: "Adds one night · same transfer, no rush", costText: "", recommended: false });
        }
        out.push(it);
      } else {
        const it = issue("NO_PUBLIC_TRANSPORT_SOFT", "info", `No public transport between ${A} and ${B} — plan a taxi or driver.`, legInfo);
        it.fixes = optionFixes(leg, car);
        out.push(it);
      }
    }
    if (leg.isTransfer && leg.driveMin > 240) {
      const it = issue("LONG_TRANSFER", "risky", `${A} → ${B} is about ${fmtDuration(leg.driveMin)} by road with no direct bus — most of the day is gone before you start.`, legInfo);
      it.fixes = optionFixes(leg, car);
      out.push(it);
    }
    const rec = usableOptions(leg, car)[0];
    if (!leg.isTransfer && rec?.departs && PUBLIC_MODES.includes(rec.mode)) {
      const it = issue("ONE_DEPARTURE", "risky", `The only ${rec.label} leaves at ${rec.departs} — a visit in ${A} the same morning doesn't fit.`, legInfo);
      it.fixes = optionFixes(leg, car);
      out.push(it);
    }
  }

  if (d.placeIds.length) {
    const prev = i > 0 ? days[i - 1].placeIds : [];
    const hours = dayHours(d, i, prev, route, model);
    const budget = dayBudget(d, settings);
    const over = hours - budget;
    if (over > 0) {
      out.push(issue("DAY_OVERLOAD", over > 2 ? "nf" : "risky",
        `About ${Math.round(hours * 2) / 2} h of visits and driving against a ${budget} h day.`,
        { fixes: [{ kind: "reorder", label: "Spread the places over the trip", sub: "", costText: "", recommended: true }] }));
    }
  }

  const hub = model.byId[HUB];
  const ps = d.placeIds.filter((id) => id !== HUB);
  zig: for (let a = 0; a < ps.length; a++) {
    for (let b = a + 1; b < ps.length; b++) {
      const pa = model.byId[ps[a]];
      const pb = model.byId[ps[b]];
      const ba = bearing(hub, pa);
      const bb = bearing(hub, pb);
      if (kmBetween(model, ps[a], ps[b]) > 60 && bearingDiff(ba, bb) > 100) {
        const seed = model.legIndex[`${ps[a]}|${ps[b]}`];
        const reason = seed?.warning ||
          `${shortName(pa)} is ${compass(ba)} of Amman and ${shortName(pb)} is ${compass(bb)} — no direct bus between them and hours on the road.`;
        out.push(issue("ZIGZAG", "risky", reason, { placeIds: [ps[a], ps[b]], fixes: [{ kind: "reorder", label: "Reorder the days by direction", sub: "", costText: "", recommended: true }] }));
        break zig;
      }
    }
  }

  const petraDays = days.filter((x) => x.placeIds.includes("petra")).length;
  if (petraDays === 1 && d.placeIds.includes("petra") && d.placeIds.length > 1) {
    const other = d.placeIds.filter((x) => x !== "petra").map((x) => name(model, x)).join(" and ");
    out.push(issue("PETRA_TOO_SHORT", "risky", `Petra needs a full day (6+ h on foot); sharing it with ${other} means rushing both.`,
      { placeId: "petra", fixes: [{ kind: "reorder", label: "Give Petra its own day", sub: "", costText: "", recommended: true }] }));
  }

  const month = Number(settings.month);
  if (SUMMER.includes(month) && times.includes("afternoon")) {
    const hot = d.placeIds.filter((x) => HOT_PLACES.includes(x));
    if (hot.length) {
      out.push(issue("SEASON", "risky", `${name(model, hot[0])} on a summer afternoon means extreme midday heat — go early morning or late afternoon.`, { placeId: hot[0] }));
    }
  }
  if (WINTER.includes(month) && d.placeIds.includes("wadi-rum") && (times.includes("night") || times.includes("evening") || /camp|overnight/i.test(d.text || ""))) {
    out.push(issue("SEASON", "info", "Wadi Rum nights drop close to freezing in winter — bring a warm jacket.", { placeId: "wadi-rum" }));
  }
  return out;
}

export const dayStatus = (issues) => {
  const worst = issues.reduce((m, x) => Math.max(m, RANK[x.severity]), 0);
  return worst === 2 ? "nf" : worst === 1 ? "risky" : "ok";
};

export const scoreFor = (counts) => Math.max(5, 100 - 28 * counts.nf - 14 * counts.risky);

/** check(trip, model, chosen?) → { score, counts, days:[{n, status, issues}], pass } */
export function check(trip, model, chosen = {}) {
  const days = trip.days.map((d, i) => {
    const issues = dayIssues(trip, i, model, chosen);
    return { n: d.n, status: dayStatus(issues), issues };
  });
  const counts = { ok: 0, risky: 0, nf: 0 };
  for (const d of days) counts[d.status]++;
  return { score: scoreFor(counts), counts, days, pass: passValue(trip.days, model) };
}

/** Anonymous summary for the `events` collection (no personal data). */
export function eventSummary(trip, result, model) {
  const blocked = new Set();
  const risky = new Set();
  for (const d of result.days) {
    for (const it of d.issues) {
      if (!it.legKey) continue;
      const label = `${name(model, it.from)} → ${name(model, it.to)}`;
      if (it.severity === "nf") blocked.add(label);
      else if (it.severity === "risky") risky.add(label);
    }
  }
  return {
    score: result.score,
    days: trip.days.length,
    car: !!trip.settings.car,
    month: Number(trip.settings.month) || null,
    blockedLegs: [...blocked],
    riskyLegs: [...risky],
    places: [...new Set(trip.days.flatMap((d) => d.placeIds))]
  };
}
