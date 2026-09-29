// Data owners: operators and reserves sign in and update their own schedules and prices. Every change is logged.
import { initPage } from "../ui/nav.js";
import { html, raw, qs, qsa, esc } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { loadModel } from "../data.js";
import { shortName } from "../engine/model.js";

initPage();

const FS = "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
const AUTH = "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
const DEBUG = new URLSearchParams(location.search).get("debug") === "1";

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

const timeOk = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const costText = (c) => (Array.isArray(c) ? `${c[0]}–${c[1]}` : "");

function optionRow(legId, o, i, ro) {
  const dis = ro ? " disabled" : "";
  const k = `data-leg="${esc(legId)}" data-i="${i}"`;
  return html`
    <tr>
      <td class="opt-label">${o.label}${o.operator ? raw(html`<span class="opt-op">${o.operator}</span>`) : ""}</td>
      <td><input class="input opt-num" type="number" min="0" step="0.5" inputmode="decimal" aria-label="${`${o.label}: cost min (JOD)`}" ${raw(k)} data-f="costMin" value="${Array.isArray(o.cost) ? o.cost[0] : ""}"${raw(dis)}></td>
      <td><input class="input opt-num" type="number" min="0" step="0.5" inputmode="decimal" aria-label="${`${o.label}: cost max (JOD)`}" ${raw(k)} data-f="costMax" value="${Array.isArray(o.cost) ? o.cost[1] : ""}"${raw(dis)}></td>
      <td><input class="input opt-time" type="text" placeholder="HH:MM" maxlength="5" inputmode="numeric" aria-label="${`${o.label}: departs`}" ${raw(k)} data-f="departs" value="${o.departs || ""}"${raw(dis)}></td>
      <td><select class="select" aria-label="${`${o.label}: status`}" ${raw(k)} data-f="status"${raw(dis)}>
        <option value="verified"${o.status === "verified" ? " selected" : ""}>verified</option>
        <option value="est"${o.status !== "verified" ? " selected" : ""}>est.</option></select></td>
      <td><input class="input opt-date" type="date" aria-label="${`${o.label}: verified on`}" ${raw(k)} data-f="verifiedOn" value="${o.verifiedOn || ""}"${raw(dis)}></td>
      <td><input class="input opt-notes" type="text" maxlength="300" aria-label="${`${o.label}: notes`}" ${raw(k)} data-f="notes" value="${o.notes || ""}"${raw(dis)}></td>
      <td><input class="input opt-src" type="url" maxlength="300" placeholder="https://…" aria-label="${`${o.label}: source URL`}" ${raw(k)} data-f="sourceUrl" value="${o.sourceUrl || ""}"${raw(dis)}></td>
    </tr>`;
}

function legCard(leg, ro) {
  const opts = leg.options || [];
  return html`
    <details class="card leg" data-leg-card="${leg.id}">
      <summary>${placeName(leg.from)} → ${placeName(leg.to)}<span class="leg-meta">· ${leg.publicTransport || "no public transport"}</span></summary>
      <div class="leg-body">
        <div class="table-wrap"><table class="table opt-table">
          <thead><tr><th scope="col">Option</th><th scope="col">Cost min</th><th scope="col">Cost max</th><th scope="col">Departs</th><th scope="col">Status</th><th scope="col">Verified on</th><th scope="col">Notes</th><th scope="col">Source URL</th></tr></thead>
          <tbody>${opts.map((o, i) => optionRow(leg.id, o, i, ro)).map(raw)}</tbody>
        </table></div>
        <div class="leg-foot">
          <button type="button" class="btn btn-primary btn-sm" data-save="${leg.id}"${ro ? " disabled" : ""}>Save</button>
          <p class="leg-error" role="alert" data-error="${leg.id}" hidden></p>
        </div>
      </div>
    </details>`;
}

const legCache = new Map();

function renderLegs(legs, { ro, email }) {
  legCache.clear();
  legs.forEach((l) => legCache.set(l.id, l));
  legsEl.innerHTML =
    (ro ? html`<p class="card debug-note">Debug preview — seed legs from /data/legs.json, read-only. Nothing is saved.</p>` : "") +
    legs.map((l) => legCard(l, ro)).join("");
  if (!ro) for (const b of qsa("[data-save]", legsEl)) b.addEventListener("click", () => saveLeg(b.dataset.save, email, b));
}

const field = (legId, i, f) => qs(`[data-leg="${CSS.escape(legId)}"][data-i="${i}"][data-f="${f}"]`, legsEl);

/** Read one leg's form → { options, changes } or { error }. */
function collect(leg) {
  const options = [];
  const changes = [];
  for (let i = 0; i < leg.options.length; i++) {
    const old = leg.options[i];
    const o = { ...old };
    const v = (f) => field(leg.id, i, f).value.trim();
    if (field(leg.id, i, "costMin").validity.badInput || field(leg.id, i, "costMax").validity.badInput) return { error: `${old.label}: costs must be numbers.` };
    const min = v("costMin"), max = v("costMax");
    const label = old.label;
    if ((min === "") !== (max === "")) return { error: `${label}: enter both cost min and cost max, or leave both empty.` };
    if (min === "") o.cost = null;
    else {
      const a = Number(min), b = Number(max);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return { error: `${label}: costs must be positive numbers.` };
      if (a > b) return { error: `${label}: cost min can’t be higher than cost max.` };
      o.cost = [a, b];
    }
    const departs = v("departs");
    if (departs && !timeOk(departs)) return { error: `${label}: departs must look like 06:30.` };
    if (departs) o.departs = departs; else delete o.departs;
    o.status = v("status") === "verified" ? "verified" : "est";
    const on = v("verifiedOn");
    if (o.status === "verified" && !on) return { error: `${label}: “verified” needs a Verified-on date.` };
    if (on) o.verifiedOn = on; else delete o.verifiedOn;
    const notes = v("notes");
    if (notes) o.notes = notes; else delete o.notes;
    const src = v("sourceUrl");
    if (src && !/^https:\/\/\S+$/.test(src)) return { error: `${label}: the source URL must start with https://` };
    if (o.status === "verified" && !src) return { error: `${label}: “verified” needs a Source URL (the page or document that shows the value).` };
    if (src) o.sourceUrl = src; else delete o.sourceUrl;

    const s = (x) => (x == null ? "" : Array.isArray(x) ? costText(x) : String(x));
    for (const f of ["cost", "departs", "status", "verifiedOn", "notes", "sourceUrl"]) {
      if (s(old[f]) !== s(o[f])) changes.push({ operator: old.operator || "", field: `options[${i}].${f}`, from: s(old[f]), to: s(o[f]) });
    }
    options.push(o);
  }
  return { options, changes };
}

async function saveLeg(legId, email, btn) {
  const leg = legCache.get(legId);
  const errEl = qs(`[data-error="${CSS.escape(legId)}"]`, legsEl);
  errEl.hidden = true;
  const r = collect(leg);
  if (r.error) {
    errEl.textContent = r.error;
    errEl.hidden = false;
    return;
  }
  if (!r.changes.length) {
    toast("No changes to save");
    return;
  }
  btn.disabled = true;
  try {
    const [{ db }, { doc, writeBatch, collection, serverTimestamp }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
    const batch = writeBatch(db); // leg + audit log land together or not at all
    batch.update(doc(db, "legs", legId), { options: r.options });
    const fallbackOp = email.split("@")[1];
    for (const c of r.changes) {
      batch.set(doc(collection(db, "operatorUpdates")), { operator: c.operator || fallbackOp, legId, field: c.field, from: c.from, to: c.to, by: email, at: serverTimestamp() });
    }
    await batch.commit();
    leg.options = r.options;
    toast("Saved · shown on the dashboard");
  } catch (e) {
    console.warn("Darb: save failed", e);
    errEl.textContent = e.code === "permission-denied" ? "Your account isn’t allowed to change this data." : "Couldn’t save. Check your connection and try again.";
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
