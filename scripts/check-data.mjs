// Dev-only: every "verified" value in the seed data must carry evidence, a sourceUrl and a verifiedOn
// no older than 90 days (the engine shows older ones as est.). Usage: node scripts/check-data.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_AGE_DAYS = 90;
const METHODS = ["web", "web-est", "phone", "field", "whatsapp", "operator"];
const DATA_DIR = process.env.DARB_DATA_DIR ? new URL(`file://${process.env.DARB_DATA_DIR.replace(/\/?$/, "/")}`) : new URL("../public/data/", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, DATA_DIR), "utf8"));

// Calendar-day difference (local date of `today` vs the YYYY-MM-DD verifiedOn), so a value verified
// "today" is age 0 at any hour, new Date() minus a UTC-midnight date is negative before 03:00 in Amman.
const ymd = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10)
  : [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"));
const daysBetween = (from, to) => Math.round((Date.parse(ymd(to)) - Date.parse(ymd(from))) / 86400000);

// Timezone skew: a CI runner on UTC is still on "yesterday" for the first hours of an Amman day, so a value
// verified "today" in Amman can be age −1 there. Accept −1 … 90; fail on > 90 or < −1.
export const ageOk = (verifiedOn, today) => {
  const age = daysBetween(verifiedOn, today);
  return age >= -1 && age <= MAX_AGE_DAYS;
};

/** → list of problems (strings); empty when every verified value has evidence. */
export function checkData(today = new Date()) {
  const problems = [];
  const item = (where, o) => {
    if (!o || o.status !== "verified") return;
    if (!/^https:\/\/\S+$/.test(o.sourceUrl || "")) problems.push(`${where}: verified without a sourceUrl`);
    if (!o.verifiedOn || !ageOk(o.verifiedOn, today)) problems.push(`${where}: verifiedOn ${o.verifiedOn || "missing"} is not within ${MAX_AGE_DAYS} days`);
    if (o.method != null && !METHODS.includes(o.method)) problems.push(`${where}: unknown method "${o.method}"`);
  };
  for (const p of read("places.json").places) item(`places/${p.id}.ticket`, p.ticket);
  for (const l of read("legs.json").legs) (l.options || []).forEach((o, i) => item(`legs/${l.id}.options[${i}] (${o.label})`, o));
  return problems;
}

// Self-test of the age window (runs on every import, so run-tests.mjs and CI exercise it too).
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
for (const [delta, want] of [[1, true], [0, true], [-90, true], [-91, false], [2, false]]) {
  const v = addDays("2026-09-29", delta);
  if (ageOk(v, "2026-09-29") !== want) throw new Error(`check-data self-test: verifiedOn ${v} vs today 2026-09-29 should be ${want ? "ok" : "rejected"}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkData(process.env.DARB_TODAY || new Date());
  for (const p of problems) console.log("FAIL", p);
  console.log(problems.length ? `${problems.length} verified value(s) without evidence` : "data check: every verified value has a source and a fresh date");
  process.exit(problems.length ? 1 : 0);
}
