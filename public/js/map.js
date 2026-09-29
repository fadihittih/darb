// SVG route map (03 Reality Check): project the trip's stops into a box, lines coloured by each day's status.
// Pure: returns an SVG string, no DOM. Colours come from tokens.css variables.
import { dayRoute, airportOf } from "./engine/rules.js";
import { shortName } from "./engine/model.js";
import { esc } from "./ui/dom.js";

const W = 320;
const H = 360;
const PAD = 44;          // room for labels around the outermost dots
const LEGEND_H = 34;
const COLOR = { ok: "var(--green)", risky: "var(--amber)", nf: "var(--red)" };
const DASH = { ok: "", risky: "6 5", nf: "3 5" };
const DRAW_ORDER = { ok: 0, risky: 1, nf: 2 }; // worst on top
const CHAR_W = 6.3;      // approx. width of a 11px label character
const LABEL_H = 13;

/** Equirectangular projection with longitude scaled by cos(mean latitude) — fine at Jordan's size. */
function projector(points) {
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p.lng * k);
  const ys = points.map((p) => p.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = Math.max(maxX - minX, 0.05);
  const spanY = Math.max(maxY - minY, 0.05);
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  return (p) => ({
    x: +(offX + (p.lng * k - minX) * scale).toFixed(1),
    y: +(offY + (maxY - p.lat) * scale).toFixed(1)
  });
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Place each label right / left / above / below its dot, avoiding other labels and dots where possible. */
function placeLabels(nodes) {
  const boxes = nodes.map((n) => ({ x: n.x - 5, y: n.y - 5, w: 10, h: 10 })); // dots
  return nodes.map((n) => {
    const w = n.label.length * CHAR_W;
    const candidates = [
      { x: n.x + 9, y: n.y + 4, anchor: "start", box: { x: n.x + 8, y: n.y - LABEL_H / 2, w, h: LABEL_H } },
      { x: n.x - 9, y: n.y + 4, anchor: "end", box: { x: n.x - 8 - w, y: n.y - LABEL_H / 2, w, h: LABEL_H } },
      { x: n.x, y: n.y - 10, anchor: "middle", box: { x: n.x - w / 2, y: n.y - 10 - LABEL_H + 3, w, h: LABEL_H } },
      { x: n.x, y: n.y + 19, anchor: "middle", box: { x: n.x - w / 2, y: n.y + 8, w, h: LABEL_H } }
    ];
    const inside = (b) => b.x >= 4 && b.x + b.w <= W - 4 && b.y >= 4 && b.y + b.h <= H - 4;
    const free = (c) => !boxes.some((b) => overlaps(b, c.box));
    const pick = candidates.find((c) => inside(c.box) && free(c)) || candidates.find((c) => inside(c.box)) || candidates[0];
    boxes.push(pick.box);
    return { ...n, lx: pick.x, ly: pick.y, anchor: pick.anchor };
  });
}

/**
 * routeMap(days, settings, model, statuses) → SVG string.
 * days = trip.days, statuses = ["ok"|"risky"|"nf", …] per day (same order).
 */
export function routeMap(days, settings, model, statuses = []) {
  const ap = airportOf(settings, model);
  const segments = []; // { from, to, status }
  const order = [];    // stop ids in visiting order (unique)
  const add = (id) => { if (model.byId[id] && !order.includes(id)) order.push(id); };
  add(ap);
  days.forEach((d, i) => {
    const route = dayRoute(days, i, settings, model);
    route.stops.forEach(add);
    const status = COLOR[statuses[i]] ? statuses[i] : "ok";
    route.legs.forEach((l) => segments.push({ from: l.from, to: l.to, status }));
  });

  const places = order.map((id) => model.byId[id]).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  if (!places.length) return "";
  const project = projector(places);
  const airports = new Set(model.airports.map((a) => a.id));
  const nodes = placeLabels(places.map((p) => ({
    id: p.id, ...project(p), airport: airports.has(p.id), label: airports.has(p.id) ? p.id : shortName(p)
  })));
  const at = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const lines = segments
    .filter((s) => at[s.from] && at[s.to])
    .sort((a, b) => DRAW_ORDER[a.status] - DRAW_ORDER[b.status])
    .map((s) => {
      const a = at[s.from];
      const b = at[s.to];
      const dash = DASH[s.status] ? ` stroke-dasharray="${DASH[s.status]}"` : "";
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" style="stroke:${COLOR[s.status]}" stroke-width="2.5" stroke-linecap="round"${dash}/>`;
    }).join("");

  const worstAt = {};
  for (const s of segments) {
    for (const id of [s.from, s.to]) {
      if (DRAW_ORDER[s.status] > (DRAW_ORDER[worstAt[id]] ?? -1)) worstAt[id] = s.status;
    }
  }

  const dots = nodes.map((n) => {
    const ring = worstAt[n.id] === "nf" ? "var(--red)" : "var(--ink)";
    const shape = n.airport
      ? `<rect x="${n.x - 4.5}" y="${n.y - 4.5}" width="9" height="9" rx="2" style="fill:var(--white);stroke:var(--ink)" stroke-width="2"/>`
      : `<circle cx="${n.x}" cy="${n.y}" r="5" style="fill:${ring};stroke:var(--white)" stroke-width="2"/>`;
    return `${shape}<text x="${n.lx}" y="${n.ly}" text-anchor="${n.anchor}" font-size="11" font-weight="600" style="fill:var(--ink)">${esc(n.label)}</text>`;
  }).join("");

  const legendItems = [["ok", "Works"], ["risky", "Risky"], ["nf", "Not feasible"]];
  let lx = 4;
  const legend = legendItems.map(([k, label]) => {
    const dash = DASH[k] ? ` stroke-dasharray="${DASH[k]}"` : "";
    const g = `<line x1="${lx}" y1="${H + 20}" x2="${lx + 18}" y2="${H + 20}" style="stroke:${COLOR[k]}" stroke-width="2.5"${dash}/>` +
      `<circle cx="${lx + 9}" cy="${H + 20}" r="4" style="fill:${COLOR[k]}"/>` +
      `<text x="${lx + 24}" y="${H + 24}" font-size="11" style="fill:var(--muted)">${label}</text>`;
    lx += 24 + label.length * CHAR_W + 18;
    return g;
  }).join("");

  const route = order.map((id) => (airports.has(id) ? id : shortName(model.byId[id]))).join(", ");
  return `<svg class="route-map" viewBox="0 0 ${W} ${H + LEGEND_H}" role="img" aria-labelledby="route-map-title" xmlns="http://www.w3.org/2000/svg">` +
    `<title id="route-map-title">${esc(`Route map: ${route}. Green solid lines work, amber dashed are risky, red dotted are not feasible.`)}</title>` +
    `<rect x="0" y="0" width="${W}" height="${H}" rx="14" style="fill:var(--sand-2)"/>` +
    lines + dots + legend +
    `</svg>`;
}
