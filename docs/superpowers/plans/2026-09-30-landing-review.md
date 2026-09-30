# Landing design review — 30 Sep 2026 (Figma comments #1–#4 on frame "01 — Landing")

Deadline: the site is judged after 22:00 Amman today. Code freeze for this work: **20:15**. A smaller thing that works beats a bigger thing that breaks.

## The four comments (translated) and the ruling on each

| # | Pin | Comment | Ruling |
|---|---|---|---|
| 1 | hero | Change the hero background to video "0930"; move the reality-checked table (the demo card) into its own section directly below the hero | Move the card: **do now**. Video: **the file has not been delivered** — build the hero so a background media layer can be added later, but add no `<video>` and no dead CSS for it |
| 2 | "Why plans break" | The new section that is added here uses this image (Petra by Night) as the background of a square area; keep the text fixed while scrolling over the square area. The current section moves below | **Do now** |
| 3 | top of "How it works" | This image (Wadi Rum camel caravan) is the background of this section; add dust during the transition from the previous section into it, like 66nord.com (soft cloud bank that dissolves one section into the next) | **Do now**, on `#how` |
| 4 | bottom of the page | After everything has moved down, the last section gets this image (Aqaba marina) as its background, cropped 16:9 | **Do now**, on `#hostels` (the last section of the live page) |

**Update 19:26 — the video arrived.** Comment 1 is now fully in scope: `public/img/landing/hero-720.mp4` (1280×720, 54 s, 3.9 MB, H.264, no audio), `hero-480.mp4` (854×480, 1.8 MB) and `hero-poster.webp` (1600×900, a frame of Ad-Deir, Petra). It is a montage: Wadi Rum, Petra, Aqaba boat, Dead Sea. The hero becomes a full-bleed video section:
- `<video class="hero-video" autoplay muted loop playsinline preload="metadata" poster="/img/landing/hero-poster.webp" aria-hidden="true">` with `<source>` for 480 (media `(max-width: 899px)` is not honoured on `<source>` in all browsers, so pick the source in `landing.js`: set `src` to the 480 file when `innerWidth < 900` or `navigator.connection.saveData`, else 720, then `play()` and ignore a rejected promise). `object-fit: cover`, behind the text.
- Ink scrim over the video (token) so the white hero text passes 4.5:1 on any frame; the h1, lead and checks become white/near-white; buttons keep their style (secondary button stays readable). The nav sits on top of the sand page as today (do not make the nav transparent — other pages share it).
- `prefers-reduced-motion: reduce` → do not autoplay; show the poster only (remove `autoplay` from the markup and start playback from JS only when motion is allowed).
- A small pause/play `<button>` in the hero corner (WCAG 2.2.2 — moving content over 5 s needs a pause control), labelled "Pause background video" / "Play background video", visible focus ring.
- Hero height on desktop ~ `min(88vh, 820px)`, phones ~ 560 px min, text left-aligned in the container.

## Global constraints (breaking one disqualifies the project)

- Only HTML, CSS, plain ES modules. No libraries, no build step, no npm dependency, no TypeScript. Nothing loaded from a CDN other than what the page already loads.
- No emoji. No university or member names anywhere.
- Colours only through the variables of `public/css/tokens.css`. New translucent overlays are new tokens in `tokens.css` (see Task), never literal colours in other CSS files.
- Font Plus Jakarta Sans, existing components (`.card`, `.btn`, `.eyebrow`, `.pill-soft`, `.section`, `.container`) and their look stay.
- **No content is removed.** Every heading, paragraph, button, link, id (`#how`, `#pass`, `#hostels`, `#demo`, `#hero-checks`, `#why-cards`, `#pass-line`) and the demo card's behaviour stay. `public/js/pages/landing.js` keeps running Sarah's plan through the real engine; its demo logic is not to be changed.
- The engine (`public/js/engine/**`), data (`public/data/**`), other pages and `public/css/app.css` rules used by other pages must not change behaviour. Landing-only CSS goes in a new file `public/css/pages/landing.css`; the old landing-only rules in `app.css` (`.hero*`, `.demo-*`) may be moved there or overridden there — if moved, check no other page uses them (`grep`).
- Must work at 375 px, 768 px, 1280 px, 1440 px and 1920 px wide. No horizontal scroll at any width.
- Text contrast ≥ 4.5:1 everywhere, including text over photos (use a scrim). Visible focus rings on dark backgrounds.
- `prefers-reduced-motion: reduce` → no drifting, no scroll-linked movement; the static layout must still look finished.
- Do not deploy, push, seed, or touch Firestore. Commit only your own files, by explicit path, with a plain message and no attribution lines.

## Assets (already in the repo, do not regenerate)

`public/img/landing/`:
- `petra-night-1320.webp` (1320×2346, portrait), `petra-night-800.webp` — comment 2
- `wadi-rum-caravan-2400.webp` (2400×1800; cliffs in the top 45 %, the caravan on a line at ~56 % of the height, rippled sand below), `wadi-rum-caravan-1200.webp` — comment 3
- `aqaba-marina-1320.webp` (1320×742, already cropped 16:9), `aqaba-marina-800.webp` — comment 4
- `dust-a.webp`, `dust-b.webp` — 1600×480 white cloud banks with alpha, **tileable horizontally**, opaque at the top edge, ragged and fully transparent at the bottom edge. Use them as `mask-image` (with the `-webkit-` prefix too) on an element whose background is the colour of the neighbouring section, so the dust takes that colour. Flip with `transform: scaleY(-1)` for a bank that rises from the bottom.

Use the smaller file below 900 px (media query on the background rule).

## Task — files you own

`public/index.html`, `public/css/pages/landing.css` (new), `public/css/tokens.css` (add scrim tokens only), `public/css/app.css` (only to remove rules you moved), `public/js/pages/landing.js` (only additions described below), `public/sw.js` (SHELL bump + css list).

### Page order after the change
1. **Hero** — text only, one column: pill, h1, lead, the two buttons, the four checks. Generous height (about 60 vh on desktop, content-height on phones), text centred or left — your call, it must look deliberate without a background image. Structure it so a full-bleed media layer can later sit behind the text (`position: relative; isolation: isolate`, content above it).
2. **Live demo section (new)** — `<section id="demo-section" aria-labelledby="demo-title">` with the Petra by Night photo as a full-bleed background.
   - On ≥ 900 px the section is a square area: `min-height: min(100vw, var(--maxw))` (so 1200 px tall on desktop).
   - Inside it a block that stays pinned while the square scrolls past (`position: sticky`, vertically about centred in the viewport): left, a short text block; right, the existing demo card `<aside class="card demo-card" id="demo" …>` moved here **with its markup, attributes and skeleton unchanged**.
   - Text block copy (exact): eyebrow `Live demo` · h2 `A real plan, checked against the road.` · paragraph `This is Sarah’s pasted itinerary, run through the Darb engine right now. Every day gets a verdict — OK, Risky or Not feasible — and one click fixes the lot.`
   - White text over an ink scrim strong enough for 4.5:1 over the brightest part of the photo (the candles are bright orange). The card stays a white card.
   - < 900 px: one column (text, then card), no sticky, height from content.
3. **Why plans break** — unchanged (white section).
4. **How it works (`#how`)** — the Wadi Rum caravan photo as a full-bleed background.
   - A dust bank at the top edge, in the colour of the white section above, dissolves "Why plans break" into the photo; a second bank at the bottom edge, in the colour of the section below (`#pass` is white), dissolves the photo out. Two mask layers per bank (dust-a, dust-b) drifting slowly sideways at different speeds (CSS keyframes on `transform`, the layer wider than the viewport so the tile loops seamlessly).
   - Scroll-linked: as the section scrolls into view the top bank thins and lifts (a CSS variable `--p` from 0 to 1 set by a small `requestAnimationFrame`-throttled scroll handler, active only while the section is near the viewport). At `--p: 0` the dust covers clearly more of the photo than at `--p: 1`. Without JS or with reduced motion the bank is static at its `--p: 1` look.
   - Heading + eyebrow must stay readable: keep them in the dense part of the top bank or give them a soft plate — no ink text directly on rock texture. The three step cards stay opaque white cards.
   - Leave open photo below the cards so the caravan is actually seen (the section will be roughly one viewport tall on desktop). Tune `background-position` so the caravan line is not hidden behind the cards at 1280–1920 px.
5. **Jordan Pass (`#pass`)** — unchanged.
6. **For hostels (`#hostels`)** — the Aqaba photo as background, the section's box is 16:9 on ≥ 900 px (`aspect-ratio: 16 / 9`, with a sensible `max-height`), the existing teaser card sits on it near the bottom so the marina shows above it. < 900 px: a 16:9 photo band with the card overlapping its lower edge (or directly under it) — the card must never be clipped.

### JS (in `landing.js`, above the engine code, no new module)
- The `--p` scroll variable for `#how` described above.
- Lazy backgrounds: the Wadi Rum and Aqaba photos are applied only when their section is within ~800 px of the viewport (IntersectionObserver adds a class; the CSS background lives under that class). The Petra photo loads normally. With no IntersectionObserver the class is added immediately.

### Tokens
Add to `tokens.css`, below the existing colours, translucent scrims derived from `--ink` and `--white` (for example `--scrim-ink-strong`, `--scrim-ink-soft`). Keep `node scripts/check-contrast.mjs` passing.

### Service worker
`SHELL` → `darb-shell-v16`; add `/css/pages/landing.css` to the css list in `SHELL_URLS`. Do not precache the photos and do not change the fetch handler (it does not intercept `.webp`; the photos simply come from the network, and offline the page falls back to the section colours — make sure every photo section has a solid background colour underneath the image so it still looks finished without it).

## Verify before you report
1. `node scripts/run-tests.mjs` and `node scripts/check-contrast.mjs` pass.
2. `python3 -m http.server -d public 8080`, then in a real browser (Playwright or Chrome DevTools MCP tools — load them with ToolSearch) at 1440×900 and 375×812: full-page screenshot of `/index.html`, look at every section, fix what looks wrong; the demo card renders Sarah's plan with 58 and the "Fix all → 94/100" button; no console errors; no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`). Scroll through the demo section and confirm the block stays pinned, and through `#how` to see the dust. Stop the server when done.
3. Write a report to `.superpowers/sdd/2026-09-30-landing-review/impl-report.md`: what changed per file, what you verified and how, what you could not verify, anything you decided differently from this brief and why. Save the two final full-page screenshots next to it (`desktop.png`, `mobile.png`).

## Update 19:50 — comment 3 correction: sand dust, not white clouds

The teammate meant **dust in the colour of Wadi Rum sand**, not white clouds. The owner also allows external libraries
now, as long as the base stays HTML/CSS/JS (loaded from a CDN as an ES module or script tag; no npm, no build step).

Task (files: `public/css/pages/landing.css`, `public/css/tokens.css`, `public/index.html`, `public/js/pages/landing.js`,
`public/sw.js` SHELL bump to v17):
1. New tokens `--dust-sand` (warm Wadi Rum sand, around `#d6a878`) and `--dust-sand-deep` (around `#b9794a`); tune them
   against the photo so the dust reads as sand blown off the dunes, warm orange-beige, not grey.
2. The dust banks keep their masks and drift, but their colour becomes the sand gradient: the very edge that touches
   the white section above/below stays white for a few px (no seam), then quickly goes to sand, so a white → sand haze
   → photo transition happens. The section heading and step cards must stay readable (the h2 on sand haze needs 4.5:1
   with `--ink`; check).
3. Blowing sand particles: a `<canvas>` in `#how` (aria-hidden, pointer-events none) with a few hundred small sand
   grains and soft dust puffs in the two sand tones, blown sideways by a gusty wind, densest in the top transition zone
   and thinning as `--p` goes to 1 (more dust while the section enters, calmer once settled). Vanilla canvas 2D is
   fine; a CDN library (tsParticles etc.) only if it is clearly better and small. Runs only while `#how` is near the
   viewport (IntersectionObserver), pauses when the tab is hidden, caps devicePixelRatio at 2, fewer particles below
   900 px. Reduced motion: no canvas animation (static sand banks only).
4. `dust-a.webp` / `dust-b.webp` stay as masks; regenerate nothing unless needed.
Verify as before (tests, contrast, 1440 and 375 screenshots while scrolling through `#how`, no console errors, no
horizontal scroll, performance: no jank — check the frame rate stays smooth in DevTools).
