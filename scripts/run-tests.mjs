// Dev-only: run the engine test cases in Node (same cases as /tests.html). Exit 1 on any failure.
import { readFileSync } from "node:fs";
import { runCases } from "../public/js/test-cases.js";

const f = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));
const { places, airports } = f("places.json");
const results = runCases({ places, airports, legs: f("legs.json").legs, pass: f("jordan-pass.json") });
for (const r of results) console.log(r.ok ? "PASS" : "FAIL", r.name);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} / ${results.length} passed`);
process.exit(failed ? 1 : 0);
