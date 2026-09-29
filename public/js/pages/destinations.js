// Destinations — cards are pre-rendered into the HTML (scripts/render-destinations.mjs) for SEO; JS only adds nav/footer + anchor behaviour.
import { initPage } from "../ui/nav.js";

initPage({ active: "destinations" });

// Highlight-scroll to the card in the URL hash (works on load and on in-page hash changes).
function focusHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id && document.getElementById(id);
  if (!el) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
addEventListener("hashchange", focusHash);
focusHash();
