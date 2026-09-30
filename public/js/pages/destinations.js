// Destinations index + /d/<id> guides — content is pre-rendered (scripts/render-destinations.mjs) for SEO;
// JS only adds nav/footer and the interest filter (progressive: every card is visible without JS).
import { initPage } from "../ui/nav.js";

initPage({ active: "destinations" });

const bar = document.getElementById("dx-filters");
if (bar) {
  const items = [...document.querySelectorAll(".dx-item")];
  const count = document.getElementById("dx-count");
  bar.hidden = false;
  const apply = (f) => {
    let n = 0;
    for (const li of items) {
      const show = f === "all" || li.dataset.interests.split(" ").includes(f);
      li.hidden = !show;
      if (show) n++;
    }
    for (const b of bar.querySelectorAll("button")) {
      const on = b.dataset.filter === f;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
    if (count) count.textContent = f === "all" ? "" : `${n} of ${items.length} destinations`;
  };
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-filter]");
    if (b) apply(b.dataset.filter);
  });
}

// Old links (/destinations#petra) → the place's own page.
const id = decodeURIComponent(location.hash.slice(1));
if (bar && /^[a-z-]+$/.test(id) && document.querySelector(`a[href="/d/${id}.html"]`)) location.replace(`/d/${id}.html`);
