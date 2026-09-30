// Site header + footer shared by every page, and the per-page bootstrap (initPage).
import { esc } from "./dom.js";

const LINKS = [
  { key: "how", href: "/index.html#how", label: "How it works" },
  { key: "pass", href: "/index.html#pass", label: "Jordan Pass" },
  { key: "destinations", href: "/destinations.html", label: "Destinations" },
  { key: "hostels", href: "/index.html#hostels", label: "For hostels" }
];

function slot(tag, id, where) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    if (where === "start") document.body.prepend(el);
    else document.body.append(el);
  }
  return el;
}

/**
 * Fill <header id="nav"> (created at the top of <body> if missing).
 * active: "how" | "pass" | "destinations" | "hostels" (or the link's href). variant: "default" | "dashboard".
 */
export function mountNav({ active = "", variant = "default" } = {}) {
  const el = slot("header", "nav", "start");
  el.classList.add("nav", "no-print");
  const links = LINKS.map((l) => {
    const on = active && (active === l.key || active === l.href);
    return `<a href="${l.href}"${on ? ' class="on" aria-current="page"' : ""}>${esc(l.label)}</a>`;
  }).join("");
  const right = variant === "dashboard"
    ? `<span class="nav-dash-pill" role="status">Ministry of Tourism · Insights (demo)</span>`
    : `<a class="btn btn-dark btn-sm nav-cta" href="/plan.html">Check my plan</a>`;
  el.innerHTML = `
    <div class="container nav-inner">
      <a class="brand" href="/index.html" aria-label="darb — home"><span class="brand-dot" aria-hidden="true"></span>darb</a>
      <nav class="nav-links" aria-label="Main">${links}</nav>
      <div class="nav-menu">
        <button type="button" class="nav-menu-btn" aria-expanded="false" aria-controls="nav-menu-links">Menu</button>
        <nav class="nav-menu-links" id="nav-menu-links" aria-label="Main (mobile)" hidden>${links}</nav>
      </div>
      <div class="nav-right">${right}</div>
    </div>`;
  wireMenu(el);
  return el;
}

/** Mobile disclosure: button toggles the link list; Esc / outside click / link click close it. */
function wireMenu(el) {
  const btn = el.querySelector(".nav-menu-btn");
  const panel = el.querySelector(".nav-menu-links");
  const set = (open, refocus) => {
    btn.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (open) panel.querySelector("a")?.focus();
    else if (refocus) btn.focus();
  };
  btn.addEventListener("click", () => set(panel.hidden));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) set(false, true);
  });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !el.querySelector(".nav-menu").contains(e.target)) set(false);
  });
  panel.addEventListener("focusout", (e) => {
    if (!panel.hidden && e.relatedTarget && !el.querySelector(".nav-menu").contains(e.relatedTarget)) set(false);
  });
}

/** Fill <footer id="footer"> (created at the end of <body> if missing). */
export function mountFooter() {
  const el = slot("footer", "footer", "end");
  el.classList.add("footer", "no-print");
  el.innerHTML = `
    <div class="container footer-inner">
      <p class="footer-brand">darb — Jordan trips, reality-checked · PixelsDev</p>
      <div class="footer-right">
        <p>Verified prices and schedules show their last-verified date; the rest are marked “est.”</p>
        <p class="footer-links"><a href="/admin.html">For data owners</a><a href="/tests.html">Engine tests</a></p>
      </div>
    </div>`;
  return el;
}

/** Page bootstrap: nav + footer + service worker (sw.js may not exist yet — failures stay silent). */
export function initPage(opts = {}) {
  mountNav(opts);
  mountFooter();
  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } catch { /* unsupported context (e.g. file://) */ }
  }
}
