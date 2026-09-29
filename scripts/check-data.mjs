// Dev-only: every "verified" value in the seed data must carry evidence — a sourceUrl and a verifiedOn
// no older than 90 days (the engine shows older ones as est.). Usage: node scripts/check-data.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_AGE_DAYS = 90;
const METHODS = ["web", "phone", "field", "whatsapp", "operator"];
const DATA_DIR = process.env.DARB_DATA_DIR ? new URL(`file://${process.env.DARB_DATA_DIR.replace(/\/?$/, "/")}`) : new URL("../public/data/", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, DATA_DIR), "utf8"));

// Calendar-day difference (local date of `today` vs the YYYY-MM-DD verifiedOn), so a value verified
// "today" is age 0 at any hour — new Date() minus a UTC-midnight date is negative before 03:00 in Amman.
const ymd = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10)
  : [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"));
const daysBetween = (from, to) => Math.round((Date.parse(ymd(to)) - Date.parse(ymd(from))) / 86400000);

/** → list of problems (strings); empty when every verified value has evidence. */
export function checkData(today = new Date()) {
  const problems = [];
  const item = (where, o) => {
    if (!o || o.status !== "verified") return;
    if (!/^https:\/\/\S+$/.test(o.sourceUrl || "")) problems.push(`${where}: verified without a sourceUrl`);
    const age = o.verifiedOn ? daysBetween(o.verifiedOn, today) : NaN;
    if (!o.verifiedOn || !(age >= 0 && age <= MAX_AGE_DAYS)) problems.push(`${where}: verifiedOn ${o.verifiedOn || "missing"} is not within ${MAX_AGE_DAYS} days`);
    if (o.method != null && !METHODS.includes(o.method)) problems.push(`${where}: unknown method "${o.method}"`);
  };
  for (const p of read("places.json").places) item(`places/${p.id}.ticket`, p.ticket);
  for (const l of read("legs.json").legs) (l.options || []).forEach((o, i) => item(`legs/${l.id}.options[${i}] (${o.label})`, o));
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkData(process.env.DARB_TODAY || new Date());
  for (const p of problems) console.log("FAIL", p);
  console.log(problems.length ? `${problems.length} verified value(s) without evidence` : "data check: every verified value has a source and a fresh date");
  process.exit(problems.length ? 1 : 0);
}
