// Status pills: color is never the only signal — every pill has a glyph and a word.

const PILLS = {
  ok: { glyph: "✓", text: "OK" },
  risky: { glyph: "!", text: "Risky" },
  nf: { glyph: "✕", text: "Not feasible" },
  info: { glyph: "i", text: "Note" }
};

/** <span class="pill ok|risky|nf|info"> for a day/issue status (unknown → info). */
export function statusPill(status) {
  const key = PILLS[status] ? status : "info";
  const p = PILLS[key];
  return `<span class="pill ${key}"><span class="pill-glyph" aria-hidden="true">${p.glyph}</span>${p.text}</span>`;
}

/** "✕ 1 not feasible · ! 1 risky · ✓ 3 OK" — zero counts are left out. counts = { ok, risky, nf }. */
export function countsLine(counts = {}) {
  const parts = [
    ["nf", "✕", "not feasible"],
    ["risky", "!", "risky"],
    ["ok", "✓", "OK"]
  ]
    .filter(([k]) => Number(counts[k]) > 0)
    .map(([k, g, word]) => `<span class="count ${k}"><span aria-hidden="true">${g}</span> ${Number(counts[k])} ${word}</span>`);
  return `<span class="counts">${parts.join('<span class="count-sep" aria-hidden="true"> · </span>')}</span>`;
}
