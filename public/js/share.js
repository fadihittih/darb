// 06 Save & Share modal: private link, PDF, offline copy, email, calendar (Google / Apple / .ics), Trip Pass.
import { html, raw, qs } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { openModal, closeModal } from "./ui/modal.js";
import { toast } from "./ui/toast.js";
import { shareUrl } from "./store.js";
import { buildIcs, googleCalendarUrl } from "./ics.js";

const TRIPS_CACHE = "darb-trips";

const slug = (s) => String(s || "trip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "trip";

async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without async clipboard permission: select + execCommand.
    try {
      input.select();
      return document.execCommand("copy");
    } catch { return false; }
  }
}

function downloadIcs(trip, fixed, model) {
  const text = buildIcs(trip, fixed, model);
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `darb-${slug(trip.title)}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast("Calendar file downloaded");
}

/** Cache the shared trip page + this trip's link so it opens with no signal. */
export async function saveOffline(id) {
  if (!("caches" in window)) throw new Error("Cache Storage unavailable");
  const cache = await caches.open(TRIPS_CACHE);
  // Hosting uses cleanUrls, so the trip shell lives at "/trip" ("/trip.html" only on a plain dev server).
  const urls = [`/t/${id}`, "/trip", "/trip.html"];
  const ok = await Promise.all(urls.map(async (u) => {
    try {
      const res = await fetch(u, { cache: "reload" });
      if (!res.ok) return false;
      // A redirected response can't be served to a navigation — store a plain copy.
      const body = res.redirected
        ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers })
        : res;
      await cache.put(u, body);
      return true;
    } catch { return false; }
  }));
  if (!ok.some(Boolean)) throw new Error("nothing cached");
  const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
  reg?.active?.postMessage({ type: "cache-trip", id });
}

/**
 * openShareModal(trip, fixed, model, { focus }) — trip = { id, title, ... } as loaded by store.loadTrip.
 * focus: "calendar" to put focus on the calendar buttons (used by "Add to calendar").
 */
export function openShareModal(trip, fixed, model, { focus = "" } = {}) {
  // A local (unsaved) trip has no id, so no share link / offline copy / email until it's saved.
  const link = trip.id ? shareUrl(trip.id) : "";
  const gcal = googleCalendarUrl(trip, fixed, model, link ? { link } : {});
  const mail = `mailto:?subject=${encodeURIComponent("My Jordan plan")}&body=${encodeURIComponent(link)}`;
  const score = fixed?.score ?? trip.score;

  const body = html`
    <p class="share-sub">${trip.title || "Your Jordan plan"} · Reality Score ${score} · no login needed</p>
    ${raw(link ? html`
    <div class="share-link">
      <label class="sr-only" for="share-url">Private link to this plan</label>
      <input id="share-url" class="share-url" type="text" readonly value="${link}">
      <button type="button" class="btn btn-dark btn-sm" data-act="copy">Copy link</button>
    </div>
    <p class="small muted">Only people with this link can view the plan.</p>` : html`
    <div class="share-link share-link-off">
      <p class="small">Connect to the internet to get a share link.</p>
    </div>
    <p class="small muted">This plan isn’t saved yet — the PDF and calendar below still work.</p>`)}

    <div class="share-tiles${link ? "" : " share-tiles-one"}">
      <button type="button" class="share-tile" data-act="pdf">
        ${raw(icon("file"))}<span class="share-tile-t">Download PDF</span><span class="share-tile-s">Day-by-day plan with every leg and cost</span>
      </button>
      ${raw(link ? html`
      <button type="button" class="share-tile" data-act="offline">
        ${raw(icon("wifi"))}<span class="share-tile-t">Save offline</span><span class="share-tile-s">Open the plan with no signal in Wadi Rum</span>
      </button>
      <a class="share-tile" href="${mail}" data-act="mail">
        ${raw(icon("mail"))}<span class="share-tile-t">Email to me</span><span class="share-tile-s">Get the link in your inbox</span>
      </a>` : "")}
    </div>

    <div class="share-cal" id="share-cal">
      <span class="share-cal-icon">${raw(icon("calendar"))}</span>
      <div class="share-cal-text">
        <p class="share-cal-t">Add the whole trip to your calendar</p>
        <p class="share-cal-s">One event per day and per transport leg, with departure times, addresses and the ‘if you’re late’ alternative in the notes.</p>
      </div>
      <div class="share-cal-btns">
        <a class="btn btn-secondary btn-xs" href="${gcal}" target="_blank" rel="noopener" data-act="google">Google</a>
        <button type="button" class="btn btn-secondary btn-xs" data-act="ics">Apple</button>
        <button type="button" class="btn btn-secondary btn-xs" data-act="ics">.ics</button>
      </div>
    </div>

    <div class="share-pass">
      <div>
        <p class="share-pass-t">Trip Pass · 3.5 JOD one-time</p>
        <p class="small">Unlocks offline PDF and price updates before you travel</p>
      </div>
      <button type="button" class="btn btn-primary btn-sm" data-act="unlock">Unlock</button>
    </div>

    <button type="button" class="btn btn-secondary btn-block" data-act="done">Done</button>`;

  const modal = openModal(body, { title: "Save & share your plan" });
  modal.classList.add("share-modal");

  modal.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    switch (el.dataset.act) {
      case "copy": {
        const ok = await copyText(link, qs("#share-url", modal));
        toast(ok ? "Link copied" : "Couldn’t copy — select the link and copy it");
        break;
      }
      case "pdf":
        closeModal();
        setTimeout(() => window.print(), 50);
        break;
      case "offline":
        el.disabled = true;
        try {
          await saveOffline(trip.id);
          toast("Saved — opens with no signal");
        } catch (err) {
          console.warn("Darb: offline save failed", err);
          toast("Couldn’t save offline in this browser — download the PDF instead");
        } finally {
          el.disabled = false;
        }
        break;
      case "ics":
        downloadIcs(trip, fixed, model);
        break;
      case "unlock":
        toast("Payments open after launch — everything is free during the competition.");
        break;
      case "done":
        closeModal();
        break;
      default:
        break; // google / mail: plain links
    }
  });

  if (focus === "calendar") qs('[data-act="google"]', modal)?.focus();
  return modal;
}
