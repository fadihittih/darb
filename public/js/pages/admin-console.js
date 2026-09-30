// /admin console after sign-in (or in ?debug=1): overview strip, section tabs, master–detail for legs and tickets,
// Recent changes. The debug preview and the signed-in editor run this same code; ro only disables inputs and Save.
import { html, raw, qs, qsa } from "../ui/dom.js";
import { modeIcon, placeIcon } from "../ui/icons.js";
import { shortName } from "../engine/model.js";
import { bucket } from "./admin-common.js";
import { trackDirty } from "./admin-form.js";
import { mountOverview } from "./admin-overview.js";
import { masterDetail } from "./admin-master.js";
import { legDetail, legInput, saveLeg } from "./admin-legs.js";
import { ticketDetail, ticketInput, saveTicket, TICKETS_NOTE } from "./admin-tickets.js";
import { mountHistory, announceSaved } from "./admin-history.js";
import { mountActivity } from "./admin-activity.js";

const TABS = ["legs", "tickets", "changes"];
const HASH = { leg: "legs", ticket: "tickets" };
const verifiedCount = (values) => values.filter((v) => ["fresh", "expiring"].includes(bucket(v))).length;

/**
 * root = the console container. legs = legs docs ({ id, from, to, options… }); places = places docs ({ id, name, ticket… });
 * byId = reference places + airports (names, lat/lng) from data.js, may be {}; ro = read-only preview; email = signed-in user.
 */
export function renderConsole(root, { legs, places, byId = {}, ro, email }) {
  const placeName = (id) => (byId[id] ? shortName(byId[id]) : id);
  const routeName = (leg) => `${placeName(leg.from)} → ${placeName(leg.to)}`;
  const tickets = [...places].sort((a, b) => a.name.localeCompare(b.name));
  const options = () => legs.flatMap((l) => l.options || []);
  const ticketValues = () => tickets.map((p) => p.ticket || {});

  root.innerHTML = html`
    ${ro ? raw(html`<p class="debug-note">Debug preview — seed legs and tickets from /data/legs.json and /data/places.json, read-only. Nothing is saved.</p>`) : ""}
    <section class="overview" id="overview" aria-label="Overview"></section>
    <div class="tabs admin-tabs" role="tablist" aria-label="Data sections">
      <button type="button" role="tab" class="tab on" id="tab-legs" data-tab="legs" aria-controls="panel-legs" aria-selected="true">Transport legs (${legs.length})</button>
      <button type="button" role="tab" class="tab" id="tab-tickets" data-tab="tickets" aria-controls="panel-tickets" aria-selected="false" tabindex="-1">Site tickets (${tickets.length})</button>
      <button type="button" role="tab" class="tab" id="tab-changes" data-tab="changes" aria-controls="panel-changes" aria-selected="false" tabindex="-1">Recent changes</button>
    </div>
    <section class="tabpanel" id="panel-legs" role="tabpanel" aria-labelledby="tab-legs">
      <div class="panel-head"><h2>Transport legs</h2><p class="muted">Routes between the destinations and the airports. Pick one to update its options: price, schedule and the evidence behind them.</p></div>
      <div data-body></div>
    </section>
    <section class="tabpanel" id="panel-tickets" role="tabpanel" aria-labelledby="tab-tickets" hidden>
      <div class="panel-head"><h2>Site tickets</h2><p class="muted">${TICKETS_NOTE}</p></div>
      <div data-body></div>
    </section>
    <section class="tabpanel" id="panel-changes" role="tabpanel" aria-labelledby="tab-changes" hidden>
      <div class="panel-head"><h2>Recent changes</h2><p class="muted">The latest 30 edits across every leg and ticket, newest first. Choose one to open it.</p></div>
      <div class="card act-card" data-body></div>
    </section>`;

  const updateOverview = mountOverview(qs("#overview", root));
  const refresh = () => updateOverview(options(), ticketValues());
  refresh();

  /* ---------- the two master–detail sections ---------- */

  let activity = null;
  const afterSave = (md, panel, kind, id) => {
    md.refreshRow(id);
    refresh();
    announceSaved(panel, kind === "leg" ? "leg" : "place", id);
    activity?.stale();
  };

  const legMd = masterDetail(qs("#panel-legs [data-body]", root), {
    kind: "leg", items: legs, sortLabel: "Route (A–Z)",
    noun: { many: "routes", back: "All routes" },
    title: routeName,
    meta: (l) => {
      const n = (l.options || []).length;
      return `${l.publicTransport || "no public transport"} · ${n} ${n === 1 ? "option" : "options"} · ${verifiedCount(l.options || [])} verified`;
    },
    iconName: (l) => modeIcon(((l.options || []).find((o) => o.recommended) || (l.options || [])[0])?.mode),
    values: (l) => l.options || [],
    searchText: (l) => [routeName(l), l.id, ...(l.options || []).flatMap((o) => [o.label, o.operator])].join(" "),
    buildDetail: (l) => legDetail(l, { ro, placeName, byId }),
    wire(panel, leg) {
      const dirty = trackDirty(panel, (on) => legMd.setEdited(leg.id, on));
      if (!ro) qs("[data-save]", panel).addEventListener("click", async () => {
        if (await saveLeg(panel, leg, email)) { dirty.reset(); afterSave(legMd, panel, "leg", leg.id); }
      });
      return mountHistory(qs("[data-history]", panel), {
        kind: "leg", id: leg.id, ro,
        labels: () => (leg.options || []).map((o) => o.label),
        findInput: (p, name) => (p.kind === "option" ? legInput(panel, p.index, name) : null)
      });
    },
    onSelect: (id) => setHash(`leg=${id}`)
  });

  const ticketMd = masterDetail(qs("#panel-tickets [data-body]", root), {
    kind: "ticket", items: tickets, sortLabel: "Site (A–Z)",
    noun: { many: "sites", back: "All sites" },
    title: (p) => p.name,
    meta: (p) => {
      const t = p.ticket || {};
      return `${t.label || "Ticket"} · ${t.jod == null ? "price unknown" : `${t.jod} JOD`}`;
    },
    iconName: (p) => placeIcon(p.id),
    values: (p) => [p.ticket || {}],
    searchText: (p) => [p.name, p.id, p.ticket?.label].join(" "),
    buildDetail: (p) => ticketDetail(p, { ro }),
    wire(panel, place) {
      const dirty = trackDirty(panel, (on) => ticketMd.setEdited(place.id, on));
      if (!ro) qs("[data-save]", panel).addEventListener("click", async () => {
        if (await saveTicket(panel, place, email)) { dirty.reset(); afterSave(ticketMd, panel, "ticket", place.id); }
      });
      return mountHistory(qs("[data-history]", panel), {
        kind: "place", id: place.id, ro, findInput: (f, name) => (f.kind === "ticket" ? ticketInput(panel, name) : null)
      });
    },
    onSelect: (id) => setHash(`ticket=${id}`)
  });

  const mds = { legs: legMd, tickets: ticketMd };

  /* ---------- Recent changes ---------- */

  const legById = new Map(legs.map((l) => [l.id, l]));
  const placeById = new Map(tickets.map((p) => [p.id, p]));
  activity = mountActivity(qs("#panel-changes [data-body]", root), {
    resolve(u) {
      if (u.legId && legById.has(u.legId)) {
        const l = legById.get(u.legId);
        return { kind: "leg", id: l.id, name: routeName(l), labels: (l.options || []).map((o) => o.label) };
      }
      if (u.placeId && placeById.has(u.placeId)) return { kind: "ticket", id: u.placeId, name: placeById.get(u.placeId).name };
      return null;
    },
    open(kind, id) {
      showTab(HASH[kind]);
      mds[HASH[kind]].select(id, { user: true });
    }
  });

  /* ---------- tabs (roving tabindex, arrow keys) and the URL hash ---------- */

  const tabs = qsa("[role=tab]", root);
  let active = "legs";

  function setHash(h) {
    if (location.hash.slice(1) !== h) history.replaceState(null, "", `#${h}`);
  }

  function showTab(name, { focus = false } = {}) {
    active = name;
    for (const t of tabs) {
      const on = t.dataset.tab === name;
      t.classList.toggle("on", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    for (const n of TABS) qs(`#panel-${n}`, root).hidden = n !== name;
    if (name === "changes") { activity.show(); setHash("changes"); }
    else {
      const sel = mds[name].selected();
      if (sel) setHash(`${name === "legs" ? "leg" : "ticket"}=${sel}`);
      else history.replaceState(null, "", location.pathname + location.search);
    }
  }

  const tablist = qs("[role=tablist]", root);
  tablist.addEventListener("click", (e) => {
    const t = e.target.closest("[role=tab]");
    if (t) showTab(t.dataset.tab);
  });
  tablist.addEventListener("keydown", (e) => {
    const i = TABS.indexOf(active);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    showTab(TABS[(to + TABS.length) % TABS.length], { focus: true });
  });

  /** #leg=<id> · #ticket=<id> · #changes → that tab and item. */
  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === "changes") return showTab("changes");
    const m = /^(leg|ticket)=(.+)$/.exec(h);
    if (!m) return;
    const tab = HASH[m[1]];
    showTab(tab);
    mds[tab].select(m[2], { silent: true, restore: true });
    setHash(`${m[1]}=${m[2]}`);
  }
  fromHash();
  window.addEventListener("hashchange", fromHash);
}
