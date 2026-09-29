// Dev-only: pre-renders the 12 destination answer cards + JSON-LD into public/destinations.html.
// Usage: node scripts/render-destinations.mjs   (no build step at deploy; the output is committed)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fmtCost, fmtDuration } from "../public/js/engine/format.js";
import { esc } from "../public/js/ui/dom.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const places = JSON.parse(readFileSync(join(root, "data/places.json"), "utf8"));
const legs = JSON.parse(readFileSync(join(root, "data/legs.json"), "utf8")).legs;
const SITE = "https://darb-pixelsdev.web.app";

const byId = Object.fromEntries([...places.places, ...(places.airports || [])].map((p) => [p.id, p]));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fullDate = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const airportIds = new Set((places.airports || []).map((a) => a.id));
/** "King Hussein, Aqaba (AQJ)" → "King Hussein Airport (AQJ)" so a question never reads "Aqaba to Aqaba". */
const nameOf = (id) => airportIds.has(id)
  ? `${byId[id].name.split(",")[0].replace(/\s*\(.*\)$/, "")} Airport (${id})`
  : byId[id]?.name.replace(/\s*\(.*\)$/, "") ?? id;

/** Ticket line, e.g. "Petra (1 day): 50 JOD · Jordan Pass ✓ · verified 24 Sep 2026". */
function ticketLine(p) {
  const t = p.ticket;
  const note = t.notes ? ` ${t.notes}` : "";
  if (t.jod == null) return `${t.label}: price not confirmed.${note}`;
  const price = t.jod === 0 ? "free" : `${t.jod} JOD`;
  if (t.status === "verified") {
    return `${t.label}: ${price}${t.coveredByJordanPass ? " · Jordan Pass ✓" : ""} · verified ${fullDate(t.verifiedOn)}.${note}`;
  }
  return `${t.label}: est. ${price}${t.coveredByJordanPass ? " · Jordan Pass may cover it" : ""}.${note}`;
}

/** Answer text for one leg: { text, verified, sourceUrl }. Only verified options carry ✓ + date. */
function legAnswer(leg) {
  const o = leg.options.find((x) => x.recommended) || leg.options[0];
  const c = fmtCost(o);
  const bits = [];
  if (o.departs) bits.push(`departs ${o.departs}`);
  bits.push(`${o.status === "verified" ? "" : "~"}${fmtDuration(o.durationMin)}`);
  bits.push(c.text + (o.costUnit && o.cost ? ` ${o.costUnit}` : ""));
  let text = `${o.label}: ${bits.join(", ")}`;
  if (o.status === "verified") {
    text += ` ✓ verified ${fullDate(o.verifiedOn)}${o.source ? ` (source: ${o.source})` : ""}.`;
  } else text += " (estimate, not verified).";
  if (o.notes) text += ` ${o.notes}`;
  if (leg.publicTransport === "none") {
    const lead = leg.evidence || leg.warning || "There is no scheduled public transport on this route.";
    text = `${lead} Best option: ${text}`;
  } else if (leg.warning) text = `${leg.warning} ${text}`;
  if (leg.timeSensitive) text += ` ${leg.timeSensitive}`;
  const sourceUrl = o.status === "verified" && /^https:\/\//.test(o.sourceUrl || "") ? o.sourceUrl : null;
  return { text, verified: o.status === "verified", sourceUrl };
}

const qa = new Map(); // leg id -> {q, a, verified}
for (const leg of legs) {
  const { text, verified, sourceUrl } = legAnswer(leg);
  qa.set(leg.id, { q: `How do I get from ${nameOf(leg.from)} to ${nameOf(leg.to)} without a car?`, a: text, verified, sourceUrl, from: leg.from, to: leg.to });
}
const legsFor = (id) => [...qa.values()].filter((x) => x.from === id || x.to === id);

/** Evidence link after a verified value (opens the official page in a new tab). */
const srcLink = (url) => ` <a class="dest-src" href="${esc(url)}" target="_blank" rel="noopener">Source ↗<span class="sr-only"> (opens in a new tab)</span></a>`;

const tips = (p) => `Autumn: ${p.climate.autumn[0]}°C day, ${p.climate.autumn[1]}°C night. ${p.packing}`;

const card = (p) => `
<article class="card dest-card" id="${esc(p.id)}">
  <header class="dest-head">
    <h2>${esc(p.name)} <span class="dest-ar" lang="ar" dir="rtl">${esc(p.nameAr)}</span></h2>
    <div class="row">
      ${p.hiddenGem ? '<span class="pill-soft">Hidden gem</span>' : ""}
      <span class="pill info">Plan ${p.minHours} h+</span>
    </div>
  </header>
  <p class="dest-ticket">${esc(ticketLine(p))}${p.ticket.status === "verified" && /^https:\/\//.test(p.ticket.sourceUrl || "") ? srcLink(p.ticket.sourceUrl) : ""}</p>
  <p class="small muted">${esc(tips(p))}</p>
  ${legsFor(p.id).length ? `<div class="dest-qa">
${legsFor(p.id).map((x) => `    <section>
      <h3>${esc(x.q)}</h3>
      <p class="${x.verified ? "ans-verified" : "ans-est"}">${esc(x.a)}${x.sourceUrl ? srcLink(x.sourceUrl) : ""}</p>
    </section>`).join("\n")}
  </div>` : '<p class="small muted">No verified route yet — Darb estimates transport from road distance.</p>'}
  <a class="btn btn-secondary dest-cta" href="/plan.html">Check your whole plan →</a>
</article>`;

const jsonld = {
  "@context": "https://schema.org",
  "@graph": [
    ...places.places.map((p) => ({
      "@type": "TouristAttraction",
      "@id": `${SITE}/destinations#${p.id}`,
      name: p.name,
      alternateName: p.nameAr,
      url: `${SITE}/destinations#${p.id}`,
      geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
      description: `${p.name}, Jordan. ${ticketLine(p)}. Allow ${p.minHours} hours or more. ${tips(p)}`,
      isAccessibleForFree: p.ticket.jod === 0 && p.ticket.status === "verified" ? true : undefined,
    })),
    {
      "@type": "FAQPage",
      mainEntity: [...qa.values()].map((x) => ({
        "@type": "Question",
        name: x.q,
        acceptedAnswer: { "@type": "Answer", text: x.a.replace(/ ✓/g, "") }
      }))
    }
  ]
};

const cardsBlock = `<!-- cards:start -->
<section id="cards" class="dest-grid">${places.places.map(card).join("\n")}
</section>
<!-- cards:end -->`;
const ldBlock = `<!-- jsonld:start -->
<script type="application/ld+json">
${JSON.stringify(jsonld, null, 2).replace(/</g, "\\u003c")}
</script>
<!-- jsonld:end -->`;

const file = join(root, "destinations.html");
let out = readFileSync(file, "utf8");
const swap = (s, a, b, block) => {
  const i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`markers ${a} missing in destinations.html`);
  return s.slice(0, i) + block + s.slice(j + b.length);
};
out = swap(out, "<!-- cards:start -->", "<!-- cards:end -->", cardsBlock);
out = swap(out, "<!-- jsonld:start -->", "<!-- jsonld:end -->", ldBlock);
writeFileSync(file, out);
console.log(`Rendered ${places.places.length} cards, ${qa.size} Q/A into destinations.html`);
