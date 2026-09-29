// Reference data: Firestore → localStorage cache → /data/*.json fallback. All reads of places/legs/config go through here.
import { buildModel } from "./engine/model.js";

const FS = "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
const CACHE_KEY = "darb:data:v3";
const TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

const getJson = async (path) => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

/** The seed files shipped with the site (offline fallback, and what tests.html uses). */
export async function loadSeed() {
  const [p, l, pass] = await Promise.all([getJson("/data/places.json"), getJson("/data/legs.json"), getJson("/data/jordan-pass.json")]);
  return { places: p.places, airports: p.airports, legs: l.legs, pass };
}

async function loadFirestore() {
  const [{ db }, { collection, getDocs, doc, getDoc }] = await Promise.all([import("./firebase-init.js"), import(FS)]);
  const [places, legs, airports, pass] = await Promise.all([
    getDocs(collection(db, "places")),
    getDocs(collection(db, "legs")),
    getDoc(doc(db, "config", "airports")),
    getDoc(doc(db, "config", "jordanPass"))
  ]);
  if (places.empty || legs.empty || !pass.exists()) throw new Error("Firestore reference data missing");
  return {
    places: places.docs.map((d) => d.data()),
    legs: legs.docs.map((d) => d.data()),
    airports: airports.exists() ? airports.data().airports : [],
    pass: pass.data()
  };
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}
function writeCache(raw) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), raw })); } catch { /* storage full or blocked */ }
}

/** Raw reference data plus where it came from: "firestore" | "cache" | "seed". */
export async function loadRaw() {
  const cached = readCache();
  if (cached && Date.now() - cached.at < TTL_MS) return { raw: cached.raw, source: "cache" };
  try {
    const raw = await withTimeout(loadFirestore(), TIMEOUT_MS);
    writeCache(raw);
    return { raw, source: "firestore" };
  } catch (e) {
    console.warn("Darb: Firestore unavailable, using fallback data.", e);
    if (cached) return { raw: cached.raw, source: "cache" };
    return { raw: await loadSeed(), source: "seed" };
  }
}

let modelPromise = null;
/** The engine model (memoised per page load). */
export function loadModel() {
  modelPromise ||= loadRaw().then(({ raw, source }) => ({ ...buildModel(raw), source }));
  return modelPromise;
}

/** Dashboard demo figures (always labelled "demo data" in the UI). */
export async function loadDemoStats() {
  try {
    const [{ db }, { doc, getDoc }] = await Promise.all([import("./firebase-init.js"), import(FS)]);
    const s = await withTimeout(getDoc(doc(db, "config", "demoStats")), TIMEOUT_MS);
    if (s.exists()) return s.data();
  } catch (e) {
    console.warn("Darb: demo stats fallback.", e);
  }
  return getJson("/data/demo-stats.json");
}
