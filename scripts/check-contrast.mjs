// Dev-only: WCAG contrast of text tokens on the backgrounds they sit on. Reads public/css/tokens.css.
// Usage: node scripts/check-contrast.mjs   (exit 1 when any pair is below 4.5:1)
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/css/tokens.css", import.meta.url), "utf8");
const T = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const lum = (hex) => {
  const c = hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const PAIRS = [
  ["amber-text", "sand"], ["amber-text", "white"], ["amber-text", "amber-soft"], ["amber-text", "rose-soft"],
  ["green-text", "green-soft"], ["green-text", "sand"], ["green-text", "white"],
  ["rose-text", "rose-soft"], ["rose-text", "sand"], ["rose-text", "white"],
  ["red-text", "rose-soft"], ["red-text", "white"],
  ["muted", "sand"], ["muted", "white"], ["muted", "sand-2"]
];
let bad = 0;
for (const [fg, bg] of PAIRS) {
  if (!T[fg] || !T[bg]) { console.log(`MISSING --${fg} or --${bg}`); bad++; continue; }
  const r = ratio(T[fg], T[bg]);
  if (r < 4.5) bad++;
  console.log(`${r >= 4.5 ? "PASS" : "FAIL"} --${fg} on --${bg}: ${r.toFixed(2)}:1`);
}
process.exit(bad ? 1 : 0);
