// 01 Landing — the demo card runs Sarah's example through the real engine (never hard-coded numbers).
import { initPage } from "../ui/nav.js";
import { icon, placeIcon } from "../ui/icons.js";
import { statusPill } from "../ui/pills.js";
import { html, raw, qs, qsa } from "../ui/dom.js";
import { loadModel } from "../data.js";
import { parse } from "../engine/parser.js";
import { check, eventSummary } from "../engine/rules.js";
import { fix } from "../engine/fixer.js";
import { monthName, fmtDate } from "../engine/format.js";
import { shortName, daysSince, STALE_DAYS } from "../engine/model.js";
import { saveTrip, logEvent } from "../store.js";
import { toast } from "../ui/toast.js";
import { REFERENCE_TEXT, REFERENCE_SETTINGS } from "../test-cases.js";

initPage();

// Decorative icons (inline SVG, no emoji).
for (const li of qsa("#hero-checks li")) li.insertAdjacentHTML("afterbegin", icon("check"));

// Hero background video: the source is picked here (<source media> is not honoured everywhere), smaller file on
// phones; Save-Data: no video, poster only. Decorative and muted; reduced motion: no playback, the poster stays.
const heroVideo = qs("#hero-video");
if (heroVideo && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const small = innerWidth < 900;
  let started = false;
  let visible = false; // hero on screen (set by the observer below)
  const play = () => {
    if (!visible) return;
    if (!heroVideo.getAttribute("src")) heroVideo.src = small ? "/img/landing/hero-720.mp4" : "/img/landing/hero-1080.mp4";
    heroVideo.play()?.catch(() => {});
  };
  // Off-screen: pause; back on screen: resume.
  if ("IntersectionObserver" in window && navigator.connection?.saveData !== true) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!started) return; // the delayed start (below) sets the source and plays
      if (visible) play(); else heroVideo.pause();
    }).observe(heroVideo);
    // Start after the page and the demo data have loaded, so the video never competes with them.
    // With a #hash the browser jumps to the target only after layout settles: wait for that jump before deciding.
    const start = () => setTimeout(() => { started = true; play(); }, location.hash.length > 1 ? 2500 : 300);
    if (document.readyState === "complete") start(); else addEventListener("load", start, { once: true });
  }
}

// Photo sections: lazy backgrounds (Wadi Rum, Aqaba) once a section is within ~800 px of the viewport.
const lazyBg = qsa("#how, #hostels");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-near"); io.unobserve(e.target); }
  }, { rootMargin: "800px 0px" });
  lazyBg.forEach((el) => io.observe(el));
} else {
  lazyBg.forEach((el) => el.classList.add("is-near"));
}

// #how: --p goes 0 → 1 as the section scrolls into view, so the top dust bank thins and lifts.
// Only while the section is near the viewport; reduced motion (or no JS) keeps the static --p: 1 look.
const how = qs("#how");
let howP = 1;
if (how && "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let frame = 0;
  const update = () => {
    frame = 0;
    const r = how.getBoundingClientRect();
    const vh = innerHeight;
    // 0 when the section top reaches the viewport bottom, 1 when it has climbed to 25 % from the top.
    const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
    how.style.setProperty("--p", p.toFixed(3));
    howP = p;
  };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { addEventListener("scroll", onScroll, { passive: true }); update(); }
    else removeEventListener("scroll", onScroll);
  }, { rootMargin: "200px 0px" }).observe(how);
}

// #how: blowing Wadi Rum sand on a canvas — fine grains and soft dust puffs carried sideways by a gusty wind,
// densest in the top transition and calmer as --p reaches 1. Runs only while #how is near the viewport and the
// tab is visible; reduced motion (or no canvas) leaves the static sand banks alone.
const dustCanvas = qs("#how .dust-canvas");
if (how && dustCanvas && dustCanvas.getContext && "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const ctx = dustCanvas.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const tones = ["--dust-sand", "--dust-sand-deep", "--dust-sand-light"].map((t) => css.getPropertyValue(t).trim() || "#dcb68a");
  // Pre-rendered soft puff sprites (one per tone): radial falloff, drawn scaled with drawImage each frame.
  const sprite = (color) => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = color; g.fillRect(0, 0, 128, 128);
    // Keep the colour flat and shape only the alpha, so the puff edge never greys out.
    g.globalCompositeOperation = "destination-in";
    const m = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    m.addColorStop(0, "#000"); m.addColorStop(0.5, "rgba(0,0,0,.5)"); m.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = m; g.fillRect(0, 0, 128, 128);
    return c;
  };
  const puffs = tones.map(sprite);
  let W = 0, H = 0, dpr = 1, grains = [], clouds = [], running = false, raf = 0, last = 0, t = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // Height profile: most dust near the top edge (transition from the section above), some at the bottom edge.
  const pickY = () => (Math.random() < 0.78 ? H * 0.5 * Math.pow(Math.random(), 1.8) : H - H * 0.22 * Math.pow(Math.random(), 1.5));
  const grain = (x) => ({ x: x ?? rnd(-20, W), y: pickY(), z: rnd(0.5, 1), s: rnd(0.8, 2.1), c: Math.random() < 0.7 ? 1 : 0, a: rnd(0.5, 0.95), ph: rnd(0, 6.3) });
  const cloud = (x) => ({ x: x ?? rnd(-300, W), y: pickY(), z: rnd(0.3, 0.8), r: rnd(90, 260), c: Math.random() < 0.55 ? 0 : (Math.random() < 0.5 ? 2 : 1), a: rnd(0.10, 0.22), ph: rnd(0, 6.3) });
  const resize = () => {
    const r = how.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    dustCanvas.width = Math.round(W * dpr); dustCanvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const small = innerWidth < 900;
    grains = Array.from({ length: small ? 130 : 320 }, () => grain());
    clouds = Array.from({ length: small ? 7 : 14 }, () => cloud());
  };
  const frame = (now) => {
    raf = running ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
    // Gusty wind: slow base drift plus two out-of-phase swells, never reversing.
    const gust = 0.55 + 0.45 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1.3) + 0.18 * Math.sin(t * 1.1);
    const wind = 38 + 120 * Math.max(0, gust);
    const calm = 1 - 0.7 * howP; // more dust while the section enters, calmer once settled
    ctx.clearRect(0, 0, W, H);
    for (const c of clouds) {
      c.x += wind * c.z * 0.55 * dt; c.y += Math.sin(t * 0.4 + c.ph) * 4 * dt;
      if (c.x - c.r > W) Object.assign(c, cloud(-c.r * 2));
      const fade = c.y < H * 0.55 ? 1 : 0.6;
      ctx.globalAlpha = c.a * fade * (0.35 + 0.65 * calm);
      ctx.drawImage(puffs[c.c], c.x - c.r, c.y - c.r * 0.5, c.r * 2, c.r);
    }
    for (const g of grains) {
      g.x += wind * g.z * (1.4 + gust * 0.6) * dt;
      g.y += (Math.sin(t * 2.1 + g.ph) * 10 + 6) * g.z * dt;
      if (g.x > W + 10 || g.y > H) Object.assign(g, grain(-10));
      const edge = Math.min(1, Math.max(0, (g.y - 12) / 80), Math.max(0, (H - 12 - g.y) / 80)); // fade out over the white edges
      ctx.globalAlpha = g.a * (0.45 + 0.55 * calm) * g.z * edge;
      ctx.fillStyle = tones[g.c];
      const len = g.s + wind * g.z * 0.03; // faint streak along the wind
      ctx.fillRect(g.x, g.y, len, g.s * 0.8);
    }
    ctx.globalAlpha = 1;
  };
  const start = () => { if (!running && !document.hidden) { running = true; last = 0; raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
  let near = false;
  resize();
  new IntersectionObserver(([e]) => { near = e.isIntersecting; near ? start() : stop(); }, { rootMargin: "100px 0px" }).observe(how);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : near && start()));
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(resize, 150); };
  // The section's height changes with lazy content and fonts: resize the canvas with it (no stretched grains).
  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(how);
  else addEventListener("resize", onResize, { passive: true });
}

const demo = qs("#demo");

/** Route-style row title: "Amman → Petra" when the day moves on from the previous day's base. */
function rowTitle(days, i, model) {
  const d = days[i];
  const prev = i > 0 ? days[i - 1].placeIds.at(-1) : null;
  const nameOf = (id) => shortName(model.byId[id]);
  if (!prev || !d.placeIds.length || !model.byId[prev]) return d.title;
  if (d.placeIds[0] === prev && d.placeIds.length > 1) return d.placeIds.map(nameOf).join(" → ");
  if (d.placeIds.length === 1 && d.placeIds[0] !== prev) return `${nameOf(prev)} → ${nameOf(d.placeIds[0])}`;
  return d.title;
}

function renderDemo({ trip, result, fixed, res, model }) {
  const s = trip.settings;
  const meta = ["Pasted from ChatGPT", s.car ? "with a car" : "no car", monthName(s.month)].join(" · ");
  const scoreCls = result.score >= 85 ? " good" : "";
  demo.innerHTML = html`
    <div class="demo-head">
      <div>
        <h2>Sarah’s ${trip.days.length}-day plan</h2>
        <p class="small muted">${meta}</p>
      </div>
      <div class="demo-score${scoreCls}" aria-label="${`Reality Score ${result.score} out of 100`}">
        <strong>${result.score}</strong><span aria-hidden="true">/100<br>reality</span>
      </div>
    </div>
    <ol class="demo-days">
      ${result.days.map((d, i) => html`
        <li class="demo-day">
          <span class="demo-n">Day ${d.n}</span>
          <span class="demo-t">${rowTitle(trip.days, i, model)}</span>
          ${raw(statusPill(d.status))}
        </li>`).map(raw)}
    </ol>
    <button type="button" class="btn btn-primary btn-block" id="demo-fix">Fix all → ${fixed.score}/100</button>
    <p class="demo-note">Live result from the Darb engine — not a screenshot.</p>`;
  demo.setAttribute("aria-busy", "false");
  wireFixAll({ trip, result, res, model });

  const p = result.pass;
  if (p && p.paysOff) {
    qs("#pass-line").textContent =
      `Sarah’s ${trip.days.length}-day plan: ${p.tier.name} ${p.tier.jod} JOD vs ${p.separate} JOD bought separately — save ~${p.savings} JOD.`;
  }
}

/** Save Sarah's checked trip, then its fixed child, and open the fixed plan. Never a dead button. */
function wireFixAll({ trip, result, res, model }) {
  const btn = qs("#demo-fix");
  const label = btn.textContent;
  let busy = false;
  const cut = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  btn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Opening the fixed plan…";
    const days = (list) => list.map(({ n, title, text, placeIds, notCovered, hints }) => ({ n, title, text, placeIds, notCovered: notCovered || [], hints }));
    const base = { title: "Sarah’s 5-day plan", source: "paste", rawText: REFERENCE_TEXT, settings: trip.settings, lang: "en" };
    try {
      const parentId = await cut(saveTrip({ ...base, days: days(trip.days), check: result, score: result.score }), 12000);
      const id = await cut(saveTrip({ ...base, days: days(res.days), check: res.check, fixed: res.fixed, score: res.fixed.score, parentId }), 12000);
      logEvent("fix", { ...eventSummary(trip, result, model), scoreAfter: res.fixed.score }).catch(() => {});
      location.href = `/fixed.html?t=${encodeURIComponent(id)}`;
    } catch (err) {
      console.warn("Darb: demo plan not saved, opening the input page", err);
      toast("Couldn’t open the fixed plan — opening the plan checker instead.");
      setTimeout(() => { location.href = "/plan.html?demo=1"; }, 1200);
    }
  });
  // Coming back via the browser's back button restores the page from bfcache with the button stuck.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    busy = false; btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = label;
  });
}

// ---------- #pass: tiers, what's included, Sarah's receipt and the rules — all from jordan-pass.json, places.json
// tickets and the live passValue() result. Nothing here is hard-coded; without the data the static copy stays.
for (const li of qsa("#pass-rules [data-icon]")) li.insertAdjacentHTML("afterbegin", icon(li.dataset.icon));

const r = (s, ...v) => raw(html(s, ...v));
const tierShort = (t) => t.name.replace(/^Jordan\s+/, "");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** ✓ + date only for a verified value; everything else is est. (CLAUDE.md rule 6). */
const priceTag = (jod, verified, on) => (typeof jod !== "number"
  ? html`<span class="pass-price est">price varies</span>`
  : verified
    ? html`<span class="pass-price ok">${jod} JOD <span aria-hidden="true">✓</span><span class="sr-only">verified</span>${on ? r` <small>${fmtDate(on)}</small>` : ""}</span>`
    : html`<span class="pass-price est">est. ${jod} JOD</span>`);

function renderPass({ trip, result, model }) {
  const P = model.pass;
  const meta = P._meta || {};
  const passFresh = !!meta.verifiedOn && daysSince(meta.verifiedOn, model.today) <= STALE_DAYS;
  const pv = result.pass;
  const petra = model.byId.petra?.ticket;
  const petraOk = petra?.status === "verified";

  // Rules: numbers from the data.
  for (const el of qsa('#pass [data-pass="nights"]')) el.textContent = P.minNightsForVisaWaiver;
  for (const el of qsa('#pass [data-pass="days"]')) el.textContent = P.minNightsForVisaWaiver + 1;
  const src = qs("#pass-source");
  if (meta.source) {
    src.innerHTML = html`Source: ${meta.sourceUrl ? r`<a href="${meta.sourceUrl}" target="_blank" rel="noopener">${meta.source}</a>` : meta.source}${passFresh ? ` · verified ${fmtDate(meta.verifiedOn)}` : ""}`;
  }

  // Tiers.
  const tiers = qs("#pass-tiers");
  tiers.innerHTML = P.tiers.map((t) => {
    const on = pv && pv.tier.id === t.id;
    const petraAlone = P.petraSeparateJod[String(t.petraDays)];
    return html`
      <li class="pass-tier${on ? " is-on" : ""}"${on ? raw(' aria-current="true"') : ""}>
        ${on ? r`<span class="pass-tier-tag">Sarah’s plan</span>` : ""}
        <span class="pass-tier-name">${tierShort(t)}</span>
        <span class="pass-tier-price"><strong>${t.jod}</strong> JOD</span>
        <span class="pass-tier-petra">${raw(icon("landmark"))}Petra ${plural(t.petraDays, "day")}</span>
        ${typeof petraAlone === "number" ? r`<span class="pass-tier-vs">Visa + Petra alone: ${passFresh && petraOk ? "" : "est. "}${P.visaJod + petraAlone} JOD</span>` : ""}
      </li>`;
  }).join("");
  tiers.setAttribute("aria-busy", "false");

  // What's included.
  const covered = model.places.filter((p) => p.ticket?.coveredByJordanPass);
  const rows = [
    html`<li><span class="pass-li-name">${raw(icon("shield"))}Tourist visa<small>waived with ${plural(P.minNightsForVisaWaiver, "night")}+</small></span>${raw(priceTag(P.visaJod, passFresh, meta.verifiedOn))}</li>`,
    ...covered.map((p) => {
      const t = p.ticket;
      if (p.id === "petra") {
        const prices = P.tiers.map((x) => P.petraSeparateJod[String(x.petraDays)]).filter((n) => typeof n === "number");
        return html`<li><span class="pass-li-name">${raw(icon(placeIcon(p.id)))}Petra<small>${P.tiers.map((x) => x.petraDays).join(" / ")} days</small></span>${
          prices.length ? r`<span class="pass-price${petraOk ? " ok" : " est"}">${petraOk ? "" : "est. "}${prices.join(" / ")} JOD${petraOk ? r` <span aria-hidden="true">✓</span><span class="sr-only">verified</span> <small>${fmtDate(petra.verifiedOn)}</small>` : ""}</span>` : ""}</li>`;
      }
      return html`<li><span class="pass-li-name">${raw(icon(placeIcon(p.id)))}${t.label}</span>${raw(priceTag(t.jod, t.status === "verified", t.verifiedOn))}</li>`;
    })
  ];
  const inc = qs("#pass-included");
  inc.innerHTML = rows.join("");
  inc.setAttribute("aria-busy", "false");
  const notIn = model.places.filter((p) => p.ticket && !p.ticket.coveredByJordanPass).map((p) => shortName(p));
  if (notIn.length) {
    const ex = qs("#pass-excluded");
    ex.textContent = `Not included: ${notIn.join(", ")}.`;
    ex.hidden = false;
  }

  // Sarah's receipt, straight from passValue().
  const box = qs("#pass-receipt");
  if (!pv) throw new Error("no pass result");
  const verifiedLabel = (label) => {
    if (label === "Visa on arrival") return passFresh;
    if (/^Petra\b/.test(label)) return petraOk;
    return true; // passValue() only puts verified ticket prices into items
  };
  box.innerHTML = html`
    <p class="small muted pass-receipt-meta">${trip.days.length} days · ${plural(pv.nights, "night")} · Petra on ${plural(pv.petraDays, "day")}</p>
    <ul class="pass-receipt-lines">
      ${pv.items.map((i) => html`<li><span>${i.label}</span><span>${i.jod} JOD${verifiedLabel(i.label) ? r` <span class="ok" aria-hidden="true">✓</span>` : ""}</span></li>`).map(raw)}
    </ul>
    <div class="pass-receipt-total"><span>Bought separately</span><strong>${pv.separate} JOD</strong></div>
    <div class="pass-receipt-total is-pass"><span>${pv.tier.name}${pv.visaWaived ? "" : r` + visa`}</span><strong>${pv.passCost} JOD</strong></div>
    <div class="pass-verdict${pv.paysOff ? " good" : ""}">
      ${pv.paysOff
        ? r`<span>You save</span><strong>~${pv.savings} JOD</strong>`
        : r`<span>The Pass doesn’t pay off for this trip</span>`}
    </div>
    <p class="small muted pass-receipt-note">${pv.visaWaived ? `Visa waived: ${plural(pv.nights, "night")} is ${P.minNightsForVisaWaiver}+.` : `Visa not waived under ${plural(P.minNightsForVisaWaiver, "night")}.`} ✓ = verified price.${pv.smallFees.length ? ` Not counted (price not verified): ${pv.smallFees.join(", ")}.` : ""}</p>`;
  box.setAttribute("aria-busy", "false");
}

/** Engine or data failed: drop the skeletons, keep the static copy. */
function renderPassFallback() {
  qs("#pass-tiers")?.closest(".pass-block")?.setAttribute("hidden", "");
  const inc = qs("#pass-included");
  if (inc) { inc.innerHTML = ""; inc.setAttribute("aria-busy", "false"); }
  const box = qs("#pass-receipt");
  if (box) {
    box.innerHTML = `<p class="small muted">The live price check couldn’t load. Darb prices the Pass against your own days when you check a plan.</p>`;
    box.setAttribute("aria-busy", "false");
  }
}

function renderError() {
  demo.setAttribute("aria-busy", "false");
  demo.innerHTML = `
    <div class="stack">
      <h2>The live demo couldn’t load</h2>
      <p class="muted small">Check your connection and try again, or run your own plan.</p>
      <button type="button" class="btn btn-secondary btn-block" data-retry>Try again</button>
      <a class="btn btn-primary btn-block" href="/plan.html">Check my plan</a>
    </div>`;
  demo.querySelector("[data-retry]").addEventListener("click", () => location.reload());
}

try {
  const model = await loadModel();
  const trip = { title: "Sarah’s plan", days: parse(REFERENCE_TEXT, model), settings: { ...REFERENCE_SETTINGS } };
  const result = check(trip, model);
  const res = fix(trip, model);
  renderDemo({ trip, result, fixed: res.fixed, res, model });
  try { renderPass({ trip, result, model }); } catch (err) { console.warn("Darb: pass section failed", err); renderPassFallback(); }
} catch (e) {
  console.warn("Darb: demo card failed", e);
  renderError();
  renderPassFallback();
}
