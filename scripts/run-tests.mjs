// Dev-only: run the engine test cases in Node (same cases as /tests.html). Exit 1 on any failure.
import { readFileSync } from "node:fs";
import { runCases } from "../public/js/test-cases.js";
import { checkData } from "./check-data.mjs";

const f = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));
const { places, airports } = f("places.json");
const results = runCases({ places, airports, legs: f("legs.json").legs, pass: f("jordan-pass.json") });
for (const r of results) console.log(r.ok ? "PASS" : "FAIL", r.name);
const failed = results.filter((r) => !r.ok).length;
const dataProblems = checkData(process.env.DARB_TODAY || new Date());
for (const p of dataProblems) console.log("FAIL data:", p);
console.log(`${results.length - failed} / ${results.length} passed${dataProblems.length ? ` · ${dataProblems.length} data problem(s)` : " · data check ok"}`);
process.exit(failed || dataProblems.length ? 1 : 0);
