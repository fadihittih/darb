// Engine test cases (§6). Pure: runs in tests.html and in Node. runCases(raw) → [{ name, ok, details }]
import { buildModel } from "./engine/model.js";
import { parse, isUsable } from "./engine/parser.js";
import { check } from "./engine/rules.js";
import { fix } from "./engine/fixer.js";
import { passValue } from "./engine/pass.js";

export const REFERENCE_TEXT = `Day 1 – Arrive in Amman. Visit the Citadel and the Roman Theatre.
Day 2 – Drive or take a bus to Petra. Explore the Siq and the Treasury.
Day 3 – Morning at Petra, then head to Wadi Rum for a sunset jeep tour and desert camp.
Day 4 – Visit Jerash in the morning and float in the Dead Sea in the afternoon.
Day 5 – Madaba mosaics and Mount Nebo, then fly home.`;

export const REFERENCE_SETTINGS = { airport: "AMM", month: 10, travelers: 1, budget: "mid", car: false, startDate: null, pace: "balanced" };

const TODAY = "2026-09-29";
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const codes = (day) => day.issues.map((i) => i.code);

export function runCases(raw) {
  const model = buildModel(raw, TODAY);
  const trip = (text, settings = {}) => ({ days: parse(text, model), settings: { ...REFERENCE_SETTINGS, ...settings } });
  const results = [];
  const test = (name, fn) => {
    const checks = [];
    const expect = (label, actual, expected) => {
      const ok = eq(actual, expected);
      checks.push({ label, ok, actual, expected });
      console.assert(ok, `${name} — ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    };
    try {
      fn(expect);
    } catch (e) {
      checks.push({ label: `threw: ${e.message}`, ok: false });
      console.error(name, e);
    }
    results.push({ name, ok: checks.every((c) => c.ok), details: checks });
  };

  const ref = trip(REFERENCE_TEXT);
  const refCheck = check(ref, model);
  const refFix = fix(ref, model);

  test("Reference: parser reads 5 days with the right places", (expect) => {
    expect("placeIds", ref.days.map((d) => d.placeIds), [["amman"], ["petra"], ["petra", "wadi-rum"], ["jerash", "dead-sea"], ["madaba"]]);
    expect("day 1 arrive", ref.days[0].hints.arrive, true);
    expect("day 5 depart", ref.days[4].hints.depart, true);
    expect("day 3 sunset", ref.days[2].hints.times.includes("sunset"), true);
  });

  test("Reference: Reality Score 58 — Day 3 not feasible, Day 4 risky", (expect) => {
    expect("score", refCheck.score, 58);
    expect("statuses", refCheck.days.map((d) => d.status), ["ok", "ok", "nf", "risky", "ok"]);
    expect("day 3 no public transport", codes(refCheck.days[2]).includes("NO_PUBLIC_TRANSPORT"), true);
    expect("day 4 zigzag", codes(refCheck.days[3]).includes("ZIGZAG"), true);
    expect("day 4 long transfer", codes(refCheck.days[3]).includes("LONG_TRANSFER"), true);
  });

  test("Reference: Jordan Pass — Explorer 75 vs 108 → save 33 JOD", (expect) => {
    expect("tier", refCheck.pass.tier.id, "explorer");
    expect("bought separately", refCheck.pass.separate, 108);
    expect("savings", refCheck.pass.savings, 33);
    expect("visa waived", refCheck.pass.visaWaived, true);
  });

  test("Reference: Fix all → 94 with 6 est legs, Jerash moved to Day 5", (expect) => {
    expect("fixed score", refFix.fixed.score, 94);
    expect("est legs", refFix.fixed.estLegs, 6);
    expect("all days ok", refFix.check.days.map((d) => d.status), ["ok", "ok", "ok", "ok", "ok"]);
    expect("day 4", refFix.days[3].placeIds, ["dead-sea", "madaba"]);
    expect("day 5", refFix.days[4].placeIds, ["jerash"]);
    expect("fixes applied", refFix.fixed.fixesApplied, 2);
    expect("day 3 transfer", refFix.fixed.days[2].items.find((i) => i.kind === "leg").option.label, "Pre-arranged transfer");
    const jett = refFix.fixed.days[1].items.find((i) => i.kind === "leg");
    expect("JETT verified 10 JOD", [jett.verified, jett.costText], [true, "10 JOD"]);
  });

  test("With a car → no transport issues", (expect) => {
    const r = check(trip(REFERENCE_TEXT, { car: true }), model);
    const transport = r.days.flatMap(codes).filter((c) => ["NO_PUBLIC_TRANSPORT", "NO_PUBLIC_TRANSPORT_SOFT", "LONG_TRANSFER", "ONE_DEPARTURE"].includes(c));
    expect("transport issues", transport, []);
    expect("day 3 ok", r.days[2].status, "ok");
  });

  test("2-day trip → the Pass doesn't pay off", (expect) => {
    const p = passValue(trip("Day 1 - Amman citadel\nDay 2 - Jerash, then fly home").days, model);
    expect("visa waived", p.visaWaived, false);
    expect("pays off", p.paysOff, false);
  });

  test("Summer Dead Sea afternoon → SEASON risky", (expect) => {
    const r = check(trip("Day 1 - Amman\nDay 2 - Madaba in the morning, Dead Sea in the afternoon\nDay 3 - Amman, fly home", { month: 7 }), model);
    const it = r.days[1].issues.find((i) => i.code === "SEASON");
    expect("season issue", it?.severity, "risky");
  });

  test("Petra on one day with Wadi Rum → PETRA_TOO_SHORT, fixer gives Petra its own day", (expect) => {
    const t = trip("Day 1 - Amman\nDay 2 - Petra and Wadi Rum\nDay 3 - Wadi Rum\nDay 4 - Amman, fly home");
    const r = check(t, model);
    expect("flagged", codes(r.days[1]).includes("PETRA_TOO_SHORT"), true);
    const f = fix(t, model);
    expect("no PETRA_TOO_SHORT after fix", f.check.days.flatMap(codes).includes("PETRA_TOO_SHORT"), false);
  });

  test("Empty or non-travel text → no fake result", (expect) => {
    expect("empty", isUsable(parse("", model)), false);
    expect("non-travel", isUsable(parse("Buy milk\nCall mum about the weekend", model)), false);
  });

  test("Arabic day markers and place names", (expect) => {
    const days = parse("اليوم 1 وصول إلى عمّان والقلعة\nاليوم 2 البترا\nاليوم 3 وادي رم", model);
    expect("placeIds", days.map((d) => d.placeIds), [["amman"], ["petra"], ["wadi-rum"]]);
  });

  test("No day markers → one line = one day", (expect) => {
    const days = parse("Amman citadel\nPetra all day\nWadi Rum camp", model);
    expect("days", days.map((d) => d.placeIds), [["amman"], ["petra"], ["wadi-rum"]]);
  });

  test("Taking the bus to the Dead Sea → not feasible", (expect) => {
    const r = check(trip("Day 1 - Amman\nDay 2 - Take the bus to the Dead Sea\nDay 3 - Amman, fly home"), model);
    expect("day 2", r.days[1].status, "nf");
  });

  test("Verified data older than 90 days is shown as est.", (expect) => {
    const old = buildModel(raw, "2027-02-01");
    const jett = old.legIndex["amman|petra"].options.find((o) => o.operator === "JETT");
    expect("status", [jett.status, jett.stale], ["est", true]);
    expect("ticket", old.byId.jerash.ticket.status, "est");
  });

  test("Cheaper fix: extra night in Petra, Wadi Rum next morning", (expect) => {
    const f = fix(ref, model, { addNights: ["3|petra~wadi-rum"] });
    expect("6 days", f.days.length, 6);
    expect("day 3 Petra only", f.days[2].placeIds, ["petra"]);
    expect("no nf days", f.check.counts.nf, 0);
  });

  return results;
}
