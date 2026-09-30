// Display formatting shared by engine and UI. Money always "JOD", ranges as "est. 35–45 JOD", dates "24 Sep".

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));
export const fmtRange = ([a, b]) => (a === b ? `${fmtNum(a)} JOD` : `${fmtNum(a)}–${fmtNum(b)} JOD`);

const AMMAN_OFFSET_MS = 3 * 3600e3; // Jordan is UTC+3 all year (no DST since 2022)

/** true when startDate + days is before today in Amman, false when not, null without a start date. */
export function tripEnded(startDate, days, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate || "");
  if (!m) return null;
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Math.max(1, days));
  const t = new Date(new Date(today).getTime() + AMMAN_OFFSET_MS); // Amman wall clock, read with UTC getters
  return end <= Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/** Cost text of a transport option: { text, verified }. */
export function fmtCost(option) {
  if (!option) return { text: "", verified: false };
  if (option.mode === "own-car") return { text: "Fuel only", verified: false };
  if (!option.cost) return { text: option.costText || "Price on request", verified: false };
  const verified = option.status === "verified";
  return { text: (verified ? "" : "est. ") + fmtRange(option.cost), verified };
}

export function fmtDuration(min) {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const monthName = (m) => ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1];
