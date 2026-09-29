// Mobile sticky action bar (< 900 px): a proxy button that clicks the page's real primary button.
import { qs } from "./dom.js";

/**
 * mountStickyCta("#fix-all", { label?: () => string }) → { sync }
 * The real button stays where it is (desktop layout, keyboard order); on phones the bar repeats it at the bottom.
 * Call sync() whenever the real button's text or disabled state changes.
 */
export function mountStickyCta(targetSelector, { label } = {}) {
  let bar = qs(".sticky-cta");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "sticky-cta no-print";
    bar.innerHTML = '<button type="button" class="btn btn-primary btn-block"></button>';
    document.body.append(bar);
  }
  document.body.classList.add("has-sticky-cta");
  const btn = bar.querySelector("button");
  btn.addEventListener("click", () => qs(targetSelector)?.click());
  const sync = () => {
    const target = qs(targetSelector);
    btn.textContent = (label && label()) || target?.textContent.replace(/\s+/g, " ").trim() || "";
    btn.disabled = !target || target.disabled;
  };
  sync();
  return { sync };
}
