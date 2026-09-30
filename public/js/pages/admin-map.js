// /admin detail header: a small Jordan outline with a leg's two places joined by a line, or one site's pin.
// Same projection as map.js (equirectangular, longitude scaled by cos(mean latitude)); decorative, aria-hidden.
import { JORDAN_OUTLINE } from "../map.js";

const W = 132;
const H = 150;
const PAD = 8;

function projector() {
  const lats = JORDAN_OUTLINE.map(([, lat]) => lat);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = JORDAN_OUTLINE.map(([lng]) => lng * k);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...lats), Math.max(...lats)];
  const scale = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY));
  const offX = (W - (maxX - minX) * scale) / 2;
  const offY = (H - (maxY - minY) * scale) / 2;
  return (lng, lat) => [+(offX + (lng * k - minX) * scale).toFixed(1), +(offY + (maxY - lat) * scale).toFixed(1)];
}

const project = projector();
const OUTLINE = JORDAN_OUTLINE.map(([lng, lat], i) => `${i ? "L" : "M"}${project(lng, lat).join(" ")}`).join("") + "Z";
const ok = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);

/** SVG string: Jordan plus 1–2 places ({lat, lng}); places without coordinates are left out. */
export function miniMap(places) {
  const pts = places.filter(ok).map((p) => project(p.lng, p.lat));
  const line = pts.length === 2 ? `<path class="mini-line" d="M${pts[0].join(" ")}L${pts[1].join(" ")}"/>` : "";
  const dots = pts.map(([x, y], i) => `<circle class="mini-dot${i ? " mini-dot-to" : ""}" cx="${x}" cy="${y}" r="4.5"/>`).join("");
  return `<svg class="mini-map" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">` +
    `<path class="mini-jordan" d="${OUTLINE}"/>${line}${dots}</svg>`;
}
