// Engine test cases (§6). Pure: runs in tests.html and in Node. runCases(raw) → [{ name, ok, details }]
import { buildModel } from "./engine/model.js";
import { parse, isUsable } from "./engine/parser.js";
import { check } from "./engine/rules.js";
import { fix } from "./engine/fixer.js";
import { passValue } from "./engine/pass.js";
import { buildDays, draftPlan, fits, layoutDays, tripSettings } from "./engine/builder.js";

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

  test("Build a plan: History + Nature + Desert, 5 days, no car → draft scores 90+", (expect) => {
    const s = { ...REFERENCE_SETTINGS, days: 5 };
    const d = draftPlan(["amman", "jerash", "petra", "wadi-rum", "umm-qais"], s, model);
    expect("5 days", d.trip.days.length, 5);
    expect("score ≥ 90", d.score >= 90, true);
    expect("no nf days", d.res.check.counts.nf, 0);
    expect("clean → saved as fixed", d.clean, true);
    expect("saved score = fixed score", d.score, d.res.fixed.score);
    expect("every place kept", d.trip.days.flatMap((x) => x.placeIds).sort(), ["amman", "jerash", "petra", "umm-qais", "wadi-rum"]);
    expect("arrive / depart", [d.trip.days[0].hints.arrive, d.trip.days[4].hints.depart], [true, true]);
    expect("source", d.trip.source, "build");
  });

  test("Build a plan: fits, free days, pairing and dropped places", (expect) => {
    const s = { ...REFERENCE_SETTINGS, days: 4 };
    expect("Wadi Rum from the airport doesn't fit", fits("wadi-rum", [], s, model), false);
    expect("Wadi Rum after Petra needs a transfer (no car)", fits("wadi-rum", ["petra"], s, model), false);
    expect("Wadi Rum after Petra with a car fits", fits("wadi-rum", ["petra"], { ...s, car: true }, model), true);
    expect("Dead Sea from Amman fits", fits("dead-sea", ["amman"], s, model), true);
    expect("Umm Qais fits", fits("umm-qais", ["amman", "jerash"], s, model), true);
    const days = buildDays(["petra", "amman"], s, model);
    expect("greedy from the airport + free days", days.map((x) => x.placeIds), [["amman"], ["petra"], [], []]);
    expect("last day departs", days[3].hints.depart, true);
    const tight = layoutDays(["amman", "jerash", "as-salt", "madaba", "petra"], { ...s, days: 3 }, model);
    expect("Amman & As-Salt share a day", tight.days.some((x) => x.placeIds.length === 2 && x.placeIds.includes("amman") && x.placeIds.includes("as-salt")), true);
    expect("Petra dropped", tight.dropped, ["petra"]);
    expect("Petra fits after Amman when Petra and Wadi Rum are chosen", fits("petra", ["amman", "petra", "wadi-rum"], s, model), true);
  });

  test("Build a plan: no pairing on arrive/depart days, greedy order survives fix()", (expect) => {
    const s = { ...REFERENCE_SETTINGS, days: 3 };
    const { days } = layoutDays(["amman", "as-salt", "jerash", "ajloun", "umm-qais"], s, model);
    expect("no day has 3 places", days.every((d) => d.placeIds.length <= 2), true);
    expect("arrive / depart days hold one place", [days[0].placeIds.length, days[2].placeIds.length], [1, 1]);
    const res = fix({ days, settings: tripSettings(s) }, model);
    expect("fix() keeps the builder's days", res.days.map((d) => d.placeIds), days.map((d) => d.placeIds));
  });

  return results;
}
