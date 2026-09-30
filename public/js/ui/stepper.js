// "1 Your plan, 2 Reality Check, 3 Fixed plan" stepper used on 02 / 03 / 04.

const STEPS = ["Your plan", "Reality Check", "Fixed plan"];

/** HTML for the stepper; current is 1..3 (earlier steps are done and show ✓). */
export function stepper(current) {
  const cur = Number(current) || 1;
  const items = STEPS.map((label, i) => {
    const n = i + 1;
    const state = n < cur ? "done" : n === cur ? "current" : "future";
    const mark = state === "done" ? "✓" : String(n);
    const sr = state === "done" ? " (done)" : state === "current" ? " (current step)" : "";
    return `<li class="step ${state}"${state === "current" ? ' aria-current="step"' : ""}><span class="step-num" aria-hidden="true">${mark}</span>${label}<span class="sr-only">${sr}</span></li>`;
  });
  return `<ol class="stepper" aria-label="Progress">${items.join('<li class="step-sep" aria-hidden="true"></li>')}</ol>`;
}
