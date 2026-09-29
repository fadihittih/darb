// JOD → EUR / USD hint for the trip total (Frankfurter, no key). Indicative only: always shown as "est.".
import { fmtDate } from "./engine/format.js";

const URL_FX = "https://api.frankfurter.dev/v2/rates?base=JOD&quotes=EUR,USD";
const KEY = "darb:fx:v1";
const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

const round5 = (x) => Math.round(x / 5) * 5;

/** Frankfurter v2 array → { EUR, USD, date } or null when anything is missing. */
export function parseRates(json) {
  if (!Array.isArray(json)) return null;
  const by = Object.fromEntries(json.filter((x) => x && typeof x.rate === "number" && x.rate > 0).map((x) => [x.quote, x]));
  if (!by.EUR || !by.USD) return null;
  return { EUR: by.EUR.rate, USD: by.USD.rate, date: by.EUR.date || null };
}

const validRates = (r) => !!r && typeof r === "object" && Number.isFinite(r.EUR) && Number.isFinite(r.USD) && (r.date == null || typeof r.date === "string");

/** "≈ 380–480 EUR · 430–545 USD (est., rate of 29 Sep)"; "" without rates. */
export function fxLine(total, rates) {
  if (!validRates(rates) || !Array.isArray(total) || total.length !== 2) return "";
  const [a, b] = total;
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > 0)) return "";
  const r = (cur) => `${round5(a * rates[cur])}–${round5(b * rates[cur])} ${cur}`;
  return `≈ ${r("EUR")} · ${r("USD")} (est.${rates.date ? `, rate of ${fmtDate(rates.date)}` : ""})`;
}

/** Cached 24 h in localStorage; null on any failure (the page just shows no line). */
export async function jodRates() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (c && Date.now() - c.at < TTL_MS && validRates(c.rates) && typeof c.rates.date === "string") return c.rates;
  } catch { /* storage blocked */ }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res = await fetch(URL_FX, { signal: ctl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const rates = parseRates(await res.json());
    if (rates) { try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rates })); } catch { /* full */ } }
    return rates;
  } catch {
    return null;
  }
}
