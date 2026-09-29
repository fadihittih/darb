// Engine test cases (§6). Pure: runs in tests.html and in Node. runCases(raw) → [{ name, ok, details }]
import { buildModel, resolveLeg } from "./engine/model.js";
import { parse, isUsable, previewText, findPlaces, departAirportFrom } from "./engine/parser.js";
import { check, dayRoute, departAirportOf } from "./engine/rules.js";
import { fix } from "./engine/fixer.js";
import { staticSunset, tripDayIso, sunsetLine } from "./weather.js";
import { passValue } from "./engine/pass.js";
import { parseRates, fxLine } from "./fx.js";
import { buildDays, draftPlan, fits, layoutDays, tripSettings } from "./engine/builder.js";

export const REFERENCE_TEXT = `Day 1 – Arrive in Amman. Visit the Citadel and the Roman Theatre.
Day 2 – Drive or take a bus to Petra. Explore the Siq and the Treasury.
Day 3 – Morning at Petra, then head to Wadi Rum for a sunset jeep tour and desert camp.
Day 4 – Visit Jerash in the morning and float in the Dead Sea in the afternoon.
Day 5 – Madaba mosaics and Mount Nebo, then fly home.`;

/** ChatGPT's default markdown format (engine audit, case 01). */
export const AUDIT_MARKDOWN = `# 5-Day Jordan Itinerary

### Day 1: Amman
- **9:00 AM** – Arrive at Queen Alia Airport (AMM) and transfer to your hotel
- **1:00 PM** – Lunch at Hashem Restaurant in Downtown
- **3:00 PM** – Visit the **Amman Citadel** and the **Roman Theatre**
- **7:00 PM** – Dinner on Rainbow Street

### Day 2: Amman to Petra
- **6:30 AM** – Take the JETT bus to Wadi Musa
- **11:00 AM** – Check in at your hotel
- **2:00 PM** – Explore **Petra** – the Siq and the Treasury
- **Evening** – Petra by Night (optional)

### Day 3: Petra to Wadi Rum
- **8:00 AM** – Hike to the **Monastery**
- **2:00 PM** – Transfer to **Wadi Rum**
- **5:00 PM** – Sunset jeep tour
- **Overnight** – Bedouin camp

### Day 4: Wadi Rum to the Dead Sea
- **9:00 AM** – Drive to the **Dead Sea**
- **3:00 PM** – Float in the Dead Sea

### Day 5: Departure
- **10:00 AM** – Visit **Madaba** and **Mount Nebo**
- **6:00 PM** – Depart from Queen Alia Airport`;


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

  test("Reference: Jordan Pass — Explorer 75 vs 116 → save 41 JOD", (expect) => {
    expect("tier", refCheck.pass.tier.id, "explorer");
    expect("bought separately", refCheck.pass.separate, 116);
    expect("savings", refCheck.pass.savings, 41);
    expect("visa waived", refCheck.pass.visaWaived, true);
    expect("line items", refCheck.pass.items.map((i) => `${i.label} ${i.jod}`).sort(),
      ["Amman Citadel 3", "Jerash 10", "Madaba Archaeological Park 3", "Petra (2 days) 55", "Visa on arrival 40", "Wadi Rum protected area 5"]);
    expect("no unpriced small fees", refCheck.pass.smallFees, []);
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

  test("3-day trip (2 nights) → visa waived (jordanpass.jo: minimum two nights)", (expect) => {
    const p = passValue(trip("Day 1 - Amman citadel\nDay 2 - Jerash\nDay 3 - Madaba, then fly home").days, model);
    expect("nights", p.nights, 2);
    expect("visa waived", p.visaWaived, true);
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

  // ---------- A1 parser robustness (texts from the engine audit) ----------
  const ids = (text) => parse(text, model).map((d) => d.placeIds);

  test("Parser: ChatGPT markdown headings (### Day N: A to B) — origin is not a visit", (expect) => {
    const days = parse(AUDIT_MARKDOWN, model);
    expect("5 days, title line ignored", days.length, 5);
    expect("placeIds", days.map((d) => d.placeIds), [["amman"], ["petra"], ["wadi-rum"], ["dead-sea"], ["madaba"]]);
    expect("day 5 depart", days[4].hints.depart, true);
  });

  test("Parser: bold, bullet and emoji day markers", (expect) => {
    expect("bold", ids("**Day 1 – Amman**\nCitadel\n**Day 2 – Petra**\nSiq"), [["amman"], ["petra"]]);
    expect("emoji", ids("📍 Day 1: Amman\n📍 Day 2: Petra"), [["amman"], ["petra"]]);
    expect("bullet", ids("- Day 1: Amman\n- Day 2: Petra"), [["amman"], ["petra"]]);
  });

  test("Parser: day ranges expand (Day 1-2, Days 3–4)", (expect) => {
    expect("Day 1-2", ids("Day 1-2: Amman and Jerash\nDay 3-4: Petra\nDay 5: Wadi Rum"),
      [["amman", "jerash"], ["amman", "jerash"], ["petra"], ["petra"], ["wadi-rum"]]);
    const days = parse("Days 1–2: Amman (Citadel, Downtown), Jerash\nDays 3–4: Petra\nDay 5: Fly home", model);
    expect("Days 1–2 → 5 days", days.map((d) => d.placeIds), [["amman", "jerash"], ["amman", "jerash"], ["petra"], ["petra"], []]);
    expect("last day departs", days[4].hints.depart, true);
    // range edge cases (Review Focus 3 and 4)
    expect("bold range", ids("**Days 1–2: Amman**\n**Day 3: Petra**"), [["amman"], ["amman"], ["petra"]]);
    expect("'Day 1 - 2 hours' is not a range", ids("Day 1 - 2 hours in Amman\nDay 2: Petra"), [["amman"], ["petra"]]);
    expect("capped at 21 days", parse("Days 1-7: Amman\nDays 8-14: Petra\nDays 15-21: Wadi Rum\nDays 22-28: Aqaba", model).length, 21);
  });

  test("Parser: 'A to B' / 'A → B' headings drop yesterday's place", (expect) => {
    const t = trip("Day 1: Arrive in Amman\n- Citadel\nDay 2: Amman to Petra\n- JETT bus 6:30 AM, explore Petra\nDay 3: Petra to Wadi Rum\n- transfer, jeep, camp\nDay 4: Wadi Rum to Dead Sea\n- drive\nDay 5: Dead Sea to Amman\n- fly home");
    expect("placeIds", t.days.map((d) => d.placeIds), [["amman"], ["petra"], ["wadi-rum"], ["dead-sea"], ["amman"]]);
    expect("no ONE_DEPARTURE / PETRA_TOO_SHORT", check(t, model).days.flatMap(codes).filter((c) => ["ONE_DEPARTURE", "PETRA_TOO_SHORT"].includes(c)), []);
    expect("arrows + day trip", ids("Day 1: Amman\nDay 2: Amman → Jerash → Amman\nDay 3: Amman → Petra\nDay 4: Petra → Amman"),
      [["amman"], ["jerash", "amman"], ["petra"], ["amman"]]);
    expect("from Petra … back to Amman", ids("Day 1: Arrive AMM\nDay 2: Take the JETT bus at 6:30 to Petra\nDay 3: JETT bus from Petra at 7:00 AM back to Amman, Citadel\nDay 4: Fly home"),
      [[], ["petra"], ["amman"], []]);
  });

  test("Parser: mid-trip 'depart' / 'arrive' are not airport days", (expect) => {
    const dep = parse("Day 1: Amman\nDay 2: Depart Amman 6:30 on the JETT bus to Petra\nDay 3: Wadi Rum\nDay 4: Fly home", model);
    expect("day 2 not a depart day", dep[1].hints.depart, false);
    expect("day 2 = Petra", dep[1].placeIds, ["petra"]);
    const arr = parse("Day 1: Amman\nDay 2: JETT to Petra\nDay 3: Arrive in Wadi Rum by 11am for a jeep tour and camp\nDay 4: Fly home", model);
    expect("day 3 not an arrival day", arr[2].hints.arrive, false);
    expect("a real mid-trip flight still departs", parse("Day 1: Amman\nDay 2: Depart from Queen Alia airport\nDay 3: Petra", model)[1].hints.depart, true);
  });

  test("Parser: Arabic spellings (البتراء, وادي رام, و prefix, Arabic-Indic digits)", (expect) => {
    expect("06a", ids("اليوم 1: عمّان - القلعة والمدرج الروماني\nاليوم 2: البتراء\nاليوم 3: وادي رم\nاليوم 4: البحر الميت\nاليوم 5: جرش"),
      [["amman"], ["petra"], ["wadi-rum"], ["dead-sea"], ["jerash"]]);
    expect("06b", ids("اليوم 1: عمان\nاليوم 2: البترا\nاليوم 3: وادي رام والعقبة\nاليوم 4: مأدبا وجبل نبو\nاليوم 5: ضانا والكرك"),
      [["amman"], ["petra"], ["wadi-rum", "aqaba"], ["madaba"], ["dana", "kerak"]]);
    expect("06c", ids("اليوم ١: عمان\nاليوم ٢: البتراء"), [["amman"], ["petra"]]);
  });

  test("Parser: typos, hyphens and accents", (expect) => {
    expect("16a", ids("Day 1: Amman\nDay 2: Petr\nDay 3: Jarash and Dead see\nDay 4: Wadi Ram"),
      [["amman"], ["petra"], ["jerash", "dead-sea"], ["wadi-rum"]]);
    expect("16b", ids("Day 1: Amman\nDay 2: Madeba and Nebo\nDay 3: Kerek Castle\nDay 4: Um Qais and Ajlun\nDay 5: Al Salt"),
      [["amman"], ["madaba"], ["kerak"], ["umm-qais", "ajloun"], ["as-salt"]]);
    expect("Dead-Sea / Wadi-Rum / Ammān / Pétra", ["Dead-Sea", "Wadi-Rum", "Ammān", "Pétra"].map((w) => findPlaces(w, model.places)),
      [["dead-sea"], ["wadi-rum"], ["amman"], ["petra"]]);
  });

  test("Parser: generic words no longer map to places", (expect) => {
    const probe = ["Desert Castles tour", "desert safari", "base camp", "rum punch", "Jeep", "Monastery of Saint George", "the Siq", "Treasury", "float", "Mosaic map", "Dead Sea salt scrub"];
    expect("probes", probe.map((w) => findPlaces(w, model.places)), [[], [], [], [], [], [], ["petra"], ["petra"], [], [], ["dead-sea"]]);
    expect("case 22", ids("Day 1: Amman\nDay 2: Visit the Dead Sea and buy Dead Sea salt scrub; rum punch at a bar; camp out\nDay 3: Fly home"),
      [["amman"], ["dead-sea"], []]);
  });

  test("Parser: places we don't cover are listed, never guessed", (expect) => {
    const days = parse("Day 1: Arrive Amman\nDay 2: Desert Castles - Qasr Amra, Qasr Kharana and Azraq\nDay 3: Wadi Mujib canyon and Little Petra\nDay 4: Feynan Ecolodge and Shobak Castle\nDay 5: Baptism Site (Bethany) then Irbid, fly home", model);
    expect("placeIds", days.map((d) => d.placeIds), [["amman"], [], [], [], []]);
    expect("notCovered", days.map((d) => d.notCovered), [[], ["Desert Castles", "Azraq"], ["Wadi Mujib", "Little Petra"], ["Feynan", "Shobak"], ["Baptism Site", "Irbid"]]);
    expect("preview", previewText(days).endsWith("Not covered yet: Desert Castles, Azraq, Wadi Mujib, Little Petra, Feynan, Shobak, Baptism Site, Irbid."), true);
    expect("only unsupported places → not usable", isUsable(parse("Day 1: Wadi Mujib\nDay 2: Azraq Wetland\nDay 3: Irbid", model)), false);
  });

  // ---------- A2 departure airport ----------
  test("Departure airport: read from the last day, used for the last leg", (expect) => {
    const kh = "Day 1: Arrive Amman\nDay 2: Madaba and Mount Nebo, then Kerak Castle\nDay 3: Dana\nDay 4: Petra\nDay 5: Wadi Rum\nDay 6: Aqaba, fly home from AQJ";
    expect("AQJ from text", departAirportFrom(parse(kh, model)), "AQJ");
    expect("Aqaba airport", departAirportFrom(parse("Day 1: Amman\nDay 2: Petra\nDay 3: Wadi Rum\nDay 4: Aqaba - fly out from Aqaba airport", model)), "AQJ");
    expect("Amman", departAirportFrom(parse("Day 1: Land in Aqaba, snorkel\nDay 2: Fly home from Amman", model)), "AMM");
    expect("reference: none", departAirportFrom(ref.days), null);
    // old trips (no departAirport) and junk values fall back to the arrival airport (Review Focus 2)
    expect("fallbacks", [departAirportOf({ airport: "AQJ" }, model), departAirportOf({ airport: "AMM", departAirport: "XYZ" }, model), departAirportOf({ airport: "AMM", departAirport: "amman" }, model)], ["AQJ", "AMM", "AMM"]);
    const t = trip(kh, { departAirport: "AQJ" });
    const last = dayRoute(t.days, 5, t.settings, model);
    expect("last stop AQJ", last.stops.at(-1), "AQJ");
    expect("no phantom leg to Amman airport", last.legs.some((l) => l.to === "AMM"), false);
    expect("day 6 ok", check(t, model).days[5].status, "ok");
    const t2 = trip("Day 1: Arrive Aqaba\nDay 2: Wadi Rum\nDay 3: Petra\nDay 4: Dana\nDay 5: Amman, fly home", { airport: "AQJ", departAirport: "AMM" });
    expect("AQJ in, AMM out: day 5 ok", check(t2, model).days[4].status, "ok");
  });

  // ---------- A3 arrival-day budget, no full-day place onto arrive/depart days, honest swap text ----------
  test("Arrival day counts the airport transfer; fixer keeps full-day places off arrive/depart days", (expect) => {
    const land = check(trip("Day 1: Land at the airport and go straight to Petra\nDay 2: Petra\nDay 3: Amman, fly home"), model);
    expect("Petra on arrival day overloads", codes(land.days[0]).includes("DAY_OVERLOAD"), true);
    // audit R2: "Day 1: Amman / Day 2: Petra" used to become Day 1 = Petra, "Ready to travel 97/98"
    const two = fix(trip("Day 1: Amman\nDay 2: Petra"), model);
    expect("Amman stays on Day 1", two.days[0].placeIds, ["amman"]);
    expect("not 'Ready to travel'", two.fixed.score < 85, true);
    const three = fix(trip("Day one: Amman\nDay two: Petra\nDay three: Wadi Rum"), model);
    expect("Wadi Rum never moves to Day 1", three.days[0].placeIds, ["amman"]);
    expect("reference keeps 'same direction'", refFix.fixed.changes.some((c) => c.day === 4 && c.text.includes("(same direction)")), true);
    const zig = fix(trip("Day 1: Arrive Amman\nDay 2: Jerash and Ajloun\nDay 3: Umm Qais and Dead Sea\nDay 4: Fly home"), model);
    expect("Umm Qais + Amman never 'same direction'", zig.fixed.changes.some((c) => c.text.includes("(same direction)")), false);
  });

  // ---------- A1 fix round 1 (review findings) ----------
  test("Parser: hyphen and other arrows between places are connectors", (expect) => {
    expect("Amman - Petra", ids("Day 1: Amman\nDay 2: Amman - Petra"), [["amman"], ["petra"]]);
    expect("4-day hyphen plan", ids("Day 1: Amman\nDay 2: Amman - Petra\nDay 3: Petra - Wadi Rum\nDay 4: Wadi Rum - Aqaba, fly home"),
      [["amman"], ["petra"], ["wadi-rum"], ["aqaba"]]);
    expect("Amman-Petra", ids("Day 1: Amman\nDay 2: Amman-Petra"), [["amman"], ["petra"]]);
    expect("Amman > Petra", ids("Day 1: Amman\nDay 2: Amman > Petra"), [["amman"], ["petra"]]);
    expect("Amman ➜ Petra", ids("Day 1: Amman\nDay 2: Amman ➜ Petra"), [["amman"], ["petra"]]);
    expect("hyphenated names still match", ["Dead-Sea", "Wadi-Rum", "As-Salt", "Umm-Qais"].map((w) => findPlaces(w, model.places)),
      [["dead-sea"], ["wadi-rum"], ["as-salt"], ["umm-qais"]]);
  });

  test("Parser: 'A to B' after a day trip or an empty Day 1 drops A", (expect) => {
    expect("after a day trip", ids("Day 1: Arrive in Amman\nDay 2: Day trip to Jerash and Ajloun\nDay 3: Amman to Petra\nDay 4: Petra to Wadi Rum\nDay 5: Wadi Rum to Aqaba, fly home"),
      [["amman"], ["jerash", "ajloun"], ["petra"], ["wadi-rum"], ["aqaba"]]);
    expect("empty Day 1", ids("Day 1: Arrive, rest at hotel\nDay 2: Amman to Petra"), [[], ["petra"]]);
    expect("reference Day 3 keeps Petra", parse(REFERENCE_TEXT, model).map((d) => d.placeIds),
      [["amman"], ["petra"], ["petra", "wadi-rum"], ["jerash", "dead-sea"], ["madaba"]]);
    expect("day trip back", ids("Day 1: Amman\nDay 2: Amman → Jerash → Amman"), [["amman"], ["jerash", "amman"]]);
  });

  test("Parser: Siq, Treasury, Khazneh, Ad Deir are Petra; citadel alone is not Amman", (expect) => {
    expect("Siq to the Treasury", ids("Day 1: Amman\nDay 2: Walk the Siq to the Treasury"), [["amman"], ["petra"]]);
    expect("Khazneh / Ad Deir", ["Al Khazneh at dawn", "Hike to Ad Deir"].map((w) => findPlaces(w, model.places)), [["petra"], ["petra"]]);
    expect("Little Petra / Mujib Siq Trail not Petra", ["Siq al Barid", "Wadi Mujib Siq Trail"].map((w) => findPlaces(w, model.places)), [[], []]);
    expect("citadel", ["Ajloun citadel", "Kerak Castle citadel", "Amman Citadel"].map((w) => findPlaces(w, model.places)),
      [["ajloun"], ["kerak"], ["amman"]]);
    const aq = parse("Day 1: Aqaba Marine Park snorkelling", model)[0];
    expect("Aqaba Marine Park keeps Aqaba", [aq.placeIds, aq.notCovered], [["aqaba"], ["Aqaba Marine Park"]]);
    expect("snorkeling → Aqaba", findPlaces("snorkeling trip", model.places), ["aqaba"]);
  });

  test("Parser: notCovered survives fix()", (expect) => {
    const t = trip("Day 1: Amman and Irbid\nDay 2: Petra\nDay 3: Fly home");
    expect("fixed days keep notCovered", fix(t, model).days.map((d) => d.notCovered), [["Irbid"], [], []]);
  });

  // ---------- A4 "More relaxed" fix card ----------
  test("More relaxed fix: one extra night, same transfer", (expect) => {
    const it = refCheck.days[2].issues.find((i) => i.code === "NO_PUBLIC_TRANSPORT");
    const extra = it.fixes.find((f) => f.kind === "addNight");
    expect("sub", extra.sub, "Adds one night · same transfer, no rush");
    const f = fix(ref, model, { addNights: ["3|petra~wadi-rum"] });
    expect("6 days, clean", [f.days.length, f.check.counts.nf + f.check.counts.risky], [6, 0]);
  });

  // ---------- A1 fix round 2: a dash is a list of sights unless it starts from yesterday's place ----------
  test("Parser: dash lists keep every sight; a dash drops only yesterday's place", (expect) => {
    expect("Jerash-Ajloun", ids("Day 1: Amman\nDay 2: Jerash-Ajloun"), [["amman"], ["jerash", "ajloun"]]);
    expect("Wadi Rum - Aqaba after Petra", ids("Day 1: Amman\nDay 2: Petra\nDay 3: Wadi Rum - Aqaba"), [["amman"], ["petra"], ["wadi-rum", "aqaba"]]);
    expect("Jerash - Ajloun - Umm Qais", ids("Day 1: Amman\nDay 2: Jerash - Ajloun - Umm Qais"), [["amman"], ["jerash", "ajloun", "umm-qais"]]);
    expect("Amman - Petra after Amman", ids("Day 1: Amman\nDay 2: Amman - Petra"), [["amman"], ["petra"]]);
    expect("Petra - Wadi Rum after Petra", ids("Day 1: Amman\nDay 2: Petra\nDay 3: Petra - Wadi Rum"), [["amman"], ["petra"], ["wadi-rum"]]);
    expect("'to' still drops after a day trip", ids("Day 1: Amman\nDay 2: Jerash\nDay 3: Amman to Petra"), [["amman"], ["jerash"], ["petra"]]);
  });

  // ---------- A8 data: new legs, one-way verified JETT ----------
  test("Legs: new est. legs, and the JETT timetable is only verified Amman → Petra", (expect) => {
    const back = resolveLeg(model, "petra", "amman").options[0];
    expect("reverse JETT", [back.label, back.status, back.departs, back.notes], ["JETT bus Wadi Musa → Abdali", "est", null, "Return schedule to verify."]);
    const fwd = resolveLeg(model, "amman", "petra").options[0];
    expect("forward JETT still verified", [fwd.status, fwd.departs], ["verified", "06:30"]);
    const added = [["amman", "aqaba"], ["petra", "aqaba"], ["wadi-rum", "aqaba"], ["amman", "kerak"], ["dana", "petra"], ["AQJ", "aqaba"]];
    expect("seeded both ways", added.map(([a, b]) => [resolveLeg(model, a, b).fallback, resolveLeg(model, b, a).fallback]).flat().every((x) => x === false), true);
    expect("all est., no times", added.flatMap(([a, b]) => resolveLeg(model, a, b).options).every((o) => o.status === "est" && !o.departs), true);
    expect("AQJ → Aqaba taxi", resolveLeg(model, "AQJ", "aqaba").options[0].cost, [8, 12]);
    const back4 = fix(trip("Day 1: Arrive Aqaba\nDay 2: Wadi Rum\nDay 3: Petra\nDay 4: Amman\nDay 5: Fly home from Amman", { airport: "AQJ", departAirport: "AMM" }), model);
    const leg = back4.fixed.days.flatMap((d) => d.items).find((i) => i.kind === "leg" && i.legKey === "petra~amman");
    expect("Petra → Amman shows no ✓", leg?.verified, false);
    const t3 = trip("Day 1: Arrive Aqaba\nDay 2: Wadi Rum\nDay 3: Petra\nDay 4: Aqaba, fly home", { airport: "AQJ" });
    expect("AQJ in and out: last legs", dayRoute(t3.days, 3, t3.settings, model).legs.map((l) => l.key), ["petra~aqaba", "aqaba~AQJ"]);
    expect("AQJ in and out, Aqaba at the end: all ok", check(t3, model).days.map((d) => d.status), ["ok", "ok", "ok", "ok"]);
  });

  // ---------- A9 car hire in the trip cost ----------
  test("Car trips: rental est. 25–30 JOD per day is in the total", (expect) => {
    const car = fix(trip(REFERENCE_TEXT, { car: true }), model).fixed.cost;
    expect("carHire", car.carHire, [125, 150]);
    expect("total = pass + car hire", car.total, [car.passJod + car.busJod + car.transfers[0] + 125, car.passJod + car.busJod + car.transfers[1] + 150]);
    expect("no car → no car hire", refFix.fixed.cost.carHire, null);
    expect("reference total", refFix.fixed.cost.total, [305, 385]);
  });

  // ---------- B3 currency hint ----------
  test("Currency hint: Frankfurter rates → est. EUR/USD line, silent on junk", (expect) => {
    const r = parseRates([{ date: "2026-09-29", base: "JOD", quote: "EUR", rate: 1.2404 }, { date: "2026-09-29", base: "JOD", quote: "USD", rate: 1.4104 }]);
    expect("parsed", r, { EUR: 1.2404, USD: 1.4104, date: "2026-09-29" });
    expect("line", fxLine([305, 385], r), "≈ 380–480 EUR · 430–545 USD (est., rate of 29 Sep)");
    expect("junk → null", [parseRates(null), parseRates({ error: "x" }), parseRates([{ quote: "EUR", rate: "n/a" }])], [null, null, null]);
    expect("no rates → empty", fxLine([305, 385], null), "");
  });

  // ---------- B2 sunset ----------
  test("Sunset: static Wadi Rum table and the leg banner line", (expect) => {
    expect("October", staticSunset("wadi-rum", 10), "18:07");
    expect("June", staticSunset("wadi-rum", 6), "19:39");
    expect("only Wadi Rum has a table", [staticSunset("petra", 10), staticSunset("wadi-rum", 13)], [null, null]);
    expect("trip day 3", tripDayIso("2026-10-12", 3), "2026-10-14");
    expect("no start date", tripDayIso(null, 3), null);
    const ts = "Sunset jeep tours need arrival before ~16:00.";
    expect("static line", sunsetLine({ time: "18:07", live: false, date: null }, 10, ts), "Sunset ≈ 18:07 in October — arrive by 16:00");
    expect("live line", sunsetLine({ time: "18:22", live: true, date: "2026-10-02" }, 10, ts), "Sunset 18:22 on 2 Oct (Open-Meteo forecast) — arrive by 16:00");
  });

  return results;
}
