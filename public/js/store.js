// All Firestore writes for trips / events / confirmations go through here. Keys match firestore.rules exactly.
import { db } from "./firebase-init.js";
import {
  doc, setDoc, getDoc, addDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TRIP_KEYS = ["title", "source", "rawText", "settings", "days", "check", "fixed", "score", "parentId", "lang"];
const EVENT_KEYS = ["score", "scoreAfter", "days", "car", "month", "blockedLegs", "riskyLegs", "places"];
const EVENT_TYPES = ["check", "fix", "build"];
const MAX_RAW = 8000;
const MAX_DAYS = 21;
const CACHE_PREFIX = "darb:trip:";
const TIMEOUT_MS = 8000;

/** 12 random chars [A-Za-z0-9] (crypto, unbiased), e.g. k7Q9mX2p4Rz8. */
export function newId() {
  let id = "";
  const buf = new Uint8Array(32);
  while (id.length < 12) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 248 && id.length < 12) id += ALPHABET[b % 62]; // 248 = 4 × 62 → no modulo bias
    }
  }
  return id;
}

/** Deep copy without undefined values or functions (Firestore rejects undefined). Firestore sentinels pass through. */
function clean(v) {
  if (Array.isArray(v)) return v.filter((x) => x !== undefined && typeof x !== "function").map(clean);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined || typeof x === "function") continue;
      out[k] = clean(x);
    }
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return null; // NaN / Infinity
  return v;
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && obj[k] !== undefined).map((k) => [k, obj[k]]));

const SAVE_TIMEOUT_MS = 10000;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/** createdAt → ISO string (Firestore Timestamp, cached {seconds}, or already a string). */
function isoDate(t) {
  if (!t) return null;
  if (typeof t === "string") return t;
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  if (typeof t.seconds === "number") return new Date(t.seconds * 1000).toISOString();
  return null;
}

function cacheTrip(trip) {
  try { localStorage.setItem(CACHE_PREFIX + trip.id, JSON.stringify(trip)); } catch { /* storage full / blocked */ }
}
function cachedTrip(id) {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + id)); } catch { return null; }
}

/**
 * Save a trip as trips/{newId}. Only the keys allowed by firestore.rules are written;
 * undefined is stripped, rawText capped at 8000 chars, days at 21. Returns the new id.
 * Throws on failure, or Error("timeout") after 10 s without a server acknowledgement.
 */
export async function saveTrip(trip) {
  const data = clean(pick(trip, TRIP_KEYS));
  if (!Array.isArray(data.days)) throw new Error("saveTrip: trip.days must be an array");
  if (data.days.length > MAX_DAYS) data.days = data.days.slice(0, MAX_DAYS);
  if (typeof data.rawText === "string" && data.rawText.length > MAX_RAW) data.rawText = data.rawText.slice(0, MAX_RAW);
  const id = newId();
  // Offline, setDoc waits for the server forever: give up after 10 s so pages can fall back to local.
  await withTimeout(setDoc(doc(db, "trips", id), { ...data, createdAt: serverTimestamp() }), SAVE_TIMEOUT_MS);
  cacheTrip({ id, ...data, createdAt: new Date().toISOString() });
  return id;
}

/**
 * Load trips/{id} → { id, ...data } (createdAt as an ISO string), null if it doesn't exist (or the id is
 * malformed), or undefined if it couldn't be fetched (offline / timeout / network error) — callers show
 * "not found" only for null and a "Try again" card for undefined.
 * Trips are immutable (rules forbid updates), so a cached copy is always current: it's returned first,
 * which also makes saved trips open offline.
 */
export async function loadTrip(id) {
  if (!id || !/^[A-Za-z0-9]{1,40}$/.test(id)) return null;
  const cached = cachedTrip(id);
  if (cached) return cached;
  try {
    const snap = await withTimeout(getDoc(doc(db, "trips", id)), TIMEOUT_MS);
    if (!snap.exists()) return null;
    const data = snap.data();
    const trip = { id, ...data, createdAt: isoDate(data.createdAt) };
    cacheTrip(trip);
    return trip;
  } catch (e) {
    console.warn("Darb: couldn't load trip (offline?)", e);
    return undefined;
  }
}

/** Anonymous analytics event (summary from rules.eventSummary()). Only rule-allowed keys. Never throws. */
export async function logEvent(type, summary = {}) {
  try {
    if (!EVENT_TYPES.includes(type)) throw new Error(`unknown event type "${type}"`);
    await addDoc(collection(db, "events"), { ...clean(pick(summary, EVENT_KEYS)), type, createdAt: serverTimestamp() });
  } catch (e) {
    console.warn("Darb: event not logged", e);
  }
}

/** Post-trip "Was this transport there?" answer ('yes' | 'no'). Never throws. */
export async function logConfirmation(tripId, legId, answer) {
  try {
    if (answer !== "yes" && answer !== "no") throw new Error(`answer must be "yes" or "no"`);
    await addDoc(collection(db, "confirmations"), {
      tripId: String(tripId ?? ""),
      legId: String(legId ?? "").slice(0, 80),
      answer,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.warn("Darb: confirmation not saved", e);
  }
}

/** Public share link for a trip (firebase.json rewrites /t/** to trip.html). */
export const shareUrl = (id) => `${location.origin}/t/${id}`;
