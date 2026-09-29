# Data verification log

One row per value checked against an official source. Only rows with a verbatim quote may set `status: "verified"`
in `public/data/*.json`. `nextCheck` = verifiedOn + 90 days (the engine shows older values as est.).
Method: web | phone | field | whatsapp | operator (see docs/DATA_VERIFICATION.md).

Pass of 2026-09-30 (web only, single reads, no booking forms). Proposed JSON edits are in
`docs/data/verified-patch.json`. All 12 were **applied on 2026-09-30** (controller decision: Wadi Rum 5, Madaba Archaeological Park 3, Dana 8 + tax note, visa waiver at 2 nights). Rows marked `changesReference` alter the Jordan Pass sum
for the reference trip (§6). Rows marked `decision: controller` also need the controller's decision.

MoTA quotes are table cells copied verbatim and joined with ` | ` in page (HTML) order:
`ملاحظات | للأجنبي | للأردني | الموقع` (notes | foreigner | Jordanian | site). The reserves table has
`ملاحظات | للأجنبي | للمقيم | للأردني | اسم المحمية`. The page footer reads `اخر تعديل: 2026/09/29`.

Source URLs:
- MoTA = https://www.mota.gov.jo/Ar/Pages/%D8%B1%D8%B3%D9%88%D9%85_%D8%AF%D8%AE%D9%88%D9%84_%D8%A7%D9%84%D9%85%D9%88%D8%A7%D9%82%D8%B9_%D8%A7%D9%84%D8%B3%D9%8A%D8%A7%D8%AD%D9%8A%D8%A9 (title "رسوم دخول المواقع السياحية - وزارة السياحة والاثار", one hop from https://www.mota.gov.jo)
- Petra = https://visitpetra.jo/en/Petrafees (title "Petra Fees", one hop from https://visitpetra.jo/en)
- JP-Prices = https://www.jordanpass.jo/Contents/Prices.aspx (title "Packages") · JP-FAQ = https://www.jordanpass.jo/Contents/FAQs.aspx · JP-Sites = https://www.jordanpass.jo/Contents/Jordan_Attractions.aspx (title "Included Attractions")
- Sariyah = https://sariyahexpress.com/airport-express/ (title "Airport Express - Sariyah", operator's own site; found by WebSearch after `www.sariyah.com` did not resolve)

| id | field | value | method | sourceUrl | quote (≤ 200 chars, verbatim) | verifiedOn | nextCheck | result |
|---|---|---|---|---|---|---|---|---|
| places/petra.ticket | jod (1/2/3 days) | 50 / 55 / 60 | web | Petra | "Accommodated Visitors One Day 50 JD" · "Two Days 55 JD" · "Three Days 60 JD" | 2026-09-30 | 2026-12-29 | confirmed (MoTA agrees: `يوم واحد فقط \| 50`, `يومان \| 55`, `3 أيام \| 60` for البترا) · **applied 2026-09-30** |
| places/petra.ticket | notes (same-day, no overnight) | 90 | web | Petra | "One Day Visit (Non-Accomodated Visitors in Jordan) 90 JD" | 2026-09-30 | 2026-12-29 | confirmed (MoTA: `لزائر الأردن ليوم واحد فقط \| 90 \| 0 \| البترا`) |
| config/jordanPass | tiers | 70 / 75 / 80 | web | JP-Prices | Jordan Wanderer "70 JDs" · Jordan Explorer "75 JDs" · Jordan Expert "80 JDs" | 2026-09-30 | 2026-12-29 | confirmed · **applied 2026-09-30** |
| config/jordanPass | visa fee | 40 | web | JP-FAQ | "The fees for a single entry visa without the Jordan Pass are 40 JDs (about 60 USD)" | 2026-09-30 | 2026-12-29 | confirmed |
| config/jordanPass | visa waiver rule | 40 JOD waived, ≥ 3 nights, bought before arrival | web | JP-Prices | "Waiving of tourist entry visa fees if you purchase the Jordan Pass before arrival to Jordan and stay a minimum of two nights (3 days)." | 2026-09-30 | 2026-12-29 | confirmed — differs: page says **minimum 2 nights (3 days)**, JSON/spec say 3 nights. FAQ agrees: "it only waives the visa fees if you stay minimum of 2 whole nights (3 days) in Jordan". decision: controller (spec §4.5 + tests) · **applied 2026-09-30** |
| config/jordanPass | covered sites | list | web | JP-Sites | Page lists incl. "Petra", "Jerash", "Wadi Rum", "Amman Citadel", "Ajloun Castle", "Umm Qays", "Karak Castle", "Madaba Archaeological Park" | 2026-09-30 | 2026-12-29 | confirmed (Mount Nebo, Dana, Dead Sea not listed; matches coveredByJordanPass flags) |
| places/jerash.ticket | jod | 10 | web | MoTA | `يتضمن رسم دخول المتحف \| 10 \| 0.5 \| جرش` | 2026-09-30 | 2026-12-29 | confirmed · **applied 2026-09-30** |
| places/ajloun.ticket | jod | 3 | web | MoTA | `يتضمن رسم دخول المتحف \| 3 \| 0.25 \| قلعة عجلون` | 2026-09-30 | 2026-12-29 | confirmed · **applied 2026-09-30** |
| places/umm-qais.ticket | jod | 5 | web | MoTA | `شامل رسم دخول المتحف \| 5 \| 0.25 \| أم قيس` | 2026-09-30 | 2026-12-29 | confirmed · **applied 2026-09-30** |
| places/kerak.ticket | jod | 2 | web | MoTA | `يتضمن رسم دخول المتحف \| 2 \| 0.25 \| قلعة الكرك` | 2026-09-30 | 2026-12-29 | confirmed · **applied 2026-09-30** |
| places/amman.ticket | jod (Citadel) | 3 | web | MoTA | ` \| 3 \| 0.25 \| جبل القلعة` | 2026-09-30 | 2026-12-29 | confirmed · **applied 2026-09-30** |
| places/wadi-rum.ticket | jod (protected area) | 5 | web | MoTA | ` \| 5 \| 1 \| وادي رم` | 2026-09-30 | 2026-12-29 | confirmed — **changesReference** (reference "Bought separately" +5). decision: controller. (wadirum.jo refused connection; aseza.jo home does not state the fee) · **applied 2026-09-30** |
| places/madaba.ticket | jod | null | web | MoTA | `شامل رسم دخول المتحف \| 3 \| 0.25 \| متنزه مادبا الأثري` · Mount Nebo: ` \| 3 \| 0.5 \| جبل نيبو` | 2026-09-30 | 2026-12-29 | confirmed — differs: page says Archaeological Park **3** (in the Pass) + Mount Nebo 3 (not in the Pass); JSON has null. **changesReference** (+3). decision: controller. St George's (mosaic map) church fee not on the page · **applied 2026-09-30** |
| places/dana.ticket | jod | null | web | MoTA | `16% + ضريبة مبيعات \| 8 \| 6 \| 2.5 \| محمية ضانا للمحيط الحيوي` | 2026-09-30 | 2026-12-29 | confirmed — differs: page says **8 JOD + 16% sales tax** (≈ 9.28) for foreigners; JSON null. Proposed jod 8 with tax in notes. (rscn.org.jo/reserve/1 states no fee, only a trails PDF; wildjordan.com returned no content) · **applied 2026-09-30** |
| places/dead-sea.ticket | jod (Amman Beach day) | null | web | — | — | — | — | not confirmed — no official page (`ammanbeach.com` does not resolve; WebSearch finds only third-party sites quoting 10–25 JOD). On the phone list (#5) |
| places/aqaba.ticket | jod | 0 ("Beaches vary") | web | MoTA | `يتضمن رسم دخول المتحف \| 3 \| 0.25 \| قلعة العقبة / الحميمة / مسجد الشريف الحسين بن علي` | — | — | info only — Aqaba Castle 3 JOD exists but the JSON ticket describes beaches; no patch proposed |
| legs/amman-petra.options[0] | departs / cost | 06:30 / 10 | web | https://jett.com.jo/en | NOT STATED (times and fares only appear after using the booking form) | — | — | not confirmed — needs manual check with screenshot. Keeps existing `verified 2026-09-24` (team booking-system check) |
| legs/amman-aqaba.options[0] | departs / cost | — / 10–12 | web | https://jett.com.jo/en | NOT STATED | — | — | not confirmed — needs manual check with screenshot. (No `amman-aqaba` leg in legs.json as read at 2026-09-30; A8 may add it) |
| legs/AMM-amman.options[1] | Airport Express fare | null | web | Sariyah | "Ticket price is 3.4 JOD for passengers and 1.75 JOD for employees" | 2026-09-30 | 2026-12-29 | confirmed — differs: fare 3.4 JOD (JSON null). Schedule **not** confirmed as a timetable (page gives frequency, "Transfer times on Friday are hourly."), so no `departs` · **applied 2026-09-30** |
| legs/AMM-amman.options[0] | airport taxi fixed fare | 20–25 | web | — | NOT STATED | — | — | not confirmed — qaiairport.com returned 403; rj.com "Transportation To & From Qaia" names QAIA Airport Taxis but states no fare. Stays est |

## Phone / field checklist for the team (tomorrow morning)

These cannot be confirmed from the web. Each answer goes into this log with `method` = phone / whatsapp / field and the date.

| # | Who | Exact question to ask | JSON field it fills |
|---|---|---|---|
| 1 | Wadi Rum camp A (from its booking page) | "What do you charge for a private car from Wadi Musa (Petra) to your camp, arriving before 16:00, per car, for 1–3 people?" | `legs.json` → `petra-wadi-rum.options[0].cost` (min of the quotes) |
| 2 | Wadi Rum camp B | same question | same field (max of the quotes) → `status: "verified"`, `method: "whatsapp"`, `verifiedOn` |
| 3 | Private driver A (licensed, via hotel) | "Your full-day rate with car, 10 hours, Amman–Dead Sea–Madaba–Amman? And a one-way Amman → Dead Sea (Amman Beach) drop?" | fallback "Private driver day" range in the log → `legs.json` `amman-dead-sea.options[0].cost` |
| 4 | Private driver B | same questions | same fields (min/max of both drivers) |
| 5 | Amman Beach (Dead Sea) front desk | "What is today's day-use entry price per adult, and does it include towel/pool?" | `places.json` → `dead-sea.ticket.jod`, `label` "Amman Beach day use" |
| 6 | Tabarbour (North) station, Jerash minibus | "What time does the first and the last minibus leave for Jerash, and the fare?" (in person, photo of the sign) | `legs.json` → `amman-jerash.options[0]` `cost`, `notes`; add `departs` **only** if there is a fixed timetable (most leave when full → notes "leaves when full, first ~HH:MM, last ~HH:MM", no `departs`) |
| 7 | South station (Mujamma al-Janoubi), Madaba minibus | same questions for Madaba | `legs.json` → `amman-madaba.options[0]` `cost`, `notes` |
| 8 | JETT (call centre or Abdali counter, screenshot of the booking page) | "Amman Abdali → Wadi Musa: departure time(s) and adult fare? Amman → Aqaba: departure times and fare?" | `legs.json` → `amman-petra.options[0]` `departs`/`cost`, `amman-aqaba.options[0]` |
| 9 | QAIA airport taxi desk (arrivals) | "What is the fixed fare from the airport to central Amman (e.g. 3rd Circle), day and night?" | `legs.json` → `AMM-amman.options[0].cost` |
| 10 | St George's Church, Madaba (ticket desk) | "What is the entry fee for foreign visitors to see the mosaic map?" | `places.json` → `madaba.ticket.notes` |
