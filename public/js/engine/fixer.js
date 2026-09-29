// Fixer (§4.4): fix(trip, model, choices?) → corrected plan with every leg costed. Pure, no DOM.
import { check, dayRoute, dayIssues, usableOptions, solves, chosenKey } from "./rules.js";
import { kmBetween, shortName } from "./model.js";
import { dayTitle } from "./parser.js";
import { fmtCost, fmtDuration, fmtDate } from "./format.js";

const STRUCTURAL = ["ZIGZAG", "DAY_OVERLOAD", "PETRA_TOO_SHORT"];
const PUBLIC_MODES = ["bus", "minibus"];

const cloneDays = (days) => days.map((d) => ({ ...d, placeIds: [...d.placeIds], hints: { ...d.hints, times: [...(d.hints?.times || [])] } }));
const renumber = (days) => days.forEach((d, i) => { d.n = i + 1; });
const name = (model, id) => shortName(model.byId[id]);

function structuralIssues(trip, i, model) {
  return dayIssues(trip, i, model, {}).filter((x) => STRUCTURAL.includes(x.code) && x.severity !== "info");
}
const structuralTotal = (trip, model) => trip.days.reduce((s, _, i) => s + structuralIssues(trip, i, model).length, 0);

function permutations(a) {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Order each day's places to minimise km from the previous base through to the next day's first stop. */
function orderAll(trip, model) {
  const { days } = trip;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.placeIds.length < 2 || d.placeIds.length > 6) continue;
    const route = dayRoute(days, i, trip.settings, model);
    const base = route.base;
    // On a depart day the route ends at the right airport (departAirportOf on the last day).
    const next = d.hints?.depart ? route.stops.at(-1) : days.slice(i + 1).find((x) => x.placeIds.length)?.placeIds[0];
    let best = null;
    for (const p of permutations(d.placeIds)) {
      const path = [base, ...p, ...(next ? [next] : [])];
      let km = 0;
      for (let k = 0; k + 1 < path.length; k++) km += kmBetween(model, path[k], path[k + 1]);
      if (!best || km < best.km - 1e-9) best = { p, km };
    }
    d.placeIds = best.p;
  }
}

function routeKm(trip, model) {
  let km = 0;
  trip.days.forEach((_, i) => dayRoute(trip.days, i, trip.settings, model).legs.forEach((l) => { km += l.km; }));
  return km;
}

const withTrip = (trip, days) => ({ ...trip, days });

/** Swap / move places between days until no day has ZIGZAG or DAY_OVERLOAD or PETRA_TOO_SHORT. */
function reorder(trip, model, changes) {
  let t = withTrip(trip, cloneDays(trip.days));
  orderAll(t, model);
  for (let round = 0; round < 6; round++) {
    const bad = t.days.map((_, i) => i).filter((i) => structuralIssues(t, i, model).length);
    if (!bad.length) break;
    const before = structuralTotal(t, model);
    let best = null;
    for (const d of bad) {
      for (let p = 0; p < t.days[d].placeIds.length; p++) {
        for (let e = 0; e < t.days.length; e++) {
          if (e === d) continue;
          for (let q = 0; q < t.days[e].placeIds.length; q++) {
            const P = t.days[d].placeIds[p];
            const Q = t.days[e].placeIds[q];
            if (P === Q || t.days[d].placeIds.includes(Q) || t.days[e].placeIds.includes(P)) continue;
            const c = withTrip(t, cloneDays(t.days));
            c.days[d].placeIds[p] = Q;
            c.days[e].placeIds[q] = P;
            orderAll(c, model);
            if (structuralIssues(c, d, model).length || structuralIssues(c, e, model).length) continue;
            if (structuralTotal(c, model) >= before) continue;
            // Least disruption first (nearest day), then the lowest total km.
            const km = routeKm(c, model);
            const gap = Math.abs(e - d);
            if (!best || gap < best.gap || (gap === best.gap && km < best.km)) best = { c, km, gap, d, e, P, Q };
          }
        }
      }
    }
    if (best) {
      t = best.c;
      const stay = t.days[best.d].placeIds.filter((x) => x !== best.Q).map((x) => name(model, x));
      const lastDay = best.e === t.days.length - 1 && t.days[best.e].hints?.depart;
      changes.push({
        day: best.d + 1,
        text: `Pair ${stay.join(" & ") || "this day"} with ${name(model, best.Q)} (same direction) and visit ${name(model, best.P)} on Day ${best.e + 1}${lastDay ? " before your flight" : ""}.`
      });
      continue;
    }
    // No clean swap: move one place from a bad day to the nearest day that still has room.
    let moved = false;
    for (const d of bad) {
      for (const P of [...t.days[d].placeIds].reverse()) {
        const order = t.days.map((_, e) => e).filter((e) => e !== d).sort((a, b) => Math.abs(a - d) - Math.abs(b - d));
        for (const e of order) {
          const c = withTrip(t, cloneDays(t.days));
          c.days[d].placeIds = c.days[d].placeIds.filter((x) => x !== P);
          if (!c.days[e].placeIds.includes(P)) c.days[e].placeIds.push(P);
          orderAll(c, model);
          if (structuralIssues(c, d, model).length || structuralIssues(c, e, model).length) continue;
          t = c;
          changes.push({ day: d + 1, text: `Move ${name(model, P)} to Day ${e + 1}.` });
          moved = true;
          break;
        }
        if (moved) break;
      }
      if (moved) break;
    }
    if (!moved) {
      changes.push({ day: bad[0] + 1, text: "This plan needs one more day (or a car) to work — add a day and check again." });
      break;
    }
  }
  return t;
}

/** "Full day in A, B next morning": split the day at the leg and insert a new day. */
function addNight(trip, n, legKey, model) {
  const days = cloneDays(trip.days);
  const i = days.findIndex((d) => d.n === n);
  if (i < 0) return trip;
  const to = legKey.split("~")[1];
  const d = days[i];
  const at = d.placeIds.indexOf(to);
  if (at < 0) return trip;
  const rest = d.placeIds.slice(at);
  d.placeIds = d.placeIds.slice(0, at);
  d.hints.times = d.hints.times.filter((x) => x !== "sunset");
  const depart = d.hints.depart;
  d.hints.depart = false;
  const extra = { n: 0, title: "", text: `${name(model, to)} next morning`, placeIds: rest, hints: { mode: null, times: ["morning"], arrive: false, depart } };
  days.splice(i + 1, 0, extra);
  renumber(days);
  return withTrip(trip, days);
}

const OWN_CAR = (leg) => ({ mode: "own-car", label: "Drive (your car)", durationMin: leg.driveMin, cost: null, status: "own" });

/** Pick the option for every leg. choices = { "<n>|<legKey>": optionLabel } from the check screen. */
function chooseOptions(trip, model, choices) {
  const car = !!trip.settings.car;
  const chosen = {};
  const routes = trip.days.map((d, i) => {
    const route = dayRoute(trip.days, i, trip.settings, model);
    for (const leg of route.legs) {
      const key = chosenKey(d.n, leg.key);
      let pick;
      if (car) {
        pick = OWN_CAR(leg);
      } else {
        const opts = usableOptions(leg, false).filter((o) => o.arrivesOk !== false);
        const rec = opts[0];
        const need = leg.publicTransport === "none" || (leg.isTransfer && leg.driveMin > 240) ||
          (!leg.isTransfer && rec?.departs && PUBLIC_MODES.includes(rec.mode));
        pick = opts.find((o) => o.label === choices[key]) ||
          (need ? opts.find((o) => solves(o, false)) : rec) || rec || leg.options[0];
      }
      chosen[key] = pick;
    }
    return route;
  });
  return { chosen, routes };
}

function visitCost(place, pass) {
  const t = place.ticket;
  if (!t) return "";
  if (t.coveredByJordanPass && pass.paysOff) return "Jordan Pass";
  if (t.jod == null) return t.label;
  if (t.jod === 0) return "Free";
  return `${t.status === "verified" ? "" : "est. "}${t.jod} JOD`;
}

function fixedDayTitle(d, route, model, isLast) {
  const names = d.placeIds.map((id) => name(model, id));
  if (!names.length) return isLast ? "Fly home" : "Free day";
  if (d.hints?.arrive && d.n === 1) return `Arrive — ${names.join(" → ")}`;
  if (d.hints?.depart && isLast) return `${names.join(" → ")}, then fly home`;
  const start = route.base !== d.placeIds[0] && model.byId[route.base] && !model.airports.some((a) => a.id === route.base)
    ? [name(model, route.base)] : [];
  return [...start, ...names].join(" → ");
}

const INSTEAD = {
  NO_PUBLIC_TRANSPORT: "instead of the bus that doesn't exist",
  LONG_TRANSFER: "instead of a long day on local transport",
  ONE_DEPARTURE: "instead of racing for the only departure"
};

/**
 * One "What changed" line per transport issue the fixer resolved by choosing an option
 * (kind: "option", so the check page can leave them out of its structural suggestions).
 */
function optionChanges(before, after, t, routes, chosen, model, changes) {
  const seen = new Set();
  for (const bd of before.days) {
    for (const it of bd.issues) {
      if (!it.legKey || it.severity === "info" || seen.has(it.legKey)) continue;
      // The leg may sit on another day after a reorder / added night: prefer the same day number.
      const idx = t.days.map((_, i) => i).filter((i) => routes[i].legs.some((l) => l.key === it.legKey))
        .sort((a, b) => Math.abs(t.days[a].n - bd.n) - Math.abs(t.days[b].n - bd.n))[0];
      if (idx == null) continue;
      const n = t.days[idx].n;
      const o = chosen[chosenKey(n, it.legKey)];
      if (!o || o.mode === "own-car" || !solves(o, false)) continue;
      const stillOpen = after.days[idx]?.issues.some((x) => x.legKey === it.legKey && x.severity !== "info");
      if (stillOpen) continue;
      seen.add(it.legKey);
      const [from, to] = it.legKey.split("~");
      const c = o.cost ? ` (${fmtCost(o).text})` : "";
      changes.push({ day: n, kind: "option", text: `${o.label} ${name(model, from)} → ${name(model, to)}${c} ${INSTEAD[it.code] || "instead of public transport"}.` });
    }
  }
}

/**
 * fix(trip, model, { choices, addNights }) →
 * { days, fixed: { score, fixesApplied, days:[{n,title,items}], cost, changes }, check, chosen }
 */
export function fix(trip, model, opts = {}) {
  const choices = opts.choices || {};
  const before = check(trip, model);
  const changes = [];

  let t = withTrip(trip, cloneDays(trip.days));
  for (const k of opts.addNights || []) {
    const [n, legKey] = k.split("|");
    t = addNight(t, Number(n), legKey, model);
    changes.push({ day: Number(n), text: `Stay the night: ${name(model, legKey.split("~")[0])} gets a full day, ${name(model, legKey.split("~")[1])} moves to the next morning.` });
  }
  t = reorder(t, model, changes);
  t.days.forEach((d) => { d.title = dayTitle(d.placeIds, model); });

  const { chosen, routes } = chooseOptions(t, model, choices);
  const after = check(t, model, chosen);
  optionChanges(before, after, t, routes, chosen, model, changes);
  changes.sort((a, b) => a.day - b.day); // stable: same-day lines keep their order
  const hard = after.counts.nf + after.counts.risky;
  const legs = Object.values(chosen);
  const estLegs = legs.filter((o) => o.status === "est").length;
  const score = hard === 0 ? Math.max(80, 100 - estLegs) : after.score;
  const pass = after.pass;

  const fixedDays = t.days.map((d, i) => {
    const route = routes[i];
    const items = [];
    route.stops.forEach((stop, k) => {
      if (k > 0) {
        const leg = route.legs[k - 1];
        const o = chosen[chosenKey(d.n, leg.key)];
        const c = fmtCost(o);
        const alt = usableOptions(leg, !!t.settings.car).find((x) => x.label !== o.label && x.arrivesOk !== false);
        items.push({
          kind: "leg", legKey: leg.key, legId: leg.id, from: leg.from, to: leg.to, mode: o.mode,
          label: `${name(model, leg.from)} → ${name(model, leg.to)}`,
          sub: [o.label, o.departs, fmtDuration(o.durationMin ?? leg.driveMin), c.verified ? `verified ${fmtDate(o.verifiedOn)}` : ""].filter(Boolean).join(" · "),
          costText: c.text, verified: c.verified,
          option: { mode: o.mode, label: o.label, departs: o.departs || null, durationMin: o.durationMin ?? leg.driveMin, cost: o.cost || null, status: o.status, verifiedOn: o.verifiedOn || null },
          lateAlt: alt ? `${alt.label}${alt.cost ? ` (${fmtCost(alt).text})` : ""}` : null
        });
      }
      const visitable = model.byId[stop] && !model.airports.some((a) => a.id === stop) && (k > 0 || d.placeIds[0] === stop);
      if (visitable && d.placeIds.includes(stop)) {
        const p = model.byId[stop];
        items.push({ kind: "visit", placeId: stop, label: p.name, sub: `${p.minHours} h+`, costText: visitCost(p, pass), verified: p.ticket?.status === "verified" });
      }
    });
    return { n: d.n, title: fixedDayTitle(d, route, model, i === t.days.length - 1), items };
  });

  // Trip cost (§4.6)
  const passLine = pass.paysOff
    ? { label: `${pass.tier.name} (visa + sites)`, jod: pass.tier.jod }
    : { label: "Visa + entry tickets", jod: pass.separate };
  let fixedJod = 0;
  const range = [0, 0];
  let unknown = 0;
  for (const o of legs) {
    if (!o.cost) { if (o.mode !== "own-car") unknown++; continue; }
    if (o.status === "verified") fixedJod += o.cost[0];
    else { range[0] += o.cost[0]; range[1] += o.cost[1]; }
  }
  const cost = {
    pass: passLine, passJod: passLine.jod, busJod: fixedJod, transfers: range, unknownLegs: unknown,
    total: [passLine.jod + fixedJod + range[0], passLine.jod + fixedJod + range[1]],
    savings: pass.paysOff ? pass.savings : 0
  };

  const nonOk = (r) => r.days.filter((d) => d.status !== "ok").length;
  return {
    days: t.days,
    fixed: { score, fixesApplied: Math.max(0, nonOk(before) - nonOk(after)), days: fixedDays, cost, changes, estLegs },
    check: after,
    chosen
  };
}
