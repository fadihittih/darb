// Dev-only: unit tests for the pure helpers in seed-lib.mjs. Exit 1 on failure.
import assert from "node:assert/strict";
import { toValue, fromValue, diffDoc, ownerFields, topField, ownerConflicts, mergeInto, spliceArray, compact, parseArgs, fieldPath, maskFor, writeOf } from "./seed-lib.mjs";

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

t("parseArgs: valid forms", () => {
  assert.deepEqual(parseArgs([]), { cmd: null, email: null, merge: false, force: false, dryRun: false });
  assert.equal(parseArgs(["--merge", "--dry-run"]).merge, true);
  assert.equal(parseArgs(["--force"]).force, true);
  assert.equal(parseArgs(["diff"]).cmd, "diff");
  assert.equal(parseArgs(["pull", "--dry-run"]).dryRun, true);
  assert.deepEqual([parseArgs(["admin", "a@b.c"]).cmd, parseArgs(["admin", "a@b.c"]).email], ["admin", "a@b.c"]);
});
t("parseArgs: typos and bad combinations are errors", () => {
  for (const a of [["--dryrun"], ["--marge"], ["--dry-run=1"], ["-n"], ["dif"], ["diff", "x"], ["admin"], ["admin", "a@b.c", "x"], ["--merge", "--force"], ["diff", "--merge"], ["pull", "--force"], ["admin", "a@b.c", "--merge"]])
    assert.ok(parseArgs(a).error, JSON.stringify(a));
});
t("fieldPath: plain keys as is, others backticked", () => {
  assert.equal(fieldPath("options"), "options");
  assert.equal(fieldPath("_x1"), "_x1");
  assert.equal(fieldPath("my-key"), "`my-key`");
  assert.equal(fieldPath("1a"), "`1a`");
  assert.equal(fieldPath("a`b"), "`a\\`b`");
});
t("maskFor / writeOf: owner-edited options -> mask of every other key", () => {
  const data = { id: "x", from: "a", options: [{ cost: [1, 2] }], "my-key": 1 };
  const mask = maskFor(data, new Set(["options"]));
  assert.deepEqual(mask, ["id", "from", "my-key"]);
  const w = writeOf("projects/p/databases/(default)/documents/legs/x", data, mask);
  assert.deepEqual(w.updateMask.fieldPaths, ["id", "from", "`my-key`"]);
  assert.equal(w.update.name, "projects/p/databases/(default)/documents/legs/x");
  assert.ok("id" in w.update.fields && "options" in w.update.fields);
});
t("maskFor / writeOf: no owner edits -> whole-doc replace, no updateMask", () => {
  assert.equal(maskFor({ a: 1 }, undefined), null);
  assert.ok(!("updateMask" in writeOf("n", { a: 1 }, null)));
});
t("maskFor: every key owner-edited -> empty mask (caller skips the doc)", () => {
  assert.deepEqual(maskFor({ options: [] }, new Set(["options"])), []);
});
t("ownerFields / topField: malformed field is skipped with a warning", () => {
  const warns = [];
  const m = ownerFields([{ legId: "a", field: "" }, { legId: "a", field: "[0].x" }, { legId: "a", field: ".x" }, { legId: "a" }, { legId: "b", field: "options[0].cost" }], (w) => warns.push(w));
  assert.deepEqual([...m.keys()], ["legs/b"]);
  assert.equal(warns.length, 4);
  assert.equal(topField(""), null);
  assert.equal(topField("[0]"), null);
  assert.equal(topField(undefined), null);
});
t("spliceArray: empty target array stays valid JSON", () => {
  const fmt = (o) => JSON.stringify(o);
  for (const text of ['{ "items": [] }', '{ "items": [\n  ] }']) {
    const out = spliceArray(text, "items", new Map([["a", { id: "a" }], ["b", { id: "b" }]]), fmt);
    assert.deepEqual(JSON.parse(out).items, [{ id: "a" }, { id: "b" }]);
    assert.equal(spliceArray(text, "items", new Map(), fmt), text);
  }
});

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "-", e.message.split("\n")[0]); }
}
console.log(`seed helpers: ${cases.length - failed} / ${cases.length} passed`);
process.exit(failed ? 1 : 0);
