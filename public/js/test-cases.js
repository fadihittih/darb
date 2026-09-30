// Engine test cases (§6). Pure: runs in tests.html and in Node. runCases(raw) → [{ name, ok, details }]
import { buildModel, resolveLeg, shortName } from "./engine/model.js";
import { parse, isUsable, previewText, findPlaces, departAirportFrom, firstSentence, modePhrase, sightsTitle } from "./engine/parser.js";
import { check, dayRoute, departAirportOf } from "./engine/rules.js";
import { fix } from "./engine/fixer.js";
import { passValue } from "./engine/pass.js";
import { parseRates, fxLine } from "./fx.js";
import { buildDays, draftPlan, fits, layoutDays, tripSettings } from "./engine/builder.js";
import { fmtRange, tripEnded } from "./engine/format.js";
import { staticSunset, tripDayIso, sunsetLine } from "./weather.js";
import { routeMap, JORDAN_OUTLINE, googleDirectionsUrl } from "./map.js";
import { METHODS, VERIFIED_METHODS, validateOption, validateTicket, freshness, sameData, parseUpdateField, revertInputs, updateWhat } from "./admin-validate.js";

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

  test("Bus on a leg with no public transport → not feasible (Madaba → Dead Sea)", (expect) => {
    const r = check(trip("Day 1 - Amman\nDay 2 - Madaba\nDay 3 - Take the bus to the Dead Sea\nDay 4 - Amman, fly home"), model);
    expect("day 3", r.days[2].status, "nf");
    expect("rule", r.days[2].issues.some((i) => i.code === "NO_PUBLIC_TRANSPORT"), true);
    // Amman → Dead Sea has a licensed minibus (LTRC, 0.95 JOD) since pass 2, so the same wording from Amman is not nf.
    const a = check(trip("Day 1 - Amman\nDay 2 - Take the bus to the Dead Sea\nDay 3 - Amman, fly home"), model);
    expect("from Amman not nf", a.days[1].status !== "nf", true);
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

  test("Parser: day markers on one line split after sentence punctuation; prose day references do not", (expect) => {
    expect("one line", ids("Day 1: Amman. Day 2: Petra. Day 3: Wadi Rum."), [["amman"], ["petra"], ["wadi-rum"]]);
    expect("prose reference", parse("Day 1: Amman. We loved day 2 in Petra, said a friend.", model).length, 1);
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
    const kerakBus = resolveLeg(model, "amman", "kerak").options.find((o) => o.label === "Minibus from South station");
    expect("all est., no times (except the Kerak minibus)", added.flatMap(([a, b]) => resolveLeg(model, a, b).options).filter((o) => o !== kerakBus && o.label !== kerakBus.label).every((o) => o.status === "est" && !o.departs), true);
    expect("Kerak minibus: verified LTRC fare, no times", [kerakBus.status, kerakBus.cost, /^https:\/\//.test(kerakBus.sourceUrl || ""), !kerakBus.departs], ["verified", [2.3, 2.3], true, true]);
    expect("AQJ → Aqaba taxi", resolveLeg(model, "AQJ", "aqaba").options[0].cost, [8, 12]);
    const back4 = fix(trip("Day 1: Arrive Aqaba\nDay 2: Wadi Rum\nDay 3: Petra\nDay 4: Amman\nDay 5: Fly home from Amman", { airport: "AQJ", departAirport: "AMM" }), model);
    const leg = back4.fixed.days.flatMap((d) => d.items).find((i) => i.kind === "leg" && i.legKey === "petra~amman");
    expect("Petra → Amman shows no ✓", leg?.verified, false);
    const t3 = trip("Day 1: Arrive Aqaba\nDay 2: Wadi Rum\nDay 3: Petra\nDay 4: Aqaba, fly home", { airport: "AQJ" });
    expect("AQJ in and out: last legs", dayRoute(t3.days, 3, t3.settings, model).legs.map((l) => l.key), ["petra~aqaba", "aqaba~AQJ"]);
    expect("AQJ in and out, Aqaba at the end: all ok", check(t3, model).days.map((d) => d.status), ["ok", "ok", "ok", "ok"]);
  });

  // ---------- A8b pass 2: LTRC minibus Amman → Dead Sea, Rum Bus est option ----------
  test("Pass 2: bus to the Dead Sea is no longer nf; Rum Bus doesn't change the reference", (expect) => {
    const ds = resolveLeg(model, "amman", "dead-sea");
    expect("Amman → Dead Sea is limited", ds.publicTransport, "limited");
    const mini = ds.options.find((o) => o.mode === "minibus");
    expect("Dead Sea minibus: verified 0.95, no times, not recommended", [mini?.status, mini?.cost, !mini?.departs, !mini?.recommended], ["verified", [0.95, 0.95], true, true]);
    expect("taxi stays recommended", ds.options[0].recommended && ds.options[0].mode, "taxi");
    const t = trip("Day 1 – Arrive in Amman. Visit the Citadel.\nDay 2 – Take the bus to the Dead Sea.\nDay 3 – Back to Amman, fly home.");
    const d2 = check(t, model).days[1];
    expect("Day 2 not nf", d2.status !== "nf", true);
    expect("no NO_PUBLIC_TRANSPORT", d2.issues.some((i) => i.code === "NO_PUBLIC_TRANSPORT"), false);
    const pw = resolveLeg(model, "petra", "wadi-rum");
    const rum = pw.options.find((o) => o.mode === "shuttle");
    expect("Rum Bus est, not recommended", [rum?.status, !rum?.recommended, rum?.cost], ["est", true, [10, 10]]);
    expect("recommended row first on the leg page", [pw.options[0].label, pw.options[0].recommended], ["Pre-arranged transfer", true]);
    const d3 = refFix.fixed.days[2].items.find((i) => i.kind === "leg" && i.legKey === pw.key);
    expect("reference Day 3 still uses the transfer", d3?.option?.label, "Pre-arranged transfer");
    expect("reference 58 → 94", [refCheck.score, refFix.fixed.score], [58, 94]);
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
    expect("probes", [fxLine([305, 385], []), fxLine([305, 385], { USD: 1.4 }), fxLine([0, 0], r), fxLine([305, 385], r) !== ""], ["", "", "", true]);
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

  // ---------- C4 trip ended + JOD decimals ----------
  test("Trip ended: confirmations only after the last day", (expect) => {
    expect("past", tripEnded("2026-09-01", 5, "2026-09-30"), true);
    expect("last day is today", tripEnded("2026-09-26", 5, "2026-09-30"), false);
    expect("future", tripEnded("2026-10-12", 5, "2026-09-30"), false);
    expect("no date", tripEnded(null, 5, "2026-09-30"), null);
    // Trip 26–30 Sep ends after 30 Sep. 1 Oct 00:30 in Amman is still 30 Sep 21:30 UTC.
    expect("00:30 Amman next day → ended", tripEnded("2026-09-26", 5, "2026-09-30T21:30:00Z"), true);
    expect("23:30 Amman last day → not yet", tripEnded("2026-09-26", 5, "2026-09-30T20:30:00Z"), false);
  });

  test("fmtRange: decimals only when needed", (expect) => {
    expect("1.10", fmtRange([1.1, 1.1]), "1.10 JOD");
    expect("0.95", fmtRange([0.95, 0.95]), "0.95 JOD");
    expect("range", fmtRange([35, 45]), "35–45 JOD");
    expect("single int", fmtRange([10, 10]), "10 JOD");
  });

  // ---------- C1 traveller's own words ----------
  test("Day text: first sentence and the planned transport phrase", (expect) => {
    expect("first sentence", firstSentence(ref.days[1].text), "Drive or take a bus to Petra");
    expect("markdown stripped", firstSentence("- **9:00 AM** – Arrive at Queen Alia Airport (AMM)\n- lunch"), "Arrive at Queen Alia Airport (AMM)");
    expect("mode phrase", modePhrase(ref.days[1].text, "car"), "Drive or take a bus to Petra");
    expect("no mode", modePhrase("Madaba mosaics", null), null);
    const md = parse(AUDIT_MARKDOWN, model);
    expect("markdown heading line skipped", md.map((d) => firstSentence(d.text)).slice(0, 3),
      ["Arrive at Queen Alia Airport (AMM) and transfer to your hotel", "Take the JETT bus to Wadi Musa", "Hike to the Monastery"]);
    expect("no markdown left", md.every((d) => !/[*#]/.test(firstSentence(d.text))), true);
    expect("capped at 90", firstSentence("Walk " + "very ".repeat(40) + "far").length <= 90, true);
    expect("empty", firstSentence(""), "");
  });

  test("Day title names the sights the traveller wrote", (expect) => {
    expect("reference titles", ref.days.map((d) => sightsTitle(d, model)),
      ["Amman — Citadel & Roman Theatre", "Petra — Siq & Treasury", "Petra + Wadi Rum", "Jerash + Dead Sea", "Madaba — Mosaics & Mount Nebo"]);
    const d = parse("Day 1: Petra and Wadi Rum", model)[0];
    expect("no sights → normal title", sightsTitle(d, model), d.title);
    expect("three sights", sightsTitle({ title: "Amman", text: "Citadel, Roman Theatre, Rainbow Street", placeIds: ["amman"] }, model), "Amman — Citadel, Roman Theatre & Rainbow Street");
    expect("no text (built plan)", sightsTitle({ title: "Petra", placeIds: ["petra"] }, model), "Petra");
  });

  test("Day title ignores negated sights", (expect) => {
    expect("skip / no", sightsTitle({ title: "Petra", text: "Petra — we skip the Treasury, no Siq", placeIds: ["petra"] }, model), "Petra");
    expect("instead of", sightsTitle({ title: "Petra", text: "Petra: the Monastery instead of the Treasury", placeIds: ["petra"] }, model), "Petra — Monastery");
    expect("negation in an earlier sentence doesn't leak", sightsTitle({ title: "Petra", text: "No rush. Siq and Treasury", placeIds: ["petra"] }, model), "Petra — Siq & Treasury");
    expect("without", sightsTitle({ title: "Amman", text: "Amman without the Citadel, just Rainbow Street", placeIds: ["amman"] }, model), "Amman — Rainbow Street");
  });

  test("Day text: clipped at a word boundary", (expect) => {
    const long = "Walk through the extraordinarily extraordinary colonnaded street and then the " + "wonderful ".repeat(8);
    const c = firstSentence(long);
    expect("≤ 90 chars", c.length <= 90, true);
    expect("ends with …", c.endsWith("…"), true);
    expect("whole words only", long.startsWith(c.slice(0, -1)) && /\s/.test(long[c.length - 1]), true);
    const m = modePhrase("Take the JETT bus from Amman all the way down to the rose-red city of Petra early", "bus");
    expect("mode phrase ≤ 60, whole words", m, "Take the JETT bus from Amman all the way down to the…");
  });

  test("Day text: sentences don't split on Mt. / St. / Dr. / e.g.", (expect) => {
    expect("Mt.", firstSentence("Madaba mosaics and Mt. Nebo. Then fly home."), "Madaba mosaics and Mt. Nebo");
    expect("St.", firstSentence("See St. George church in Madaba. Lunch after."), "See St. George church in Madaba");
    expect("Dr.", firstSentence("Meet Dr. Haddad at the Citadel. Dinner downtown."), "Meet Dr. Haddad at the Citadel");
    expect("e.g.", firstSentence("Try local food, e.g. mansaf, in Amman. Early night."), "Try local food, e.g. mansaf, in Amman");
    expect("title keeps Mount Nebo", sightsTitle({ title: "Madaba", text: "Madaba mosaics and Mt. Nebo", placeIds: ["madaba"] }, model), "Madaba — Mosaics & Mount Nebo");
  });

  test("Route map: Jordan outline drawn under the route, every stop labelled", (expect) => {
    const svg = routeMap(ref.days, ref.settings, model, ["ok", "ok", "nf", "risky", "ok"]);
    const path = svg.indexOf("<path");
    const circle = svg.indexOf("<circle");
    expect("outline present", path > -1, true);
    expect("outline before first dot", path > -1 && path < circle, true);
    const labels = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    for (const id of ["amman", "petra", "wadi-rum", "jerash", "dead-sea", "madaba"]) {
      expect(`label ${id}`, labels.includes(shortName(model.byId[id]).replace(/&/g, "&amp;")), true);
    }
    expect("accessible name", /Route map of Jordan: /.test(svg), true);
    const pts = [...svg.matchAll(/<(?:circle cx|text x)="([\d.-]+)"(?: cy| y)="([\d.-]+)"/g)].map((m) => [+m[1], +m[2]]);
    expect("everything inside the 320×360 box", pts.every(([x, y]) => x >= 0 && x <= 320 && y >= 0 && y <= 394), true);
    const inside = ([x, y]) => { let c = false; for (let i = 0, j = JORDAN_OUTLINE.length - 1; i < JORDAN_OUTLINE.length; j = i++) {
      const [xi, yi] = JORDAN_OUTLINE[i]; const [xj, yj] = JORDAN_OUTLINE[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const outside = [...model.places, ...model.airports].filter((p) => !inside([p.lng, p.lat])).map((p) => p.id);
    expect("all 12 places + airports inside the outline", outside, []);
  });

  test("Google Maps embed URL: key-less directions, 4-decimal coordinates, max 10 stops", (expect) => {
    const two = googleDirectionsUrl([{ lat: 31.95, lng: 35.9 }, { lat: 30.328611, lng: 35.444167 }]);
    expect("2 points", two, "https://maps.google.com/maps?saddr=31.9500%2C35.9000&daddr=30.3286%2C35.4442&output=embed");
    expect("no key", /key=/.test(two), false);
    const pts = Array.from({ length: 12 }, (_, i) => ({ lat: 30 + i / 10, lng: 35 + i / 100 }));
    const url = new URL(googleDirectionsUrl(pts));
    const daddr = url.searchParams.get("daddr").split(" to:");
    expect("12 → 10 stops (origin + 9)", daddr.length + 1, 10);
    expect("keeps the first 9", url.searchParams.get("saddr") + "|" + daddr[7], "30.0000,35.0000|30.8000,35.0800");
    expect("keeps the last", daddr.at(-1), "31.1000,35.1100");
    expect("consecutive duplicates dropped", googleDirectionsUrl([pts[0], pts[0], pts[1]]), googleDirectionsUrl([pts[0], pts[1]]));
    expect("one point → no URL", googleDirectionsUrl([pts[0], pts[0]]), "");
    const leg = googleDirectionsUrl([model.byId.petra, model.byId["wadi-rum"]]);
    expect("real leg uses 4 decimals", /saddr=-?\d+\.\d{4}%2C-?\d+\.\d{4}&daddr=-?\d+\.\d{4}%2C-?\d+\.\d{4}&output=embed$/.test(leg), true);
  });

  /* ---------- /admin validator (admin-validate.js) ---------- */

  const OPT = { label: "JETT bus", operator: "JETT", mode: "bus", cost: [10, 10], departs: "06:30", status: "verified",
    verifiedOn: "2026-09-24", sourceUrl: "https://jett.com.jo/booking", method: "web", source: "JETT booking — checked 24 Sep 2026" };
  const EST = { label: "Private driver", mode: "driver", cost: [35, 45], status: "est" };
  // The form as admin.js reads it: every field a trimmed string.
  const form = (o, over = {}) => ({
    costMin: Array.isArray(o.cost) ? String(o.cost[0]) : "", costMax: Array.isArray(o.cost) ? String(o.cost[1]) : "",
    departs: o.departs || "", status: o.status === "verified" ? "verified" : "est", verifiedOn: o.verifiedOn || "",
    notes: o.notes || "", source: o.source || "", sourceUrl: o.sourceUrl || "", method: o.method || "", ...over });
  const errOf = (o, over) => validateOption(o, form(o, over), TODAY).error;

  test("Admin validator: method lists match check-data.mjs", (expect) => {
    expect("METHODS", METHODS, ["web", "phone", "field", "whatsapp", "operator", "web-est"]);
    expect("VERIFIED_METHODS", VERIFIED_METHODS, ["web", "phone", "field", "operator"]);
  });

  test("Admin validator: a valid edit gives the new option and display + JSON-safe changes", (expect) => {
    const r = validateOption(OPT, form(OPT, { costMin: "12", costMax: "12", notes: "Daily" }), TODAY);
    expect("no error", r.error, undefined);
    expect("cost", r.option.cost, [12, 12]);
    expect("other keys kept", [r.option.label, r.option.operator, r.option.mode], ["JETT bus", "JETT", "bus"]);
    expect("changes", r.changes, [
      { field: "cost", from: "10–10", to: "12–12", fromValue: [10, 10], toValue: [12, 12] },
      { field: "notes", from: "", to: "Daily", fromValue: null, toValue: "Daily" }]);
    expect("no warnings", r.warnings, []);
    const cleared = validateOption(EST, form(EST, { costMin: "", costMax: "" }), TODAY);
    expect("empty pair → cost null", cleared.option.cost, null);
    expect("cleared cost change", cleared.changes, [{ field: "cost", from: "35–45", to: "", fromValue: [35, 45], toValue: null }]);
  });

  test("Admin validator: decimal fares 0.95 and 1.10 are valid", (expect) => {
    const r = validateOption(EST, form(EST, { costMin: "0.95", costMax: "1.10" }), TODAY);
    expect("no error", r.error, undefined);
    expect("cost", r.option.cost, [0.95, 1.1]);
    expect("display", r.changes[0].to, "0.95–1.1");
    expect("value", r.changes[0].toValue, [0.95, 1.1]);
  });

  test("Admin validator: cost pair rules", (expect) => {
    expect("one without the other", errOf(EST, { costMax: "" }), "Private driver: enter both cost min and cost max, or leave both empty.");
    expect("min > max", errOf(EST, { costMin: "50", costMax: "40" }), "Private driver: cost min can’t be higher than cost max.");
    expect("negative", errOf(EST, { costMin: "-1", costMax: "4" }), "Private driver: costs must be positive numbers.");
    expect("not a number", errOf(EST, { costMin: "abc", costMax: "4" }), "Private driver: costs must be positive numbers.");
  });

  test("Admin validator: departs must be HH:MM", (expect) => {
    expect("6:30", errOf(OPT, { departs: "6:30" }), "JETT bus: departs must look like 06:30.");
    expect("24:00", errOf(OPT, { departs: "24:00" }), "JETT bus: departs must look like 06:30.");
    expect("23:59 ok", errOf(OPT, { departs: "23:59" }), undefined);
    expect("empty ok", errOf(OPT, { departs: "" }), undefined);
  });

  test("Admin validator: verified needs a date, an https source and a verified method", (expect) => {
    expect("no date", errOf(OPT, { verifiedOn: "" }), "JETT bus: “verified” needs a Verified-on date.");
    expect("no url", errOf(OPT, { sourceUrl: "" }), "JETT bus: “verified” needs a Source URL (the page or document that shows the value).");
    expect("http url", errOf(OPT, { sourceUrl: "http://jett.com.jo" }), "JETT bus: the source URL must start with https://");
    expect("whatsapp", errOf(OPT, { method: "whatsapp" }), "JETT bus: “verified” needs a method of web, phone, field or operator (whatsapp quotes and web-est stay est.).");
    expect("no method", errOf(OPT, { method: "" }), "JETT bus: “verified” needs a method of web, phone, field or operator (whatsapp quotes and web-est stay est.).");
    expect("unknown method", errOf(EST, { method: "email" }), "Private driver: unknown method.");
    expect("whatsapp ok as est.", errOf(EST, { method: "whatsapp" }), undefined);
    expect("bad status", errOf(EST, { status: "maybe" }), "Private driver: status must be verified or est.");
  });

  test("Admin validator: Verified-on must be a real date, not in the future", (expect) => {
    expect("future", errOf(OPT, { verifiedOn: "2026-09-30" }), "JETT bus: Verified-on can’t be in the future.");
    expect("today ok", errOf(OPT, { verifiedOn: TODAY }), undefined);
    expect("not a date", errOf(OPT, { verifiedOn: "24 Sep" }), "JETT bus: Verified-on must be a date like 2026-09-24.");
    expect("31 Feb", errOf(OPT, { verifiedOn: "2026-02-31" }), "JETT bus: Verified-on must be a date like 2026-09-24.");
    expect("future est. is allowed", errOf(EST, { verifiedOn: "2026-10-05" }), undefined);
  });

  test("Admin validator: a stale date warns but saves", (expect) => {
    const r = validateOption(OPT, form(OPT, { verifiedOn: "2026-06-01" }), TODAY);
    expect("no error", r.error, undefined);
    expect("saved", r.option.verifiedOn, "2026-06-01");
    expect("warning", r.warnings.includes("JETT bus: was verified more than 90 days ago — travellers will see it as est. until it is re-checked."), true);
    expect("90 days is not stale", validateOption(OPT, form(OPT, { verifiedOn: "2026-07-01", source: "" }), TODAY).warnings, []);
  });

  test("Admin validator: Source text must follow a new date or URL", (expect) => {
    const r = validateOption(OPT, form(OPT, { verifiedOn: "2026-09-28" }), TODAY);
    expect("date changed, same source", r.warnings, ["JETT bus: the Source text still reads “JETT booking — checked 24 Sep 2026” — update it so it matches the new date or URL."]);
    const u = validateOption(OPT, form(OPT, { sourceUrl: "https://jett.com.jo/new" }), TODAY);
    expect("url changed, same source", u.warnings.length, 1);
    const ok = validateOption(OPT, form(OPT, { verifiedOn: "2026-09-28", source: "JETT booking — checked 28 Sep 2026" }), TODAY);
    expect("source updated → no warning", ok.warnings, []);
    expect("source change logged", ok.changes.map((c) => c.field), ["verifiedOn", "source"]);
    expect("no source text → no warning", validateOption(EST, form(EST, { sourceUrl: "https://example.com/x" }), TODAY).warnings, []);
    expect("source max 200", errOf(EST, { source: "x".repeat(201) }), "Private driver: the Source text can be at most 200 characters.");
  });

  test("Admin validator: unchanged input gives no changes; empty optional fields are removed", (expect) => {
    const same = validateOption(OPT, form(OPT), TODAY);
    expect("no changes", same.changes, []);
    expect("same option", sameData(same.option, OPT), true);
    const r = validateOption(OPT, form(OPT, { status: "est", departs: "", verifiedOn: "", sourceUrl: "", method: "", source: "", notes: "" }), TODAY);
    for (const k of ["departs", "verifiedOn", "sourceUrl", "method", "source", "notes"]) expect(`${k} removed`, k in r.option, false);
    expect("status", r.option.status, "est");
    expect("removed → null value", r.changes.find((c) => c.field === "departs"), { field: "departs", from: "06:30", to: "", fromValue: "06:30", toValue: null });
  });

  test("Admin freshness: est / future / stale / expiring / fresh", (expect) => {
    const f = (o) => freshness(o, TODAY);
    expect("est", f(EST), { state: "est", days: null, left: null, text: "est." });
    expect("future", f({ status: "verified", verifiedOn: "2026-10-01" }).state, "future");
    expect("future text", f({ status: "verified", verifiedOn: "2026-10-01" }).text, "date is in the future");
    expect("stale", f({ status: "verified", verifiedOn: "2026-06-01" }), { state: "stale", days: 120, left: -30, text: "stale — shown as est." });
    expect("no date → stale", f({ status: "verified" }).state, "stale");
    expect("expiring", f({ status: "verified", verifiedOn: "2026-07-16" }), { state: "expiring", days: 75, left: 15, text: "verified 75 d ago · expires in 15 d" });
    expect("fresh", f({ status: "verified", verifiedOn: "2026-09-24" }), { state: "fresh", days: 5, left: 85, text: "verified 5 d ago · expires in 85 d" });
    expect("day 90 still counts", f({ status: "verified", verifiedOn: "2026-07-01" }).state, "expiring");
  });

  test("Admin sameData: ignores key order, sees real differences", (expect) => {
    expect("reordered keys", sameData([{ a: 1, b: [1, 2], c: { x: null } }], [{ c: { x: null }, b: [1, 2], a: 1 }]), true);
    expect("different value", sameData([{ a: 1, b: [1, 2] }], [{ a: 1, b: [1, 3] }]), false);
    expect("extra key", sameData({ a: 1 }, { a: 1, b: undefined }), false);
    expect("array order matters", sameData([1, 2], [2, 1]), false);
    expect("null vs object", sameData(null, {}), false);
    expect("missing live doc", sameData(undefined, [OPT]), false);
  });

  /* ---------- /admin site tickets (validateTicket) ---------- */

  const TIX = { jod: 3, status: "verified", verifiedOn: "2026-09-24", source: "mota.gov.jo — entrance fees table",
    sourceUrl: "https://www.mota.gov.jo/fees", method: "web", coveredByJordanPass: true, label: "Amman Citadel" };
  const BEACH = { jod: 0, status: "est", coveredByJordanPass: false, label: "Beaches vary" };
  const tform = (t, over = {}) => ({
    jod: t.jod == null ? "" : String(t.jod), status: t.status === "verified" ? "verified" : "est", verifiedOn: t.verifiedOn || "",
    notes: t.notes || "", source: t.source || "", sourceUrl: t.sourceUrl || "", method: t.method || "", ...over });
  const terr = (t, over) => validateTicket(t, tform(t, over), TODAY).error;

  test("Admin tickets: a valid edit keeps label and Jordan Pass flag; changes carry JSON-safe values", (expect) => {
    const r = validateTicket(TIX, tform(TIX, { jod: "4.5", notes: "Winter hours" }), TODAY);
    expect("no error", r.error, undefined);
    expect("jod", r.ticket.jod, 4.5);
    expect("other keys kept", [r.ticket.label, r.ticket.coveredByJordanPass], ["Amman Citadel", true]);
    expect("changes", r.changes, [
      { field: "jod", from: "3", to: "4.5", fromValue: 3, toValue: 4.5 },
      { field: "notes", from: "", to: "Winter hours", fromValue: null, toValue: "Winter hours" }]);
    expect("no warnings", r.warnings, []);
    const unknown = validateTicket(BEACH, tform(BEACH, { jod: "" }), TODAY);
    expect("empty → null (price unknown)", unknown.ticket.jod, null);
    expect("0 → unknown is a change", unknown.changes, [{ field: "jod", from: "0", to: "", fromValue: 0, toValue: null }]);
    expect("0 is a price", validateTicket({ ...BEACH, jod: null }, tform(BEACH, { jod: "0" }), TODAY).changes[0].toValue, 0);
  });

  test("Admin tickets: price must be a number of 0 or more, or empty", (expect) => {
    const msg = "Amman Citadel: the price must be a number of 0 or more (leave it empty if unknown).";
    expect("negative", terr(TIX, { jod: "-1" }), msg);
    expect("text", terr(TIX, { jod: "abc" }), msg);
    expect("Infinity", terr(TIX, { jod: "Infinity" }), msg);
    expect("0.95 ok", terr(TIX, { jod: "0.95" }), undefined);
  });

  test("Admin tickets: same verified rules and future-date error as transport options", (expect) => {
    expect("no date", terr(TIX, { verifiedOn: "" }), "Amman Citadel: “verified” needs a Verified-on date.");
    expect("no url", terr(TIX, { sourceUrl: "" }), "Amman Citadel: “verified” needs a Source URL (the page or document that shows the value).");
    expect("http url", terr(TIX, { sourceUrl: "http://mota.gov.jo" }), "Amman Citadel: the source URL must start with https://");
    expect("whatsapp", terr(TIX, { method: "whatsapp" }), "Amman Citadel: “verified” needs a method of web, phone, field or operator (whatsapp quotes and web-est stay est.).");
    expect("future", terr(TIX, { verifiedOn: "2026-09-30" }), "Amman Citadel: Verified-on can’t be in the future.");
    expect("31 Feb", terr(TIX, { verifiedOn: "2026-02-31" }), "Amman Citadel: Verified-on must be a date like 2026-09-24.");
    expect("bad status", terr(BEACH, { status: "maybe" }), "Beaches vary: status must be verified or est.");
    expect("source max 200", terr(BEACH, { source: "x".repeat(201) }), "Beaches vary: the Source text can be at most 200 characters.");
    expect("verified beach without source", terr(BEACH, { status: "verified", verifiedOn: TODAY }), "Beaches vary: “verified” needs a Source URL (the page or document that shows the value).");
  });

  test("Admin tickets: stale and source-text warnings, same as options", (expect) => {
    const stale = validateTicket(TIX, tform(TIX, { verifiedOn: "2026-06-01", source: "mota.gov.jo — checked 1 Jun" }), TODAY);
    expect("stale saves", stale.ticket.verifiedOn, "2026-06-01");
    expect("stale warning", stale.warnings, ["Amman Citadel: was verified more than 90 days ago — travellers will see it as est. until it is re-checked."]);
    const moved = validateTicket(TIX, tform(TIX, { verifiedOn: "2026-09-28" }), TODAY);
    expect("source text warning", moved.warnings, ["Amman Citadel: the Source text still reads “mota.gov.jo — entrance fees table” — update it so it matches the new date or URL."]);
  });

  test("Admin tickets: every seed ticket round-trips with no changes and no error", (expect) => {
    for (const p of raw.places) {
      const r = validateTicket(p.ticket, tform(p.ticket), "2026-09-30");
      expect(`${p.id} error`, r.error, undefined);
      expect(`${p.id} changes`, r.changes, []);
      expect(`${p.id} same ticket`, sameData(r.ticket, p.ticket), true);
    }
    const blank = validateTicket(BEACH, tform(BEACH, { status: "est" }), TODAY);
    expect("minimal ticket gains no keys", Object.keys(blank.ticket).sort(), ["coveredByJordanPass", "jod", "label", "status"]);
  });

  /* ---------- /admin history + revert (pure helpers) ---------- */

  test("Admin history: parseUpdateField reads option and ticket fields, anything else is null", (expect) => {
    expect("option cost", parseUpdateField("options[2].cost"), { kind: "option", index: 2, field: "cost" });
    expect("option sourceUrl", parseUpdateField("options[10].sourceUrl"), { kind: "option", index: 10, field: "sourceUrl" });
    expect("ticket jod", parseUpdateField("ticket.jod"), { kind: "ticket", field: "jod" });
    expect("ticket method", parseUpdateField("ticket.method"), { kind: "ticket", field: "method" });
    for (const bad of ["cost", "options[x].cost", "options[2].label", "options[2].cost.x", "ticket.label", "ticket.", "tickets.jod", "", null, undefined, 7])
      expect(`null for ${String(bad)}`, parseUpdateField(bad), null);
  });

  test("Admin history: revertInputs maps fromValue to form inputs, null when it cannot revert", (expect) => {
    const opt = (field, fromValue) => ({ field: `options[0].${field}`, fromValue });
    expect("cost pair", revertInputs(opt("cost", [20, 25])), { costMin: "20", costMax: "25" });
    expect("cost decimal", revertInputs(opt("cost", [0.95, 1.1])), { costMin: "0.95", costMax: "1.1" });
    expect("cost null empties both", revertInputs(opt("cost", null)), { costMin: "", costMax: "" });
    expect("cost malformed", revertInputs(opt("cost", [20])), null);
    expect("cost text", revertInputs(opt("cost", "20-25")), null);
    expect("departs", revertInputs(opt("departs", "06:30")), { departs: "06:30" });
    expect("departs null", revertInputs(opt("departs", null)), { departs: "" });
    expect("status", revertInputs(opt("status", "verified")), { status: "verified" });
    expect("status null is est", revertInputs(opt("status", null)), { status: "est" });
    expect("method null", revertInputs(opt("method", null)), { method: "" });
    expect("date", revertInputs(opt("verifiedOn", "2026-09-24")), { verifiedOn: "2026-09-24" });
    expect("ticket jod", revertInputs({ field: "ticket.jod", fromValue: 3 }), { jod: "3" });
    expect("ticket jod 0", revertInputs({ field: "ticket.jod", fromValue: 0 }), { jod: "0" });
    expect("ticket jod null", revertInputs({ field: "ticket.jod", fromValue: null }), { jod: "" });
    expect("ticket jod text", revertInputs({ field: "ticket.jod", fromValue: "3" }), null);
    expect("ticket source", revertInputs({ field: "ticket.source", fromValue: "mota.gov.jo" }), { source: "mota.gov.jo" });
    expect("old row: no fromValue key", revertInputs({ field: "options[0].cost", from: "20–25" }), null);
    expect("unknown field", revertInputs({ field: "options[0].label", fromValue: "x" }), null);
    expect("no update", revertInputs(null), null);
  });

  test("Admin history: updateWhat names the option and field, or the ticket field", (expect) => {
    const labels = ["Private driver", "JETT bus"];
    expect("option", updateWhat({ field: "options[1].cost" }, labels), "JETT bus · cost");
    expect("option sourceUrl", updateWhat({ field: "options[0].sourceUrl" }, labels), "Private driver · source URL");
    expect("option verifiedOn", updateWhat({ field: "options[0].verifiedOn" }, labels), "Private driver · verified on");
    expect("option gone", updateWhat({ field: "options[5].notes" }, labels), "Option 6 · notes");
    expect("ticket", updateWhat({ field: "ticket.jod" }, labels), "Price (JOD)");
    expect("ticket status", updateWhat({ field: "ticket.status" }, labels), "Status");
    expect("unknown", updateWhat({ field: "weird" }, labels), "weird");
  });

  return results;
}
