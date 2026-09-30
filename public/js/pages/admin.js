// Data owners: operators and reserves sign in and update their own schedules and prices. Every change is logged.
import { initPage } from "../ui/nav.js";
import { html, qs } from "../ui/dom.js";
import { loadModel } from "../data.js";
import { FS } from "./admin-common.js";
import { fetchPlaces } from "./admin-tickets.js";
import { renderConsole, teardownConsole } from "./admin-console.js";

initPage();

const AUTH = "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
const DEBUG = new URLSearchParams(location.search).get("debug") === "1";

const authEl = qs("#auth");
const gateEl = qs("#gate");
const consoleEl = qs("#console");

let byId = {}; // reference places + airports: names and coordinates for the list and the maps

/* ---------- sign-in card ---------- */

function renderSignedOut(error = "") {
  authEl.innerHTML = html`
    <form class="auth-form" id="login" novalidate>
      <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="password">Password</label><input class="input" id="password" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary" type="submit" id="signin">Sign in</button>
    </form>
    <p class="auth-error" id="auth-error" role="alert"${error ? "" : " hidden"}>${error}</p>`;
  authEl.classList.remove("is-compact");
  authEl.setAttribute("aria-busy", "false");
  qs("#login").addEventListener("submit", onSignIn);
}

function renderSignedIn(email) {
  authEl.innerHTML = html`
    <div class="auth-who"><p>Signed in as <strong>${email}</strong></p><button class="btn btn-secondary btn-sm" type="button" id="signout">Sign out</button></div>`;
  authEl.classList.add("is-compact");
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

/* ---------- gate + console ---------- */

function renderGate(email) {
  gateEl.innerHTML = html`
    <div class="card gate-card"><h2>Your account isn’t a data owner yet.</h2><p class="muted">Ask the Darb team to add ${email}.</p></div>`;
}

/** current() is false once another auth change (sign-out, another user) superseded this load. */
async function loadEditor(email, current) {
  const [{ db }, { collection, getDocs }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
  const [snap, places] = await Promise.all([getDocs(collection(db, "legs")), fetchPlaces()]);
  if (!current()) return;
  const legs = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => a.id.localeCompare(b.id));
  renderConsole(consoleEl, { legs, places, byId, ro: false, email });
}

let userSeq = 0; // each auth change supersedes a load still in flight

async function onUser(user) {
  const mine = ++userSeq;
  const current = () => mine === userSeq;
  teardownConsole(consoleEl);
  gateEl.innerHTML = "";
  if (!user) return renderSignedOut();
  const email = user.email || "";
  renderSignedIn(email);
  try {
    const [{ db }, { doc, getDoc }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
    const admin = await getDoc(doc(db, "admins", email.toLowerCase()));
    if (!current()) return;
    if (!admin.exists()) return renderGate(email);
    await loadEditor(email, current);
  } catch (e) {
    if (!current()) return;
    if (e.code === "permission-denied") return renderGate(email);
    console.warn("Darb: admin load failed", e);
    gateEl.innerHTML = html`<div class="card gate-card"><h2>Couldn’t load your data</h2><p class="muted">Check your connection and reload.</p></div>`;
  }
}

/* ---------- boot ---------- */

try { byId = (await loadModel()).byId; } catch { /* ids are shown instead of names, maps show Jordan only */ }

if (DEBUG) {
  // Read-only preview of the seed legs so the editor can be checked without a data-owner account. Never writes.
  authEl.innerHTML = html`<p class="auth-debug muted small">Debug preview — sign-in is skipped.</p>`;
  authEl.classList.add("is-compact");
  authEl.setAttribute("aria-busy", "false");
  const [seed, seedPlaces] = await Promise.all(["/data/legs.json", "/data/places.json"].map(async (u) => (await fetch(u)).json()));
  renderConsole(consoleEl, { legs: seed.legs, places: seedPlaces.places, byId, ro: true, email: "" });
} else {
  try {
    const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../firebase-init.js"), import(AUTH)]);
    onAuthStateChanged(auth, onUser);
  } catch (e) {
    console.warn("Darb: auth unavailable", e);
    renderSignedOut("Sign-in isn’t available right now. Reload and try again.");
  }
}
