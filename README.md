# Darb — Jordan trips, reality-checked

**Live:** https://darb-pixelsdev.web.app · Team **PixelsDev** · PixelSite 2.0 — *Reimagining Jordanian Tourism*

Paste any Jordan itinerary — from ChatGPT, a blog or a travel agent. Darb checks every day against real buses, travel times, opening hours and prices, gives it a **Reality Score**, and fixes what won't work on the ground — with every transport leg costed in JOD.

## Features
- **Reality Check** — each day flagged OK / Risky / Not feasible, with the reason and a fix.
- **Fix all** — corrected plan, every leg with a chosen option, cost and last-verified date.
- **Jordan Pass calculator** — shows whether the Pass saves money for this exact trip.
- **Build a plan** — suggests only places you can actually reach, including lesser-visited sites.
- **Save & share** — private link, PDF, offline mode, calendar export (.ics / Google).
- **Ministry dashboard** — where tourism gets stuck: blocked legs, demand for lesser-visited sites, data freshness.
- **Data owners panel** — operators update their own schedules and prices.

## Tech
HTML · CSS · JavaScript (ES modules, no framework, no build step) · **Firebase**
- **Hosting** — the live site
- **Cloud Firestore** — verified places & transport legs, private-by-link trips, anonymous usage events for the dashboard
- **Authentication** — email/password for data owners
- **Security rules** — `firestore.rules`

The rules engine (`public/js/engine/`) runs in the browser and makes every decision; nothing is guessed by AI.

## Run locally
```bash
python3 -m http.server -d public 8080   # then open http://localhost:8080
```
Deploy: `firebase deploy` · Seed data: `node scripts/seed.mjs`

## Data honesty
Only values marked *verified* show a ✓ and a date (e.g. JETT Abdali → Petra, 06:30, 4 h, 10 JOD — verified 24 Sep 2026). Everything else is shown as an estimate range. Dashboard figures in *Demo* mode are illustrative.
