// Dev-only: run the engine test cases in Node (same cases as /tests.html). Exit 1 on any failure.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCases } from "../public/js/test-cases.js";
import { checkData } from "./check-data.mjs";

const f = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));
const { places, airports } = f("places.json");
const results = runCases({ places, airports, legs: f("legs.json").legs, pass: f("jordan-pass.json") });
for (const r of results) console.log(r.ok ? "PASS" : "FAIL", r.name);
const failed = results.filter((r) => !r.ok).length;
const dataProblems = checkData(process.env.DARB_TODAY || new Date());
for (const p of dataProblems) console.log("FAIL data:", p);
const seed = spawnSync(process.execPath, [fileURLToPath(new URL("./test-seed.mjs", import.meta.url))], { encoding: "utf8" });
const seedFailed = Boolean(seed.error) || seed.status !== 0;
if (seedFailed) {
  for (const l of (seed.stdout || "").split("\n")) if (l.startsWith("FAIL")) console.log(l);
  if (seed.error) console.log(String(seed.error));
  if (seed.stderr) console.log(seed.stderr.trim());
}
console.log(`${results.length - failed} / ${results.length} passed${dataProblems.length ? ` · ${dataProblems.length} data problem(s)` : " · data check ok"}${seedFailed ? " · seed helper tests FAILED" : ""}`);
process.exit(failed || dataProblems.length || seedFailed ? 1 : 0);
