// Jordan Pass value calculator (§4.5). Pure.

/**
 * days: [{ placeIds }]. Returns
 * { tier, petraDays, nights, visaWaived, items:[{label, jod}], separate, passCost, savings, paysOff, smallFees:[label] }
 * Only verified ticket prices enter the "bought separately" sum; est / unknown ones are listed as small fees.
 */
export function passValue(days, model) {
  const P = model.pass;
  const nights = Math.max(0, days.length - 1);
  const petraDays = Math.min(3, days.filter((d) => d.placeIds.includes("petra")).length);
  const tier = P.tiers.find((t) => t.petraDays === Math.max(1, petraDays)) || P.tiers[0];
  const visited = [...new Set(days.flatMap((d) => d.placeIds))];

  const items = [{ label: "Visa on arrival", jod: P.visaJod }];
  const smallFees = [];
  for (const id of visited) {
    const p = model.byId[id];
    const t = p.ticket;
    if (!t || !t.coveredByJordanPass) continue;
    if (id === "petra") {
      items.push({ label: `Petra (${petraDays} day${petraDays > 1 ? "s" : ""})`, jod: P.petraSeparateJod[String(petraDays)] });
    } else if (t.status === "verified" && typeof t.jod === "number") {
      items.push({ label: t.label, jod: t.jod });
    } else {
      smallFees.push(t.label);
    }
  }
  const separate = items.reduce((s, i) => s + i.jod, 0);
  const visaWaived = nights >= P.minNightsForVisaWaiver;
  const passCost = tier.jod + (visaWaived ? 0 : P.visaJod);
  const savings = separate - passCost;
  return { tier, petraDays, nights, visaWaived, items, separate, passCost, savings, paysOff: savings > 0, smallFees };
}
