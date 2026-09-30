// Seed Firestore with the reference data in /public/data, and keep it in step with edits data owners make in /admin.
// Usage (from repo root):
//   node scripts/seed.mjs diff             -> read-only: what differs between /public/data and the live project
//   node scripts/seed.mjs pull             -> write live legs / places into legs.json / places.json (owner edits -> git)
//   node scripts/seed.mjs                  -> places, legs, config/*  (refuses if an owner-edited field would be overwritten)
//   node scripts/seed.mjs --merge          -> same, but keeps the owner-edited fields (options, ticket) as they are live
//   node scripts/seed.mjs --force          -> same, overwriting owner edits (prints them first)
//   node scripts/seed.mjs admin you@x.com  -> add an admin (data owner) email to the allowlist
//   Add --dry-run to any writing form to print the writes and commit nothing.
// diff and pull only read public collections (no login needed); DARB_DATA_DIR overrides the data folder (as in
// check-data.mjs). Writing uses your Firebase CLI login token (owner rights bypass security rules). Never deletes.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { toValue, fromValue, diffDoc, ownerFields, ownerConflicts, mergeInto, spliceArray, compact, parseArgs, USAGE, maskFor, writeOf } from "./seed-lib.mjs";

const PROJECT = "darb-pixelsdev";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const DATA_DIR = process.env.DARB_DATA_DIR ? pathToFileURL(resolve(process.env.DARB_DATA_DIR) + "/") : new URL("../public/data/", import.meta.url);
const readText = (f) => readFileSync(new URL(f, DATA_DIR), "utf8");
const read = (f) => JSON.parse(readText(f));

function token() {
  execSync("firebase projects:list", { stdio: "ignore" }); // refreshes the cached access token
  const cfg = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
  return cfg.tokens.access_token;
}

// [docPath, data] for every doc the seed writes
function seedDocs() {
  const { places, airports } = read("places.json");
  const { legs } = read("legs.json");
  return [
    ...places.map((p) => [`places/${p.id}`, p]),
    ...legs.map((l) => [`legs/${l.id}`, l]),
    ["config/airports", { airports }],
    ["config/jordanPass", read("jordan-pass.json")],
    ["config/demoStats", read("demo-stats.json")]
  ];
}

// Unauthenticated read of a whole public collection -> Map<docId, plain object>
async function listCollection(name) {
  const out = new Map();
  let pageToken = "";
  do {
    const r = await fetch(`${BASE}/${name}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    if (!r.ok) throw new Error(`GET ${name}: ${r.status} ${await r.text()}`);
    const j = await r.json();
    for (const d of j.documents || []) out.set(d.name.split("/").pop(), fromValue({ mapValue: { fields: d.fields || {} } }));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}

async function readLive() {
  const [places, legs, config, updates] = await Promise.all(["places", "legs", "config", "operatorUpdates"].map(listCollection));
  const live = new Map();
  for (const [id, d] of places) live.set(`places/${id}`, d);
  for (const [id, d] of legs) live.set(`legs/${id}`, d);
  for (const id of ["airports", "jordanPass", "demoStats"]) if (config.has(id)) live.set(`config/${id}`, config.get(id));
  return { live, owners: ownerFields([...updates.values()], (m) => console.warn(`warning: ${m}`)) };
}

const show = (v) => (v === undefined ? "(absent)" : compact(v));
const list = (s) => [...s].join(", ");

async function commit(T, writes) {
  const r = await fetch(`${BASE}:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes })
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  console.log(`✔ wrote ${writes.length} docs`);
}
const DOC_NAME = (path) => `projects/${PROJECT}/databases/(default)/documents/${path}`;

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) { console.error(`${parsed.error}\n${USAGE}`); process.exit(2); }
const { cmd, email: arg, merge, force, dryRun } = parsed;

if (cmd === "admin") {
  if (!arg) throw new Error("usage: node scripts/seed.mjs admin you@example.com");
  const email = arg.toLowerCase();
  const w = writeOf(DOC_NAME(`admins/${email}`), { email, addedAt: new Date().toISOString() });
  if (dryRun) console.log(`dry run — would write admins/${email} (whole doc)`);
  else await commit(token(), [w]);
} else if (cmd === "diff") {
  const docs = seedDocs();
  const { live, owners } = await readLive();
  let differing = 0, missing = 0, owned = 0;
  for (const [path, data] of docs) {
    if (!live.has(path)) { missing++; console.log(`${path}: missing live (seed would create it)`); continue; }
    const d = diffDoc(data, live.get(path));
    if (!d.length) continue;
    differing++;
    const own = ownerConflicts(d, owners.get(path));
    if (own.length) owned++;
    console.log(`${path}: ${d.length} difference(s)${own.length ? "  [owner-edited: " + list(owners.get(path)) + "]" : ""}`);
    for (const x of d) console.log(`    ${x.path}: json ${show(x.json)}  live ${show(x.live)}`);
  }
  const inJson = new Set(docs.map(([p]) => p));
  const extra = [...live.keys()].filter((p) => /^(legs|places)\//.test(p) && !inJson.has(p));
  for (const p of extra) console.log(`${p}: live only (not in the JSON; pull would add it)`);
  console.log(`${differing} differing, ${missing} missing live, ${extra.length} live-only, ${owned} with owner edits (of ${docs.length} seed docs)`);
} else if (cmd === "pull") {
  const { live } = await readLive();
  const summary = [];
  const pull = (file, key, prefix, fmt) => {
    const src = read(file)[key];
    const byId = new Map();
    for (const item of src) if (live.has(`${prefix}/${item.id}`)) byId.set(item.id, mergeInto(item, live.get(`${prefix}/${item.id}`)));
    for (const [p, d] of live) if (p.startsWith(`${prefix}/`) && !byId.has(p.slice(prefix.length + 1))) byId.set(p.slice(prefix.length + 1), d);
    const before = readText(file);
    const after = spliceArray(before, key, byId, fmt);
    if (after !== before) {
      if (dryRun) console.log(`dry run — would write ${file}`);
      else writeFileSync(new URL(file, DATA_DIR), after);
    }
    const n = src.filter((s) => byId.has(s.id) && diffDoc(s, byId.get(s.id)).length).length;
    summary.push(`${file}: ${n} updated, ${byId.size - src.filter((s) => byId.has(s.id)).length} added`);
  };
  pull("legs.json", "legs", "legs", (o) => JSON.stringify(o, null, 2).replace(/\n/g, "\n    "));
  // places.json is hand-formatted: one key per line, values inline
  pull("places.json", "places", "places", (o) => `{\n${Object.entries(o).map(([k, v]) => `      ${JSON.stringify(k)}: ${compact(v)}`).join(",\n")}\n    }`);
  console.log(summary.join("\n"));
  if (!dryRun) console.log("Next: node scripts/render-destinations.mjs && node scripts/run-tests.mjs, review the git diff, then commit.");
} else if (!cmd) {
  const docs = seedDocs();
  const { live, owners } = await readLive();
  const conflicts = [];
  const plan = docs.map(([path, data]) => {
    const own = owners.get(path);
    const lv = live.get(path);
    const hits = lv ? ownerConflicts(diffDoc(data, lv), own) : [];
    if (hits.length) conflicts.push([path, hits]);
    return { path, data, own: hits.length ? own : null };
  });
  if (conflicts.length && !merge && !force) {
    console.error("Refusing to seed: these live docs carry data-owner edits that differ from /public/data:");
    for (const [p, hits] of conflicts) for (const h of hits) console.error(`  ${p}  ${h.path}: json ${show(h.json)}  live ${show(h.live)}`);
    console.error("Choose one:\n  node scripts/seed.mjs pull      copy the live edits into the JSON files (then commit them)\n  node scripts/seed.mjs --merge   seed everything but keep the owner-edited fields live\n  node scripts/seed.mjs --force   overwrite the owner edits");
    process.exit(1);
  }
  for (const [p, hits] of conflicts) console.log(`${merge ? "keeping" : "overwriting"} owner edits on ${p}: ${hits.map((h) => h.path).join(", ")}`);
  const writes = [];
  for (const { path, data, own } of plan) {
    const mask = merge ? maskFor(data, own) : null;
    if (mask && !mask.length) { console.log(`  ${path}  skipped (every field is owner-edited)`); continue; }
    if (dryRun) console.log(`  ${path}${mask ? `  mask: ${mask.join(", ")}` : "  (whole doc)"}`);
    writes.push(writeOf(DOC_NAME(path), data, mask));
  }
  if (dryRun) console.log(`dry run — ${writes.length} docs would be written, nothing committed`);
  else await commit(token(), writes);
}
