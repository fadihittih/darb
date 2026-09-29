// Tiny DOM helpers shared by every page. No framework: build HTML strings safely, then insert them.

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** HTML-escape any value (null/undefined → ""). */
export const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]));

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Mark a trusted HTML string so html`` inserts it unescaped. */
export const raw = (s) => ({ __raw: String(s ?? "") });

const part = (v) => {
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.map(part).join("");
  if (typeof v === "object" && "__raw" in v) return v.__raw;
  return esc(v);
};

/**
 * Score count-up (text only, 600 ms ease-out). The final number is rendered first and stays in
 * aria-label / the surrounding text; with prefers-reduced-motion: reduce nothing moves.
 */
export function countUp(el, ms = 600) {
  const to = Number(el?.textContent);
  if (!el || !Number.isFinite(to) || to <= 0) return;
  if (!matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = String(Math.round(to * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = "0";
  requestAnimationFrame(step);
}

/**
 * Tagged template: interpolated values are escaped unless wrapped with raw(x).
 * Arrays are joined (each item escaped or raw); null/undefined/false render as "".
 * Returns a plain string.
 */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return out;
}
