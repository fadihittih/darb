// 08 Ministry dashboard — demo figures (always labelled) or live aggregates of the anonymous `events` collection.
import { initPage } from "../ui/nav.js";
import { html, raw, qs, qsa } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { loadModel, loadDemoStats } from "../data.js";
import { daysSince, shortName } from "../engine/model.js";
import { fmtDate } from "../engine/format.js";

initPage({ variant: "dashboard" });

const FS = "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
const MODE_KEY = "darb:dashboard:mode";
const root = qs("#dash");
const sub = qs("#dash-sub");

const readMode = () => { try { return localStorage.getItem(MODE_KEY) === "live" ? "live" : "demo"; } catch { return "demo"; } };
const saveMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* storage blocked */ } };
const nf = (n) => Number(n).toLocaleString("en-US");
const plural = (n, w) => `${nf(n)} ${w}${n === 1 ? "" : "s"}`;

/* ---------- data: demo ---------- */

function fromDemo(d) {
  const top = d.topBlockedLeg || {};
  return {
    live: false,
    kpis: {
      plans: { value: nf(d.plansChecked), note: d.plansCheckedDelta, up: true },
      infeasible: { value: `${d.infeasiblePct}%`, note: d.infeasibleNote },
      top: { value: top.label || "—", note: top.note || "", text: true },
      lesser: { value: nf(d.lesserVisitedAdded), note: d.lesserVisitedDelta, up: true }
    },
    blocked: d.blockedLegs,
    lesser: d.lesserVisited,
    freshness: [
      { label: "Verified < 30 days", pct: d.freshness.under30, cls: "ok" },
      { label: "30–90 days", pct: d.freshness.d30to90, cls: "risky" },
      { label: "Stale > 90 days", pct: d.freshness.over90, cls: "nf" }
    ],
    operators: d.operatorUpdates,
    month: d.month
  };
}

/* ---------- data: live ---------- */

const ts = (v) => (v && typeof v.toDate === "function" ? v.toDate() : v ? new Date(v) : null);

function freshnessOf(model) {
  const legs = new Map();
  for (const l of Object.values(model.legIndex)) legs.set(l.id, l);
  const b = { under30: 0, d30to90: 0, over90: 0, est: 0 };
  let total = 0;
  for (const l of legs.values()) {
    for (const o of l.options || []) {
      total++;
      if (o.stale) b.over90++; // model downgrades verified-but-old options to est + stale
      else if (o.status !== "verified") b.est++;
      else {
        const age = daysSince(o.verifiedOn, model.today);
        if (age < 30) b.under30++;
        else if (age <= 90) b.d30to90++;
        else b.over90++;
      }
    }
  }
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return [
    { label: "Verified < 30 days", pct: pct(b.under30), cls: "ok" },
    { label: "30–90 days", pct: pct(b.d30to90), cls: "risky" },
    { label: "Stale > 90 days", pct: pct(b.over90), cls: "nf" },
    { label: "Unverified (est.)", pct: pct(b.est), cls: "info" }
  ];
}

async function fromLive(model) {
  const [{ db }, { collection, getDocs }] = await Promise.all([import("../firebase-init.js"), import(FS)]);
  const [evSnap, opSnap] = await Promise.all([getDocs(collection(db, "events")), getDocs(collection(db, "operatorUpdates"))]);
  const events = evSnap.docs.map((d) => d.data()).sort((a, b) => (ts(a.createdAt) || 0) - (ts(b.createdAt) || 0));
  const plans = events.filter((e) => e.type === "check" || e.type === "build");
  const withBlock = plans.filter((e) => (e.blockedLegs || []).length > 0);
  const gems = new Set(model.places.filter((p) => p.hiddenGem).map((p) => p.id));

  const legCounts = new Map();
  for (const e of plans) for (const l of e.blockedLegs || []) legCounts.set(l, (legCounts.get(l) || 0) + 1);
  const blocked = [...legCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  const gemCounts = new Map();
  let lesserEvents = 0;
  for (const e of events) {
    const hit = new Set((e.places || []).filter((id) => gems.has(id)));
    if (hit.size) lesserEvents++;
    for (const id of hit) gemCounts.set(id, (gemCounts.get(id) || 0) + 1);
  }
  const lesser = [...gemCounts]
    .map(([id, plansN]) => ({ place: shortName(model.byId[id]), plans: plansN, delta: "—" }))
    .sort((a, b) => b.plans - a.plans);

  const ops = new Map();
  for (const d of opSnap.docs) {
    const u = d.data();
    const name = u.operator || "Unknown";
    const at = ts(u.at);
    const cur = ops.get(name) || { operator: name, updates: 0, at: null };
    cur.updates++;
    if (at && (!cur.at || at > cur.at)) cur.at = at;
    ops.set(name, cur);
  }
  const operators = [...ops.values()]
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .map((o) => ({ operator: o.operator, updates: o.updates, last: o.at ? fmtDate(o.at.toISOString()) : "—" }));

  const top = blocked[0];
  return {
    live: true,
    empty: events.length === 0,
    kpis: {
      plans: { value: nf(plans.length), note: "this month" },
      infeasible: { value: `${plans.length ? Math.round((withBlock.length / plans.length) * 100) : 0}%`, note: "of plans checked" },
      top: { value: top ? top.label : "—", note: top ? `${plural(top.count, "plan")} this month` : "No blocked legs yet", text: true },
      lesser: { value: nf(lesserEvents), note: "this month" }
    },
    blocked,
    lesser,
    freshness: freshnessOf(model),
    operators
  };
}

/* ---------- render ---------- */

const KPI_LABELS = { plans: "Plans checked", infeasible: "Plans with an infeasible day", top: "Top blocked leg", lesser: "Lesser-visited sites added" };

function kpiCard(key, k) {
  return html`
    <article class="card kpi">
      <span class="kpi-label">${KPI_LABELS[key]}</span>
      <strong class="kpi-value${k.text ? " kpi-text" : ""}">${k.value}</strong>
      <span class="kpi-note${k.up ? " up" : ""}">${k.note}</span>
    </article>`;
}

function barList(rows) {
  if (!rows.length) return html`<p class="dash-none">No blocked legs recorded yet.</p>`;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return html`<ul class="bars">${rows.map((r, i) => html`
    <li class="bar-row">
      <span>${r.label}</span>
      <div class="bar" role="img" aria-label="${`${r.label}: ${r.count}`}"><div class="bar-fill${i > 1 ? " amber" : ""}" style="width:${Math.round((r.count / max) * 100)}%"></div></div>
      <span class="bar-count">${nf(r.count)}</span>
    </li>`).map(raw)}</ul>`;
}

function lesserTable(rows, live) {
  if (!rows.length) return html`<p class="dash-none">No lesser-visited sites in checked plans yet.</p>`;
  return html`
    <div class="table-wrap"><table class="table dash-table">
      <thead><tr><th scope="col">Place</th><th scope="col">Plans</th><th scope="col">${live ? "Change" : "vs August"}</th></tr></thead>
      <tbody>${rows.map((r) => html`
        <tr><td>${r.place}</td><td>${nf(r.plans)} plans</td><td>${r.delta === "—" ? "—" : raw(html`<span class="pill ok">${r.delta}</span>`)}</td></tr>`).map(raw)}</tbody>
    </table></div>`;
}

function render(s) {
  const k = s.kpis;
  root.innerHTML = html`
    ${s.empty ? raw(html`<p class="dash-empty" role="status">No live events yet — check a plan to see it here.</p>`) : ""}
    <div class="kpi-grid">${["plans", "infeasible", "top", "lesser"].map((key) => raw(kpiCard(key, k[key])))}</div>
    <div class="grid-2">
      <div class="dash-main">
        <section class="card dash-card" aria-labelledby="h-blocked"><h2 id="h-blocked">Most common blocked legs</h2>${raw(barList(s.blocked))}</section>
        <section class="card dash-card" aria-labelledby="h-lesser"><h2 id="h-lesser">Demand for lesser-visited sites</h2>${raw(lesserTable(s.lesser, s.live))}</section>
      </div>
      <aside class="dash-side">
        <section class="card dash-card" aria-labelledby="h-fresh"><h2 id="h-fresh">Data freshness</h2>
          <ul class="fresh-list">${s.freshness.map((f) => html`<li><span>${f.label}</span><span class="pill ${f.cls}">${f.pct}%</span></li>`).map(raw)}</ul>
        </section>
        <section class="card dash-card" aria-labelledby="h-ops"><h2 id="h-ops">Operator updates this month</h2>
          ${s.operators.length
            ? raw(html`<ul class="op-list">${s.operators.map((o) => html`<li><strong>${o.operator}</strong><span>${plural(o.updates, "update")}</span><span>last ${o.last}</span></li>`).map(raw)}</ul>`)
            : raw(html`<p class="dash-none">No operator updates yet.</p>`)}
        </section>
        <section class="card-dark export-card" aria-labelledby="h-export"><h2 id="h-export">Export for MoTA Tourism MIS</h2>
          <button type="button" class="btn" id="csv">${raw(icon("download"))}Download CSV</button>
          <p>Feeds the Tourism MIS/Dashboard called for in the National Tourism Strategy 2021–2025 (p.19).</p>
        </section>
      </aside>
    </div>
    <p class="dash-foot">${s.live ? "Live figures from anonymous plan checks on Darb · updated on page load" : "All figures on this screen are illustrative demo data."}</p>`;
  root.setAttribute("aria-busy", "false");
  qs("#csv").addEventListener("click", () => downloadCsv(s));
}

/* ---------- CSV export (client-side, of exactly what is shown) ---------- */

const csvCell = (v) => {
  let t = String(v ?? "");
  if (/^[=@\t\r]|^[+-](?!\d)/.test(t)) t = "'" + t; // stop spreadsheet formula injection
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function downloadCsv(s) {
  const k = s.kpis;
  const rows = [["section", "item", "value", "note"], ["source", s.live ? "Live data (anonymous events)" : "Demo data (illustrative)", "", ""]];
  for (const key of ["plans", "infeasible", "top", "lesser"]) rows.push(["kpi", KPI_LABELS[key], k[key].value, k[key].note]);
  for (const b of s.blocked) rows.push(["blocked_leg", b.label, b.count, ""]);
  for (const l of s.lesser) rows.push(["lesser_visited", l.place, l.plans, l.delta]);
  for (const f of s.freshness) rows.push(["data_freshness", f.label, `${f.pct}%`, ""]);
  for (const o of s.operators) rows.push(["operator_updates", o.operator, o.updates, `last ${o.last}`]);
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `darb-tourism-mis-${s.live ? "live" : "demo"}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- mode switching ---------- */

let demoStats = null;
let token = 0;

async function show(mode) {
  const my = ++token;
  for (const b of qsa("[data-mode]")) {
    const on = b.dataset.mode === mode;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  }
  root.setAttribute("aria-busy", "true");
  let state;
  try {
    if (mode === "live") {
      sub.textContent = "Aggregated, anonymous data from checked plans · live";
      state = await fromLive(await loadModel());
    } else {
      demoStats ||= await loadDemoStats();
      sub.textContent = `Aggregated, anonymous data from checked plans · ${demoStats.month} (demo data)`;
      state = fromDemo(demoStats);
    }
  } catch (e) {
    console.warn("Darb: dashboard failed to load", e);
    if (my !== token) return;
    root.innerHTML = html`<div class="card dash-card"><h2>The figures couldn’t load</h2><p class="muted small">Check your connection and reload.</p></div>`;
    root.setAttribute("aria-busy", "false");
    return;
  }
  if (my === token) render(state);
}

for (const b of qsa("[data-mode]")) {
  b.addEventListener("click", () => { saveMode(b.dataset.mode); show(b.dataset.mode); });
}
show(readMode());
