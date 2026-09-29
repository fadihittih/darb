// Bottom-center toast (one at a time), announced to screen readers.

let timer = null;

export function toast(message, ms = 2800) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  el.textContent = String(message ?? "");
  // restart the fade-in even if a toast is already showing
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove("show"), ms);
  return el;
}
