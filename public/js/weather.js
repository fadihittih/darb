// Weather for the 04 sidebar: seasonal averages per site (places.json climate), and an Open-Meteo
// daily forecast when the trip starts within a week. forecast() never throws — null means "use seasonal".

const SEASONS = { 12: "winter", 1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring", 6: "summer", 7: "summer", 8: "summer", 9: "autumn", 10: "autumn", 11: "autumn" };
const API = "https://api.open-meteo.com/v1/forecast";
const CACHE_PREFIX = "darb:wx:";
const TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;
const MAX_CALLS = 12;
const FORECAST_DAYS = 16; // Open-Meteo horizon
const DAY_MS = 86400000;

/** "winter" | "spring" | "summer" | "autumn" for a month 1..12. */
export const seasonOf = (month) => SEASONS[Number(month)] || "autumn";

/** Seasonal day/night averages and the packing tip for a place in a month → { day, night, tip } (temps may be null). */
export function seasonal(place, month) {
  const c = place?.climate?.[seasonOf(month)];
  return { day: Array.isArray(c) ? c[0] : null, night: Array.isArray(c) ? c[1] : null, tip: place?.packing || "" };
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const utcDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
};

/** True when the trip starts within the next 7 days (or is under way). */
export function forecastWindow(startDate, days = 1, today = new Date()) {
  const start = utcDay(startDate);
  if (!start) return false;
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ahead = (start - t0) / DAY_MS;
  const lastDay = ahead + Math.max(1, days) - 1;
  return ahead <= 7 && lastDay >= 0;
}

function readCache(key) {
  try {
    const c = JSON.parse(localStorage.getItem(key));
    return c && Date.now() - c.at < TTL_MS ? c.data : null;
  } catch { return null; }
}
function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full / blocked */ }
}

async function fetchJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`open-meteo ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const mean = (xs) => {
  const v = xs.filter((x) => typeof x === "number");
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

/**
 * forecast(places, startDate, days) → { [placeId]: { day, night, daily:[{date,max,min}] } } or null on any failure.
 * One Open-Meteo call per place (max 12), cached 6 h in localStorage, 5 s timeout each.
 */
export async function forecast(places, startDate, days = 1) {
  try {
    const start = utcDay(startDate);
    if (!start || !Array.isArray(places) || !places.length) return null;
    const today = new Date();
    const t0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const from = start < t0 ? t0 : start;
    const horizon = new Date(t0.getTime() + (FORECAST_DAYS - 1) * DAY_MS);
    let to = new Date(start.getTime() + (Math.max(1, days) - 1) * DAY_MS);
    if (to > horizon) to = horizon;
    if (to < from) return null;
    const range = [isoDay(from), isoDay(to)];

    const list = places.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)).slice(0, MAX_CALLS);
    const results = await Promise.all(list.map(async (p) => {
      const key = `${CACHE_PREFIX}${p.id}:${range[0]}:${range[1]}`;
      let data = readCache(key);
      if (!data) {
        const q = `latitude=${p.lat}&longitude=${p.lng}&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FAmman&start_date=${range[0]}&end_date=${range[1]}`;
        const j = await fetchJson(`${API}?${q}`);
        const d = j?.daily;
        if (!d || !Array.isArray(d.time)) throw new Error("open-meteo: no daily data");
        data = d.time.map((date, i) => ({ date, max: d.temperature_2m_max?.[i] ?? null, min: d.temperature_2m_min?.[i] ?? null }));
        writeCache(key, data);
      }
      return [p.id, { day: mean(data.map((x) => x.max)), night: mean(data.map((x) => x.min)), daily: data }];
    }));
    return Object.fromEntries(results);
  } catch (e) {
    console.warn("Darb: live forecast unavailable, showing seasonal averages.", e);
    return null;
  }
}
