// Reference-data model: lookups, data freshness and leg resolution. Pure, no DOM, no Firebase.
import { haversine, roadKm, driveMinutes } from "./geo.js";

export const STALE_DAYS = 90;
const DAY_MS = 86400000;

export function daysSince(isoDate, today) {
  if (!isoDate) return Infinity;
  return Math.floor((new Date(today) - new Date(isoDate)) / DAY_MS);
}

/** A "verified" value older than 90 days (or without a date) is shown as est. */
function freshen(o, today) {
  if (!o || o.status !== "verified") return o;
  return daysSince(o.verifiedOn, today) > STALE_DAYS ? { ...o, status: "est", stale: true } : o;
}

/**
 * raw = { places, airports, legs, pass } (the shapes in /public/data/*.json).
 * Returns the model every engine function takes.
 */
export function buildModel(raw, today = new Date()) {
  const places = raw.places.map((p) => ({ ...p, ticket: freshen(p.ticket, today) }));
  const airports = raw.airports || [];
  const byId = Object.fromEntries([...places, ...airports].map((p) => [p.id, p]));
  const legIndex = {};
  for (const l of raw.legs) {
    const leg = { ...l, options: (l.options || []).map((o) => freshen(o, today)) };
    legIndex[`${l.from}|${l.to}`] = leg;
    if (!l.oneWay) legIndex[`${l.to}|${l.from}`] = leg;
  }
  return { places, airports, byId, legIndex, pass: raw.pass, today: new Date(today) };
}

export const legKey = (from, to) => `${from}~${to}`;

const round5 = (x) => Math.round(x / 5) * 5;

/** The leg between two stops: seed leg if one exists (either direction), otherwise the §4.2 fallback. */
export function resolveLeg(model, from, to) {
  const a = model.byId[from];
  const b = model.byId[to];
  const km = Math.round(roadKm(a, b));
  const seed = model.legIndex[`${from}|${to}`];
  if (seed) {
    return {
      key: legKey(from, to), id: seed.id, from, to, km,
      driveMin: seed.driveMin, publicTransport: seed.publicTransport,
      timeSensitive: seed.timeSensitive || null, evidence: seed.evidence || null, warning: seed.warning || null,
      options: seed.options, fallback: false
    };
  }
  const driveMin = driveMinutes(km);
  return {
    key: legKey(from, to), id: null, from, to, km, driveMin, publicTransport: "none",
    timeSensitive: null, evidence: null, warning: null, fallback: true,
    options: [{
      mode: "driver", label: "Taxi / driver", durationMin: driveMin,
      cost: [round5(Math.max(15, km * 0.3)), round5(Math.max(20, km * 0.4))],
      status: "est", recommended: true, notes: "Estimated from road distance — agree the fare in advance."
    }]
  };
}

/** Straight-line km between two ids (used by ZIGZAG and ordering). */
export const kmBetween = (model, a, b) => haversine(model.byId[a], model.byId[b]);

export const shortName = (place) =>
  place.name.split(" & ")[0].replace(" Biosphere Reserve", "").replace(" Castle", "").replace(/ \(.*\)$/, "");
