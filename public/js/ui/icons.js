// Monochrome inline SVG icons (24×24, stroke = currentColor). No emoji anywhere in Darb.
import { esc } from "./dom.js";

const P = {
  bus: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14M8 20v-3M16 20v-3"/><circle cx="8.5" cy="13.5" r=".9"/><circle cx="15.5" cy="13.5" r=".9"/><path d="M8 6.5h8"/>',
  car: '<path d="M4 16v-3.5l1.7-4.3A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.9 1.2L20 12.5V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 12.5h16"/><circle cx="7.5" cy="14.5" r=".9"/><circle cx="16.5" cy="14.5" r=".9"/><path d="M6 17v2M18 17v2"/>',
  taxi: '<path d="M4 16v-3.5l1.7-4.3A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.9 1.2L20 12.5V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 12.5h16M10 4h4l.6 3H9.4z"/><circle cx="7.5" cy="14.5" r=".9"/><circle cx="16.5" cy="14.5" r=".9"/>',
  driver: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M3.8 10.5c5 1.2 11.4 1.2 16.4 0M10.3 13.6 8 20M13.7 13.6 16 20"/>',
  transfer: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  minibus: '<path d="M3 16V8a2 2 0 0 1 2-2h10l5 5v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 11h17M9 6v5M14 6v5"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>',
  plane: '<path d="M10.5 3.8c0-1 .7-1.8 1.5-1.8s1.5.8 1.5 1.8V9l7 4v2l-7-2v5l2 1.5V21l-3.5-1-3.5 1v-1.5l2-1.5v-5l-7 2v-2l7-4z"/>',
  landmark: '<path d="M3 21h18M4 10h16M12 3l8 4.5H4z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8M4.5 18h15"/>',
  mountain: '<path d="M2.5 20 9 8.5l3.5 6 2.5-4 6.5 9.5z"/><path d="M7.2 11.8 9 13l1.7-1.3"/><circle cx="17.5" cy="5.5" r="1.8"/>',
  tent: '<path d="M12 3 3 20h18z"/><path d="M9 20l3-6 3 6M2 20h20"/>',
  waves: '<path d="M2.5 7c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5M2.5 12.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5M2.5 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  warn: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 0 0-5.7-5.7L11.5 6.8"/><path d="M14 10a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 0 0 5.7 5.7l1.6-1.6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.7 16a5 5 0 0 1 6.6 0"/><circle cx="12" cy="19" r=".9"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  download: '<path d="M12 3.5v12M7 11l5 5 5-5M4 20h16"/>',
  "arrow-right": '<path d="M4 12h16M14 6l6 6-6 6"/>',
  "arrow-left": '<path d="M20 12H4M10 6l-6 6 6 6"/>',
  map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="2.8"/><path d="M3 7v4c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8V7"/><path d="M9 13.8v3.4c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8v-4c0-1.2-1.7-2.2-4-2.6M21 13.2c0 1.5-2.7 2.8-6 2.8"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.3 2.3 4.2-4.3"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>'
};

/** Inline SVG string for a named icon (unknown names render the pin). Decorative: aria-hidden. */
export function icon(name, cls = "") {
  const body = P[name] || P.pin;
  return `<svg class="icon${cls ? " " + esc(cls) : ""}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Icon name for a transport option mode (legs.json modes). */
export function modeIcon(mode) {
  switch (mode) {
    case "bus": case "minibus": case "jett": return "bus";
    case "car": case "own-car": return "car";
    case "taxi": case "driver": case "transfer": return "taxi";
    case "plane": return "plane";
    default: return "pin";
  }
}

const PLACE_ICONS = {
  petra: "landmark", jerash: "landmark", amman: "landmark", madaba: "landmark", kerak: "landmark",
  "umm-qais": "landmark", ajloun: "landmark", "as-salt": "landmark",
  "wadi-rum": "tent", "dead-sea": "waves", aqaba: "waves", dana: "mountain",
  AMM: "plane", AQJ: "plane"
};

/** Icon name for a place id (airports get the plane). */
export const placeIcon = (placeId) => PLACE_ICONS[placeId] || "pin";
