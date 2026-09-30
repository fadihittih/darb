# Sand grain background + slightly translucent cards, plan (30 Sep 2026, 22:30)

**Status: plan only, not implemented.** Owner's choice from the pattern comparison
(`scratchpad/patterns.html`, option "أ"): a very faint sand-grain texture on every sand background, and all cards very
slightly translucent so the grain shows through them a little. Submission deadline 01:00 Amman.

## Goal
The whole site shares one "sand" material: the flat `--sand` background gets a barely visible grain, and white cards
let a hint of it through, so the page feels like paper on sand instead of flat colour. Readability and contrast do not
change in any way the eye or the contrast check can measure.

## Design decisions
- **Grain:** one small tileable texture, `public/img/grain.webp`, about 256×256 px and under 12 KB. It is warm brown
  noise with alpha, generated once with the same Python/numpy method as the preview (`scratchpad/grain.png`). It is
  **much lighter than the preview**: an alpha peak around 10–14 % instead of 40 %. The target is that you notice it only
  when you look for it.
- **Where the grain goes:** `body` (`background: var(--sand) url(grain) repeat` with `background-size: 256px`). It
  covers every page and the sand sections of the landing page (How and Pass edges, the fades) through the body
  background. Sections with their own photo or dark background are unaffected. It is not added to `--sand-2` fills
  (chips, soft cards) or to the photo layers.
- **Cards:** new token `--card-bg: rgba(255, 255, 255, .9)`. It replaces `var(--white)` as the background of `.card`
  in `app.css`, and of the page-level card classes that use white today. On a sand background, 90 % white blends to
  about `#fefdfb`: visually still white, with the grain faintly visible. **No `backdrop-filter`** on these cards: it
  costs performance on long pages and adds nothing over a flat background.
- **Not changed (stay fully opaque):** modals (`.modal`), the mobile menu panel, toasts, the sticky mobile CTA,
  dropdowns, form inputs, table header cells. Overlays must be solid to stay readable over any content. The glass cards
  over photos (landing demo, How, Pass, hostels) keep their own glass tokens. `.card-dark` and `.card-soft` stay as
  they are.
- **Print:** grain off and cards solid white (`@media print { body { background: #fff } .card { background: var(--white) } }`).
- **Admin and dashboard:** they get the grain through `body` too. Their cards follow `.card` (same 90 %). Data tables
  inside cards keep solid white rows if any row background is set explicitly.

## Files
| File | Change |
|---|---|
| `public/img/grain.webp` | new texture (≈10 KB) |
| `public/css/tokens.css` | `--card-bg`, and `--grain: url("/img/grain.webp")` for one place to swap it; body background uses them |
| `public/css/app.css` | `.card { background: var(--card-bg) }`; print overrides |
| `public/css/pages/*.css` | replace `background: var(--white)` with `var(--card-bg)` **only on card-like blocks** (14 occurrences to review one by one; inputs, buttons, pills, table cells and overlays stay white) |
| `scripts/check-contrast.mjs` | add pairs: `--muted` and `--ink` on the blended card colour (`#fefdfb`), and `--muted` on the grain's darkest blended sand (about `#f1ebe1`) |
| `public/sw.js` | SHELL → next version; precache `/img/grain.webp` (small and used on every page, so offline pages keep the texture) |
| `docs/HANDOVER.md` | one paragraph |

## Steps
1. Generate `grain.webp` (seamless tile; check that no seam is visible when tiled 4×4 at 100 % and 200 %).
2. Add the tokens and the body background; screenshot plan, check, fixed, the landing sand sections, destinations and a
   place page at 375 and 1440, then tune the alpha until the grain is barely noticeable.
3. Switch `.card` to `--card-bg`, then review the 14 page-level `var(--white)` uses and change only real cards.
4. Add the print overrides, the contrast pairs and the SW bump.
5. Verify, deploy, check the live site, push.

## Verification
- `node scripts/run-tests.mjs` (71/71) and `node scripts/check-contrast.mjs`: no failures, including the new pairs.
- Screenshots at 375×812 and 1440×900: landing (every sand section), plan, check (58, "Fix all → 94/100"), fixed (94,
  305–385), leg, build, destinations, `/d/petra`, dashboard, `/t/<id>`. Look for banding, visible tile seams, and cards
  that now look grey or dirty.
- Print preview of the fixed plan: plain white, no grain.
- Performance: a single 10 KB repeat background, no measurable change. Re-run one Lighthouse mobile pass on the landing.
- No console errors, no horizontal scroll.

## Risks and rollback
- **Grain too visible or looks like dirt on cheap screens:** lower the alpha in the texture (step 2 tuning), or set
  `--grain: none` in `tokens.css` to switch it off everywhere in one line.
- **Cards look grey:** raise `--card-bg` to `.94`, or set it back to `var(--white)` (one line).
- **Rule 4 (design match):** tokens and components stay the same and only the material changes, so the Figma screens
  still match.

## Estimate
About 30–40 minutes with one Opus implementer (UI work) and controller verification. Deploy before 23:30 to keep a
safe margin before 01:00.
