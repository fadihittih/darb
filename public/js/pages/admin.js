// Data owners: operators and reserves sign in and update their own schedules and prices. Every change is logged.
import { initPage } from "../ui/nav.js";
import { html, raw, qs, qsa, esc } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { loadModel } from "../data.js";
import { shortName } from "../engine/model.js";
import { METHODS, validateOption, freshness, sameData } from "../admin-validate.js";

initPage();

const FS = "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
const AUTH = "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
const DEBUG = new URLSearchParams(location.search).get("debug") === "1";
// "Today" in Amman as YYYY-MM-DD (en-CA formats dates that way), for freshness and the future-date check.
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const authEl = qs("#auth");
const gateEl = qs("#gate");
const legsEl = qs("#legs");

let names = {};
const placeName = (id) => (names[id] ? shortName(names[id]) : id);

/* ---------- sign-in card ---------- */

function renderSignedOut(error = "") {
  authEl.innerHTML = html`
    <form class="auth-form" id="login" novalidate>
      <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="password">Password</label><input class="input" id="password" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary" type="submit" id="signin">Sign in</button>
    </form>
    <p class="auth-error" id="auth-error" role="alert"${error ? "" : " hidden"}>${error}</p>`;
  authEl.setAttribute("aria-busy", "false");
  qs("#login").addEventListener("submit", onSignIn);
}

function renderSignedIn(email) {
  authEl.innerHTML = html`
    <div class="auth-who"><p>Signed in as <strong>${email}</strong></p><button class="btn btn-secondary btn-sm" type="button" id="signout">Sign out</button></div>`;
  authEl.setAttribute("aria-busy", "false");
  qs("#signout").addEventListener("click", async () => {
    const [{ auth }, { signOut }] = await Promise.all([import("../firebase-init.js"), import(AUTH)]);
    await signOut(auth);
  });
}

const AUTH_ERRORS = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/missing-password": "Enter your password.",
  "auth/configuration-not-found": "Sign-in isn’t switched on for this project yet. Ask the Darb team.",
  "auth/operation-not-allowed": "Sign-in isn’t switched on for this project yet. Ask the Darb team.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "No connection. Check your network and try again."
};

async function onSignIn(ev) {
  ev.preventDefault();
  const email = qs("#email").value.trim();
  const password = qs("#password").value;
  const err = qs("#auth-error");
  const btn = qs("#signin");
  err.hidden = true;
  if (!email || !password) {
    err.textContent = "Enter your email and password.";
    err.hidden = false;
    return;
  }
  btn.disabled = true;
  try {
    const [{ auth }, { signInWithEmailAndPassword }] = await Promise.all([import("../firebase-init.js"), import(AUTH)]);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    err.textContent = AUTH_ERRORS[e.code] || "Couldn’t sign in. Try again.";
    err.hidden = false;
    btn.disabled = false;
  }
}

/* ---------- gate + editor ---------- */

function renderGate(email) {
  gateEl.innerHTML = html`
    <div class="card gate-card"><h2>Your account isn’t a data owner yet.</h2><p class="muted">Ask the Darb team to add ${email}.</p></div>`;
}

const FRESH_MARK = { fresh: "✓", expiring: "!", stale: "✕", future: "✕", est: "" }; // colour is never the only signal

function freshBadge(o) {
  const f = freshness(o, TODAY);
  return html`<span class="fresh fresh-${f.state}">${FRESH_MARK[f.state] ? raw(html`<span aria-hidden="true">${FRESH_MARK[f.state]} </span>`) : ""}${f.text}</span>`;
}

function optionRow(legId, o, i, ro) {
  const dis = ro ? " disabled" : "";
  const k = `data-leg="${esc(legId)}" data-i="${i}"`;
  return html`
    <tr>
      <td class="opt-label">${o.label}${o.operator ? raw(html`<span class="opt-op">${o.operator}</span>`) : ""}</td>
      <td><input class="input opt-num" type="number" min="0" step="any" inputmode="decimal" aria-label="${`${o.label}: cost min (JOD)`}" ${raw(k)} data-f="costMin" value="${Array.isArray(o.cost) ? o.cost[0] : ""}"${raw(dis)}></td>
      <td><input class="input opt-num" type="number" min="0" step="any" inputmode="decimal" aria-label="${`${o.label}: cost max (JOD)`}" ${raw(k)} data-f="costMax" value="${Array.isArray(o.cost) ? o.cost[1] : ""}"${raw(dis)}></td>
      <td><input class="input opt-time" type="text" placeholder="HH:MM" maxlength="5" inputmode="numeric" aria-label="${`${o.label}: departs`}" ${raw(k)} data-f="departs" value="${o.departs || ""}"${raw(dis)}></td>
      <td><select class="select" aria-label="${`${o.label}: status`}" ${raw(k)} data-f="status"${raw(dis)}>
        <option value="verified"${o.status === "verified" ? " selected" : ""}>verified</option>
        <option value="est"${o.status !== "verified" ? " selected" : ""}>est.</option></select></td>
      <td class="opt-on"><input class="input opt-date" type="date" aria-label="${`${o.label}: verified on`}" ${raw(k)} data-f="verifiedOn" value="${o.verifiedOn || ""}"${raw(dis)}>
        <span class="fresh-slot" ${raw(k)} data-fresh>${raw(freshBadge(o))}</span></td>
      <td><input class="input opt-notes" type="text" maxlength="300" aria-label="${`${o.label}: notes`}" ${raw(k)} data-f="notes" value="${o.notes || ""}"${raw(dis)}></td>
      <td><input class="input opt-source" type="text" maxlength="200" aria-label="${`${o.label}: source`}" ${raw(k)} data-f="source" value="${o.source || ""}"${raw(dis)}></td>
      <td><input class="input opt-src" type="url" maxlength="300" placeholder="https://…" aria-label="${`${o.label}: source URL`}" ${raw(k)} data-f="sourceUrl" value="${o.sourceUrl || ""}"${raw(dis)}></td>
      <td><select class="select" aria-label="${`${o.label}: method`}" ${raw(k)} data-f="method"${raw(dis)}>
        <option value=""${o.method ? "" : " selected"}>—</option>
        ${raw(METHODS.map((m) => `<option value="${m}"${o.method === m ? " selected" : ""}>${m}</option>`).join(""))}</select></td>
    </tr>`;
}

const routeName = (leg) => `${placeName(leg.from)} → ${placeName(leg.to)}`;

function legCard(leg, ro) {
  const opts = leg.options || [];
  return html`
    <details class="card leg" data-leg-card="${leg.id}">
      <summary>${routeName(leg)}<span class="leg-meta">· ${leg.publicTransport || "no public transport"}</span></summary>
      <div class="leg-body">
        <div class="table-wrap"><table class="table opt-table">
          <thead><tr><th scope="col">Option</th><th scope="col">Cost min</th><th scope="col">Cost max</th><th scope="col">Departs</th><th scope="col">Status</th><th scope="col">Verified on</th><th scope="col">Notes</th><th scope="col">Source</th><th scope="col">Source URL</th><th scope="col">Method</th></tr></thead>
          <tbody>${opts.map((o, i) => optionRow(leg.id, o, i, ro)).map(raw)}</tbody>
        </table></div>
        <div class="leg-foot">
          <button type="button" class="btn btn-primary btn-sm" data-save="${leg.id}"${ro ? " disabled" : ""}>Save</button>
          <p class="leg-error" role="alert" data-error="${leg.id}" hidden></p>
        </div>
        <p class="leg-warn" role="status" data-warn="${leg.id}" hidden></p>
      </div>
    </details>`;
}

const legCache = new Map();

/* ---------- freshness: per-option badges, header count, sort ---------- */

/** Days left before the soonest verified option of a leg turns stale; Infinity when it has none. */
function soonestLeft(leg) {
  let min = Infinity;
  for (const o of leg.options || []) {
    const f = freshness(o, TODAY);
    if (f.state !== "est") min = Math.min(min, f.left ?? -Infinity); // no date = already stale
  }
  return min;
}

function freshSummary() {
  const n = { expiring: 0, stale: 0, future: 0 };
  for (const leg of legCache.values()) for (const o of leg.options || []) {
    const s = freshness(o, TODAY).state;
    if (s in n) n[s]++;
  }
  const parts = [];
  if (n.expiring) parts.push(`${n.expiring} ${n.expiring === 1 ? "value expires" : "values expire"} in the next 30 days`);
  if (n.stale) parts.push(`${n.stale} stale`);
  if (n.future) parts.push(`${n.future} dated in the future`);
  return parts.length ? parts.join(" · ") : "Every verified value is good for more than 30 days.";
}

function refreshFreshness(leg) {
  (leg.options || []).forEach((o, i) => {
    const slot = qs(`[data-fresh][data-leg="${CSS.escape(leg.id)}"][data-i="${i}"]`, legsEl);
    if (slot) slot.innerHTML = freshBadge(o);
  });
  qs("#fresh-summary", legsEl).textContent = freshSummary();
}

/** Reorder the existing cards (DOM nodes are moved, so unsaved input stays). */
function sortLegs(by) {
  const list = qs("#leg-list", legsEl);
  const legs = [...legCache.values()];
  const byRoute = (a, b) => routeName(a).localeCompare(routeName(b));
  legs.sort(by === "expiry" ? (a, b) => soonestLeft(a) - soonestLeft(b) || byRoute(a, b) : byRoute);
  for (const leg of legs) list.append(qs(`[data-leg-card="${CSS.escape(leg.id)}"]`, list));
}

function renderLegs(legs, { ro, email }) {
  legCache.clear();
  legs.forEach((l) => legCache.set(l.id, l));
  legsEl.innerHTML =
    (ro ? html`<p class="card debug-note">Debug preview — seed legs from /data/legs.json, read-only. Nothing is saved.</p>` : "") +
    html`<div class="legs-bar">
      <p class="fresh-summary" id="fresh-summary"></p>
      <div class="legs-sort"><label for="leg-sort">Sort</label>
        <select class="select" id="leg-sort"><option value="route">Route (A–Z)</option><option value="expiry">Soonest expiry</option></select></div>
    </div>` +
    `<div class="stack" id="leg-list">${legs.map((l) => legCard(l, ro)).join("")}</div>`;
  qs("#fresh-summary", legsEl).textContent = freshSummary();
  sortLegs("route");
  qs("#leg-sort", legsEl).addEventListener("change", (e) => sortLegs(e.target.value));
  if (!ro) for (const b of qsa("[data-save]", legsEl)) b.addEventListener("click", () => saveLeg(b.dataset.save, email, b));
}

const field = (legId, i, f) => qs(`[data-leg="${CSS.escape(legId)}"][data-i="${i}"][data-f="${f}"]`, legsEl);
const FORM_FIELDS = ["costMin", "costMax", "departs", "status", "verifiedOn", "notes", "source", "sourceUrl", "method"];

/** Read one leg's form → { options, changes, warnings } or { error }. The rules live in admin-validate.js. */
function collect(leg) {
  const options = [];
  const changes = [];
  const warnings = [];
  for (let i = 0; i < leg.options.length; i++) {
    const old = leg.options[i];
    if (field(leg.id, i, "costMin").validity.badInput || field(leg.id, i, "costMax").validity.badInput) return { error: `${old.label}: costs must be numbers.` };
    const input = Object.fromEntries(FORM_FIELDS.map((f) => [f, field(leg.id, i, f).value.trim()]));
    const r = validateOption(old, input, TODAY);
    if (r.error) return { error: r.error };
    for (const c of r.changes) changes.push({ ...c, operator: old.operator || "", field: `options[${i}].${c.field}` });
    warnings.push(...r.warnings);
    options.push(r.option);
  }
  return { options, changes, warnings };
}

/* ---------- save with a concurrency guard ---------- */

const CHANGED = "darb/changed-since-open";

/**
 * One transaction: re-read `ref`; if it is missing or guard(liveData) is false, abort with code CHANGED;
 * else update it and add one operatorUpdates doc per log entry (at = server time). All land or none.
 */
async function saveWithLog(ref, guard, update, entries) {
  const [{ db }, { doc, collection, runTransaction, serverTimestamp }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
  await runTransaction(db, async (tx) => {
    const live = await tx.get(ref);
    if (!live.exists() || !guard(live.data())) throw Object.assign(new Error("Changed since it was opened"), { code: CHANGED });
    tx.update(ref, update);
    for (const e of entries) tx.set(doc(collection(db, "operatorUpdates")), { ...e, at: serverTimestamp() });
  });
}

async function saveLeg(legId, email, btn) {
  const leg = legCache.get(legId);
  const errEl = qs(`[data-error="${CSS.escape(legId)}"]`, legsEl);
  const warnEl = qs(`[data-warn="${CSS.escape(legId)}"]`, legsEl);
  errEl.hidden = true;
  warnEl.hidden = true;
  const r = collect(leg);
  if (r.error) {
    errEl.textContent = r.error;
    errEl.hidden = false;
    return;
  }
  if (r.warnings.length) { // shown, never blocking
    warnEl.textContent = `Check: ${r.warnings.join(" ")}`;
    warnEl.hidden = false;
  }
  if (!r.changes.length) {
    toast("No changes to save");
    return;
  }
  btn.disabled = true;
  try {
    const [{ db }, { doc }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
    const opened = leg.options; // the snapshot this form was built from
    const fallbackOp = email.split("@")[1];
    const entries = r.changes.map((c) => ({ operator: c.operator || fallbackOp, legId, field: c.field, from: c.from, to: c.to, fromValue: c.fromValue, toValue: c.toValue, by: email }));
    await saveWithLog(doc(db, "legs", legId), (live) => sameData(live.options, opened), { options: r.options }, entries);
    leg.options = r.options;
    refreshFreshness(leg);
    toast("Saved · shown on the dashboard");
  } catch (e) {
    console.warn("Darb: save failed", e);
    errEl.textContent = e.code === CHANGED ? "This leg changed since you opened it — reload the page to see the latest, then redo your edit."
      : e.code === "permission-denied" ? "Your account isn’t allowed to change this data." : "Couldn’t save. Check your connection and try again.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function loadEditor(email) {
  const [{ db }, { collection, getDocs }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
  const snap = await getDocs(collection(db, "legs"));
  const legs = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => a.id.localeCompare(b.id));
  renderLegs(legs, { ro: false, email });
}

async function onUser(user) {
  legsEl.innerHTML = "";
  gateEl.innerHTML = "";
  if (!user) return renderSignedOut();
  const email = user.email || "";
  renderSignedIn(email);
  try {
    const [{ db }, { doc, getDoc }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
    const admin = await getDoc(doc(db, "admins", email.toLowerCase()));
    if (!admin.exists()) return renderGate(email);
    await loadEditor(email);
  } catch (e) {
    if (e.code === "permission-denied") return renderGate(email);
    console.warn("Darb: admin load failed", e);
    gateEl.innerHTML = html`<div class="card gate-card"><h2>Couldn’t load your data</h2><p class="muted">Check your connection and reload.</p></div>`;
  }
}

/* ---------- boot ---------- */

try { names = (await loadModel()).byId; } catch { /* ids are shown instead of names */ }

if (DEBUG) {
  // Read-only preview of the seed legs so the editor can be checked without a data-owner account. Never writes.
  authEl.innerHTML = html`<p class="muted small" style="margin:0">Debug preview — sign-in is skipped.</p>`;
  authEl.setAttribute("aria-busy", "false");
  const seed = await (await fetch("/data/legs.json")).json();
  renderLegs(seed.legs, { ro: true, email: "" });
} else {
  try {
    const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../firebase-init.js"), import(AUTH)]);
    onAuthStateChanged(auth, onUser);
  } catch (e) {
    console.warn("Darb: auth unavailable", e);
    renderSignedOut("Sign-in isn’t available right now. Reload and try again.");
  }
}
