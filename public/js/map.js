// SVG route map (03 Reality Check): project the trip's stops into a box, lines coloured by each day's status.
// Pure: returns an SVG string, no DOM. Colours come from tokens.css variables.
import { dayRoute, airportOf } from "./engine/rules.js";
import { shortName } from "./engine/model.js";
import { esc } from "./ui/dom.js";

const W = 320;
const H = 360;
const PAD = 14;          // padding around Jordan's outline
const LEGEND_H = 34;
const COLOR = { ok: "var(--green)", risky: "var(--amber)", nf: "var(--red)" };
const DASH = { ok: "", risky: "6 5", nf: "3 5" };
const DRAW_ORDER = { ok: 0, risky: 1, nf: 2 }; // worst on top
const CHAR_W = 6.3;      // approx. width of a 11px label character
const LABEL_H = 13;

/**
 * Jordan's border as [lng, lat] pairs, clockwise from the Yarmouk / Jordan River confluence.
 * Simplified outline drawn by hand from public border coordinates (±10–20 km): Syria border,
 * the Iraq tripoints, the Saudi border with "Winston's Hiccup", the Gulf of Aqaba,
 * Wadi Araba, the Dead Sea mid-line and the Jordan River. Context only, not a survey.
 */
export const JORDAN_OUTLINE = [
  [35.57, 32.64], [35.66, 32.70], [35.80, 32.72], [35.95, 32.66], [36.10, 32.55], [36.42, 32.36],
  [37.20, 32.50], [38.00, 32.95], [38.79, 33.37],   // Syria border → Syria–Iraq tripoint
  [39.30, 32.23],                                     // Iraq border → Saudi tripoint
  [38.00, 31.85], [37.00, 31.50],                     // Saudi border, Winston's Hiccup
  [38.00, 30.50], [37.67, 30.33], [37.50, 30.00], [36.75, 29.87], [36.50, 29.50], [36.07, 29.19],
  [34.96, 29.36], [34.98, 29.55],                     // Gulf of Aqaba
  [35.05, 29.90], [35.18, 30.50], [35.30, 30.90], [35.42, 31.15], // Wadi Araba
  [35.48, 31.45], [35.53, 31.75],                     // Dead Sea mid-line
  [35.55, 31.95], [35.55, 32.25], [35.57, 32.50]      // Jordan River
];

/**
 * Equirectangular projection with longitude scaled by cos(mean latitude), fine at Jordan's size.
 * The frame is Jordan's outline (plus any stop outside it), so the route always sits in context.
 */
function projector(points) {
  const all = [...JORDAN_OUTLINE.map(([lng, lat]) => ({ lng, lat })), ...points];
  const lats = all.map((p) => p.lat);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = all.map((p) => p.lng * k);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...lats), Math.max(...lats)];
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  return (p) => ({
    x: +(offX + (p.lng * k - minX) * scale).toFixed(1),
    y: +(offY + (maxY - p.lat) * scale).toFixed(1)
  });
}

/** SVG path of the outline in the same projection. */
function outlinePath(project) {
  return JORDAN_OUTLINE.map(([lng, lat], i) => {
    const { x, y } = project({ lng, lat });
    return `${i ? "L" : "M"}${x} ${y}`;
  }).join("") + "Z";
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Place each label right / left / above / below / diagonal to its dot, avoiding other labels and dots
 * where possible (Amman, AMM, Madaba and the Dead Sea sit within ~20 px of each other on the full-country frame).
 */
function placeLabels(nodes) {
  const boxes = nodes.map((n) => ({ x: n.x - 5, y: n.y - 5, w: 10, h: 10 })); // dots
  return nodes.map((n) => {
    const w = n.label.length * CHAR_W;
    const right = { x: n.x + 9, y: n.y + 4, anchor: "start", box: { x: n.x + 8, y: n.y - LABEL_H / 2, w, h: LABEL_H } };
    const left = { x: n.x - 9, y: n.y + 4, anchor: "end", box: { x: n.x - 8 - w, y: n.y - LABEL_H / 2, w, h: LABEL_H } };
    const candidates = [
      ...(n.x > W * 0.75 ? [left, right] : [right, left]),
      { x: n.x, y: n.y - 10, anchor: "middle", box: { x: n.x - w / 2, y: n.y - 10 - LABEL_H + 3, w, h: LABEL_H } },
      { x: n.x, y: n.y + 19, anchor: "middle", box: { x: n.x - w / 2, y: n.y + 8, w, h: LABEL_H } },
      ...[12, -12].flatMap((d) => [
        { x: n.x + 7, y: n.y + 4 + d, anchor: "start", box: { x: n.x + 6, y: n.y - LABEL_H / 2 + d, w, h: LABEL_H } },
        { x: n.x - 7, y: n.y + 4 + d, anchor: "end", box: { x: n.x - 6 - w, y: n.y - LABEL_H / 2 + d, w, h: LABEL_H } }
      ])
    ];
    const inside = (b) => b.x >= 4 && b.x + b.w <= W - 4 && b.y >= 4 && b.y + b.h <= H - 4;
    const free = (c) => !boxes.some((b) => overlaps(b, c.box));
    const pick = candidates.find((c) => inside(c.box) && free(c)) || candidates.find((c) => inside(c.box)) || candidates[0];
    // Clamp so no label ever leaves the map box (long names near an edge).
    const dx = Math.max(4 - pick.box.x, 0) - Math.max(pick.box.x + pick.box.w - (W - 4), 0);
    const dy = Math.max(4 - pick.box.y, 0) - Math.max(pick.box.y + pick.box.h - (H - 4), 0);
    const box = { ...pick.box, x: pick.box.x + dx, y: pick.box.y + dy };
    boxes.push(box);
    return { ...n, lx: +(pick.x + dx).toFixed(1), ly: +(pick.y + dy).toFixed(1), anchor: pick.anchor };
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
    `<title id="route-map-title">${esc(`Route map of Jordan: ${route}. Green solid lines work, amber dashed are risky, red dotted are not feasible.`)}</title>` +
    `<rect x="0" y="0" width="${W}" height="${H}" rx="14" style="fill:var(--sand)"/>` +
    `<path class="route-map-jordan" d="${outlinePath(project)}" style="fill:var(--sand-2);stroke:var(--line);stroke-linejoin:round" stroke-width="1.2"/>` +
    lines + dots + legend +
    `</svg>`;
}

/** Most stops a key-less Google Maps directions embed is given (origin + 9 destinations). */
export const GOOGLE_MAX_STOPS = 10;

/**
 * googleDirectionsUrl([{lat, lng}, …]) → key-less Google Maps embed URL with driving directions
 * through the points in order ("saddr=A&daddr=B to:C to:D"). Coordinates are rounded to 4 decimals (~10 m),
 * consecutive duplicates are dropped, and more than 10 stops become the first 9 plus the last.
 * Returns "" when fewer than 2 distinct points are left.
 */
export function googleDirectionsUrl(points) {
  const coords = [];
  for (const p of points || []) {
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const c = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (coords.at(-1) !== c) coords.push(c);
  }
  if (coords.length < 2) return "";
  const stops = coords.length > GOOGLE_MAX_STOPS ? [...coords.slice(0, GOOGLE_MAX_STOPS - 1), coords.at(-1)] : coords;
  const [from, ...to] = stops;
  return `https://maps.google.com/maps?saddr=${encodeURIComponent(from)}&daddr=${encodeURIComponent(to.join(" to:"))}&output=embed`;
}
