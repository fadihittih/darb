// Seed Firestore with the reference data in /public/data.
// Usage (from repo root, logged in with `firebase login`):
//   node scripts/seed.mjs                 -> places, legs, config/jordanPass, config/demoStats
//   node scripts/seed.mjs admin you@x.com -> add an admin (data owner) email to the allowlist
// Uses your Firebase CLI login token (owner rights bypass security rules). No secrets live in the repo.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT = "darb-pixelsdev";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function token() {
  execSync("firebase projects:list", { stdio: "ignore" }); // refreshes the cached access token
  const cfg = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
  return cfg.tokens.access_token;
}

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

async function commit(T, docs) {
  const writes = docs.map(([path, data]) => ({
    update: { name: `projects/${PROJECT}/databases/(default)/documents/${path}`, fields: toValue(data).mapValue.fields }
  }));
  const r = await fetch(`${BASE}:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes })
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  console.log(`✔ wrote ${docs.length} docs`);
}

const T = token();
const [cmd, arg] = process.argv.slice(2);

if (cmd === "admin") {
  if (!arg) throw new Error("usage: node scripts/seed.mjs admin you@example.com");
  await commit(T, [[`admins/${arg.toLowerCase()}`, { email: arg.toLowerCase(), addedAt: new Date().toISOString() }]]);
} else {
  const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), "utf8"));
  const { places, airports } = read("places.json");
  const { legs } = read("legs.json");
  const pass = read("jordan-pass.json");
  const demo = read("demo-stats.json");
  const docs = [
    ...places.map((p) => [`places/${p.id}`, p]),
    ...legs.map((l) => [`legs/${l.id}`, l]),
    ["config/airports", { airports }],
    ["config/jordanPass", pass],
    ["config/demoStats", demo]
  ];
  await commit(T, docs);
}
