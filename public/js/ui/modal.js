// Accessible modal: backdrop, Esc / backdrop click / .modal-close to close, minimal focus trap, focus restore.
import { esc } from "./dom.js";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let current = null; // { backdrop, modal, onClose, prevFocus, onKey }

/** Open a modal with trusted innerHtml. Returns the .modal element. Only one modal at a time. */
export function openModal(innerHtml, { title, onClose } = {}) {
  closeModal();
  const prevFocus = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const titleId = "modal-title-" + Math.random().toString(36).slice(2, 8);
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true"${title ? ` aria-labelledby="${titleId}"` : ""} tabindex="-1">
      <button type="button" class="modal-close" aria-label="Close">✕</button>
      ${title ? `<h2 class="modal-title" id="${titleId}">${esc(title)}</h2>` : ""}
      <div class="modal-body">${innerHtml ?? ""}</div>
    </div>`;
  const modal = backdrop.querySelector(".modal");

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop || e.target.closest(".modal-close")) closeModal();
  });
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
    if (e.key !== "Tab") return;
    const f = [...modal.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) { e.preventDefault(); modal.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", onKey);

  document.body.append(backdrop);
  document.body.classList.add("modal-open");
  current = { backdrop, modal, onClose, prevFocus, onKey };
  const firstField = modal.querySelector(".modal-body " + FOCUSABLE.split(", ").join(", .modal-body "));
  (firstField || modal).focus();
  return modal;
}

/** Close the open modal (if any), run its onClose and give focus back. */
export function closeModal() {
  if (!current) return;
  const { backdrop, onClose, prevFocus, onKey } = current;
  current = null;
  document.removeEventListener("keydown", onKey);
  backdrop.remove();
  document.body.classList.remove("modal-open");
  if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
  if (typeof onClose === "function") {
    try { onClose(); } catch (e) { console.warn("Darb: modal onClose failed", e); }
  }
}
