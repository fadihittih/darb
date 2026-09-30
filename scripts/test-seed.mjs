// Dev-only: unit tests for the pure helpers in seed-lib.mjs. Exit 1 on failure.
import assert from "node:assert/strict";
import { toValue, fromValue, diffDoc, ownerFields, topField, ownerConflicts, mergeInto, spliceArray, compact } from "./seed-lib.mjs";

const cases = [];
const t = (name, fn) => cases.push([name, fn]);

t("toValue / fromValue round-trip", () => {
  const doc = { a: null, b: true, c: 1, d: 1.1, e: 0.95, f: "x", g: [1, [2, { h: [] }], {}], i: { j: { k: [10, 10.5] } }, l: -3 };
  assert.deepEqual(fromValue(toValue(doc)), doc);
});
t("fromValue decodes REST encodings", () => {
  assert.equal(fromValue({ integerValue: "42" }), 42);
  assert.equal(fromValue({ timestampValue: "2026-09-30T10:00:00Z" }), "2026-09-30T10:00:00Z");
  assert.deepEqual(fromValue({ arrayValue: {} }), []);
  assert.deepEqual(fromValue({ mapValue: {} }), {});
  assert.equal(fromValue({ nullValue: null }), null);
});
t("diffDoc: key order and 10 vs 10.0 do not count", () => {
  assert.deepEqual(diffDoc({ a: 1, b: { c: [1, 2], d: 10 } }, { b: { d: 10.0, c: [1, 2] }, a: 1 }), []);
});
t("diffDoc: changed cost leaf", () => {
  const d = diffDoc({ options: [{ cost: [10, 12] }] }, { options: [{ cost: [10, 15] }] });
  assert.deepEqual(d, [{ path: "options[0].cost[1]", json: 12, live: 15 }]);
});
t("diffDoc: key on one side only, and array length", () => {
  assert.deepEqual(diffDoc({ a: 1, ticket: { jod: 3 } }, { a: 1 }), [{ path: "ticket", json: { jod: 3 }, live: undefined }]);
  assert.deepEqual(diffDoc({ a: 1 }, { a: 1, z: 2 }), [{ path: "z", json: undefined, live: 2 }]);
  assert.deepEqual(diffDoc({ x: [1] }, { x: [1, 2] }), [{ path: "x[1]", json: undefined, live: 2 }]);
  assert.deepEqual(diffDoc({ ticket: { jod: 3 } }, { ticket: { jod: 4 } }), [{ path: "ticket.jod", json: 3, live: 4 }]);
});
t("ownerFields", () => {
  const m = ownerFields([
    { legId: "amman-petra", field: "options[0].cost" },
    { legId: "amman-petra", field: "options[1].departs" },
    { legId: "", placeId: "petra", field: "ticket.jod" },
    { legId: "", field: "ticket.jod" }
  ]);
  assert.deepEqual([...m.keys()].sort(), ["legs/amman-petra", "places/petra"]);
  assert.deepEqual([...m.get("legs/amman-petra")], ["options"]);
  assert.deepEqual([...m.get("places/petra")], ["ticket"]);
  assert.equal(topField("options[0].cost[1]"), "options");
  assert.equal(topField("ticket"), "ticket");
});
t("ownerConflicts keeps only owner-edited paths", () => {
  const diffs = [{ path: "options[0].cost[1]" }, { path: "driveMin" }];
  assert.deepEqual(ownerConflicts(diffs, new Set(["options"])), [{ path: "options[0].cost[1]" }]);
  assert.deepEqual(ownerConflicts(diffs, undefined), []);
});
t("mergeInto: live values, JSON key order first, new keys after", () => {
  const json = { id: "x", b: 1, o: { p: 1, q: [1, 2] } };
  const live = { z: 9, o: { r: 5, q: [1, 3], p: 2 }, b: 7, id: "x" };
  const m = mergeInto(json, live);
  assert.deepEqual(Object.keys(m), ["id", "b", "o", "z"]);
  assert.deepEqual(Object.keys(m.o), ["p", "q", "r"]);
  assert.deepEqual(m, { id: "x", b: 7, o: { p: 2, q: [1, 3], r: 5 }, z: 9 });
});
t("mergeInto keeps JSON key order inside array elements", () => {
  const m = mergeInto({ o: [{ mode: "bus", cost: [1, 2] }] }, { o: [{ cost: [1, 3], extra: 1, mode: "bus" }, { mode: "car" }] });
  assert.deepEqual(Object.keys(m.o[0]), ["mode", "cost", "extra"]);
  assert.equal(m.o[1].mode, "car");
});
t("mergeInto drops JSON keys the live doc lacks", () => {
  assert.deepEqual(mergeInto({ a: 1, gone: 2 }, { a: 1 }), { a: 1 });
});
t("compact formats like the hand-written places file", () => {
  assert.equal(compact({ a: 1, b: [1, 2], c: { d: "x" }, e: [] }), '{ "a": 1, "b": [1, 2], "c": { "d": "x" }, "e": [] }');
});
t("spliceArray: unchanged objects stay byte-identical, changed replaced, new appended", () => {
  const text = '{\n  "_meta": { "n": "}{" },\n  "items": [\n    {\n      "id": "a",\n      "v": [\n        1\n      ]\n    },\n    { "id": "b", "v": "s}" }\n  ],\n  "other": 1\n}\n';
  const fmt = (o) => JSON.stringify(o, null, 2).replace(/\n/g, "\n    ");
  const same = spliceArray(text, "items", new Map([["a", { id: "a", v: [1] }], ["b", { id: "b", v: "s}" }]]), fmt);
  assert.equal(same, text);
  const out = spliceArray(text, "items", new Map([["a", { id: "a", v: [2] }], ["b", { id: "b", v: "s}" }], ["c", { id: "c" }]]), fmt);
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed.items, [{ id: "a", v: [2] }, { id: "b", v: "s}" }, { id: "c" }]);
  assert.equal(parsed.other, 1);
  assert.ok(out.includes('{ "id": "b", "v": "s}" }'));
});

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "-", e.message.split("\n")[0]); }
}
console.log(`seed helpers: ${cases.length - failed} / ${cases.length} passed`);
process.exit(failed ? 1 : 0);
