// Display formatting shared by engine and UI. Money always "JOD", ranges as "est. 35–45 JOD", dates "24 Sep".

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

export const fmtRange = ([a, b]) => (a === b ? `${a} JOD` : `${a}–${b} JOD`);

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
