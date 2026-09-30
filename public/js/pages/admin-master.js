// /admin master–detail: a searchable, filterable, sortable list of rows on the left and one detail panel on the right.
// Detail panels are built on first selection and then kept (hidden), so switching rows never loses unsaved input.
// Rows: button[data-row][data-kind][data-id] (aria-current="true" when selected); panels: [data-detail][data-kind][data-id].
import { html, raw, qs, qsa } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { bucket, worstState, soonest, statePill, meter } from "./admin-common.js";

const MOBILE = matchMedia("(max-width: 899px)");
// One media-query listener for the page; each live master–detail registers its handler here (cleared on teardown).
const onMobile = new Set();
MOBILE.addEventListener("change", () => onMobile.forEach((f) => f()));
export const resetMasters = () => onMobile.clear();
const FILTERS = [
  ["all", "All", () => true],
  ["verified", "Verified", (b) => b.has("fresh") || b.has("expiring")],
  ["expiring", "Expiring", (b) => b.has("expiring")],
  ["stale", "Stale", (b) => b.has("stale")],
  ["est", "Estimates only", (b) => b.size > 0 && [...b].every((s) => s === "est")]
];
const SEARCH_ICON = '<svg class="icon md-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
const buckets = (values) => new Set(values.map(bucket));

/**
 * cfg: { kind, items, noun: { one, many, back }, sortLabel, title(item), meta(item), iconName(item), values(item),
 *        searchText(item), buildDetail(item) → html, wire(panel, item) → { show() }, onSelect(id) }
 * → { select(id, opts), refreshRow(id), setEdited(id, on), selected(), showList() }
 */
export function masterDetail(root, cfg) {
  const { kind, noun } = cfg;
  const byId = new Map(cfg.items.map((it) => [it.id, it]));
  const built = new Map(); // id → { panel, handle }
  const edited = new Set();
  let current = null;
  let filter = "all";
  let sortBy = "name";

  root.innerHTML = html`
    <div class="md" data-md="${kind}">
      <div class="md-list card">
        <div class="md-tools">
          <div class="md-search">
            ${raw(SEARCH_ICON)}
            <label class="sr-only" for="search-${kind}">Search a route or a site</label>
            <input class="input" type="search" id="search-${kind}" placeholder="Search a route or a site" autocomplete="off">
          </div>
          <div class="md-chips" role="group" aria-label="${`Filter ${noun.many}`}">
            ${raw(FILTERS.map(([key, label]) => html`<button type="button" class="chip md-chip${key === "all" ? " on" : ""}" data-filter="${key}" aria-pressed="${key === "all"}">${label} <span class="chip-n" data-n="${key}"></span></button>`).join(""))}
          </div>
          <div class="md-sort">
            <label for="sort-${kind}">Sort</label>
            <select class="select" id="sort-${kind}"><option value="name">${cfg.sortLabel}</option><option value="expiry">Soonest expiry</option></select>
            <p class="md-count" role="status" data-count></p>
          </div>
        </div>
        <ul class="md-rows" data-rows aria-label="${noun.many}"></ul>
        <div class="md-empty" data-empty hidden>
          <p>No ${noun.many} match this search.</p>
          <button type="button" class="btn btn-secondary btn-sm" data-clear>Clear</button>
        </div>
      </div>
      <div class="md-detail" data-details>
        <button type="button" class="btn btn-secondary md-back" data-back>${raw(icon("arrow-left"))}${noun.back}</button>
      </div>
    </div>`;

  const md = qs(".md", root);
  const list = qs("[data-rows]", md);
  const details = qs("[data-details]", md);
  const search = qs(`#search-${kind}`, md);

  const rowInner = (it) => {
    const values = cfg.values(it);
    return html`
      <span class="row-icon">${raw(icon(cfg.iconName(it)))}</span>
      <span class="row-main"><span class="row-title">${cfg.title(it)}</span><span class="row-meta">${cfg.meta(it)}</span></span>
      <span class="row-side">
        <span class="row-status">${raw(edited.has(it.id) ? '<span class="row-edited" data-edited>Edited</span>' : "")}${raw(statePill(worstState(values)))}</span>
        ${raw(meter(soonest(values)))}
      </span>`;
  };
  const rowOf = (id) => qs(`[data-row][data-id="${CSS.escape(id)}"]`, list);

  list.innerHTML = cfg.items.map((it) => html`<li><button type="button" class="md-row" data-row data-kind="${kind}" data-id="${it.id}">${raw(rowInner(it))}</button></li>`).join("");

  /* ---------- filter, search, sort ---------- */

  const test = Object.fromEntries(FILTERS.map(([k, , f]) => [k, f]));
  const matches = (it, q) => !q || cfg.searchText(it).toLowerCase().includes(q);

  function apply() {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const it of cfg.items) {
      const ok = matches(it, q) && test[filter](buckets(cfg.values(it)));
      rowOf(it.id).parentElement.hidden = !ok;
      if (ok) shown++;
    }
    for (const [k] of FILTERS) {
      qs(`[data-n="${k}"]`, md).textContent = cfg.items.filter((it) => matches(it, q) && test[k](buckets(cfg.values(it)))).length;
    }
    qs("[data-empty]", md).hidden = shown > 0;
    qs("[data-count]", md).textContent = `${shown} of ${cfg.items.length} ${noun.many}`;
  }

  function sort() {
    const byName = (a, b) => cfg.title(a).localeCompare(cfg.title(b));
    const left = (it) => soonest(cfg.values(it))?.left ?? Infinity;
    const items = [...cfg.items].sort(sortBy === "expiry" ? (a, b) => (left(a) - left(b)) || byName(a, b) : byName);
    for (const it of items) list.append(rowOf(it.id).parentElement); // moved, not rebuilt
  }

  search.addEventListener("input", apply);
  qs(".md-chips", md).addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    filter = b.dataset.filter;
    for (const c of qsa("[data-filter]", md)) { c.classList.toggle("on", c === b); c.setAttribute("aria-pressed", String(c === b)); }
    apply();
  });
  qs(`#sort-${kind}`, md).addEventListener("change", (e) => { sortBy = e.target.value; sort(); });
  qs("[data-clear]", md).addEventListener("click", () => {
    search.value = "";
    qs('[data-filter="all"]', md).click();
    search.focus();
  });

  /* ---------- selection ---------- */

  function panelOf(id) {
    if (!built.has(id)) {
      details.insertAdjacentHTML("beforeend", cfg.buildDetail(byId.get(id)));
      const panel = details.lastElementChild;
      built.set(id, { panel, handle: cfg.wire(panel, byId.get(id)) });
    }
    return built.get(id);
  }

  /**
   * opts.silent: no URL update (default selection); opts.user: a click / key, so move focus and scroll as needed;
   * opts.restore: from the URL hash (on mobile it opens the detail too).
   */
  function select(id, { silent = false, user = false, restore = false } = {}) {
    if (!byId.has(id)) return false;
    const { panel, handle } = panelOf(id);
    if (current && current !== id) built.get(current).panel.hidden = true;
    panel.hidden = false;
    for (const r of qsa("[data-row]", list)) {
      if (r.dataset.id === id) r.setAttribute("aria-current", "true");
      else r.removeAttribute("aria-current");
    }
    current = id;
    handle.show?.();
    const row = rowOf(id); // keep the selected row in view inside the list's own scroll box (desktop)
    const [rb, lb] = [row.getBoundingClientRect(), list.getBoundingClientRect()];
    if (!MOBILE.matches && (rb.top < lb.top || rb.bottom > lb.bottom)) list.scrollTop += rb.top - lb.top - 8;
    if (!silent) cfg.onSelect?.(id);
    if (MOBILE.matches && (user || restore || !silent)) {
      md.classList.add("show-detail");
      md.scrollIntoView({ block: "start" });
      qs(".detail-title", panel)?.focus({ preventScroll: true });
    } else if (user && panel.getBoundingClientRect().top < 0) {
      details.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    return true;
  }

  function showList() {
    md.classList.remove("show-detail");
    const r = current && rowOf(current);
    r?.scrollIntoView({ block: "center" });
    r?.focus({ preventScroll: true });
  }

  list.addEventListener("click", (e) => {
    const r = e.target.closest("[data-row]");
    if (r) select(r.dataset.id, { user: true });
  });
  list.addEventListener("keydown", (e) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const rows = qsa("[data-row]", list).filter((r) => !r.parentElement.hidden);
    const i = rows.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    rows[next].focus();
  });
  qs("[data-back]", md).addEventListener("click", showList);
  onMobile.add(() => {
    if (MOBILE.matches) md.classList.remove("show-detail");
    else if (!current) selectFirst();
  });

  function selectFirst() {
    const first = qsa("[data-row]", list).find((r) => !r.parentElement.hidden);
    if (first) select(first.dataset.id, { silent: true });
  }

  sort();
  apply();
  if (!MOBILE.matches) selectFirst();

  return {
    select,
    showList,
    selected: () => current,
    /** Re-render one row and the counts after its data changed (a save). */
    refreshRow(id) {
      const it = byId.get(id);
      if (!it) return;
      rowOf(id).innerHTML = rowInner(it);
      apply();
      sort();
    },
    setEdited(id, on) {
      if (on) edited.add(id); else edited.delete(id);
      const it = byId.get(id);
      if (it) rowOf(id).innerHTML = rowInner(it);
    }
  };
}
