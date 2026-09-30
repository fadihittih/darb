// Pure helpers for scripts/seed.mjs (no network, no fs): Firestore REST value encoding, diffing live docs against the
// seed JSON, reading owner edits from operatorUpdates, and merging live values back into the JSON files.

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

export function fromValue(v) {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  throw new Error(`unsupported Firestore value: ${Object.keys(v).join(",")}`);
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Every leaf that differs between the seed JSON and the live doc. Key order never counts.
export function diffDoc(json, live, path = "") {
  if (isObj(json) && isObj(live)) {
    const out = [];
    for (const k of new Set([...Object.keys(json), ...Object.keys(live)])) {
      out.push(...diffDoc(json[k], live[k], path ? `${path}.${k}` : k));
    }
    return out;
  }
  if (Array.isArray(json) && Array.isArray(live)) {
    const out = [];
    for (let i = 0; i < Math.max(json.length, live.length); i++) out.push(...diffDoc(json[i], live[i], `${path}[${i}]`));
    return out;
  }
  return json === live ? [] : [{ path, json, live }];
}

export const topField = (path) => path.match(/^[^.[]+/)[0];

// operatorUpdates docs -> Map<"legs/<id>" | "places/<id>", Set<top-level field>>
export function ownerFields(updates) {
  const m = new Map();
  for (const u of updates) {
    const doc = u.legId ? `legs/${u.legId}` : u.placeId ? `places/${u.placeId}` : null;
    if (!doc || !u.field) continue;
    if (!m.has(doc)) m.set(doc, new Set());
    m.get(doc).add(topField(u.field));
  }
  return m;
}

// The diffs that touch a field an owner edited.
export const ownerConflicts = (diffs, owned) => (owned ? diffs.filter((d) => owned.has(topField(d.path))) : []);

// Live values, written with the JSON doc's key order first and any new keys after (recursively).
export function mergeInto(json, live) {
  if (isObj(json) && isObj(live)) {
    const out = {};
    for (const k of Object.keys(json)) if (k in live) out[k] = mergeInto(json[k], live[k]);
    for (const k of Object.keys(live)) if (!(k in out)) out[k] = live[k];
    return out;
  }
  if (Array.isArray(json) && Array.isArray(live)) return live.map((x, i) => mergeInto(json[i], x));
  return live;
}

// Inline JSON in the style of the hand-written data files: `{ "a": 1, "b": [1, 2] }`.
export function compact(v) {
  if (Array.isArray(v)) return v.length ? `[${v.map(compact).join(", ")}]` : "[]";
  if (isObj(v)) {
    const e = Object.entries(v);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
}

// Rewrite the array under `key` in a JSON text, touching only objects whose content changed (matched by id) and
// appending objects that are new. Everything else stays byte-identical. `fmt(obj)` returns an object's text with
// continuation lines already indented for its position in the file.
export function spliceArray(text, key, byId, fmt) {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
  if (!m) throw new Error(`no "${key}" array found`);
  const objs = [];
  let i = m.index + m[0].length, depth = 0, start = -1, inStr = false, close = -1;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") { if (depth === 0 && c === "{") start = i; depth++; }
    else if (c === "}" || c === "]") {
      if (depth === 0) { close = i; break; }
      depth--;
      if (depth === 0 && c === "}") objs.push([start, i + 1]);
    }
  }
  if (close < 0) throw new Error(`unterminated "${key}" array`);
  let out = "", pos = 0, last = m.index + m[0].length;
  const seen = new Set();
  for (const [s, e] of objs) {
    const cur = JSON.parse(text.slice(s, e));
    seen.add(cur.id);
    const next = byId.get(cur.id);
    if (next && diffDoc(cur, next).length) { out += text.slice(pos, s) + fmt(next); pos = e; }
    last = e;
  }
  out += text.slice(pos, last);
  for (const [id, obj] of byId) if (!seen.has(id)) out += `,\n    ${fmt(obj)}`;
  return out + text.slice(last);
}
