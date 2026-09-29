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

## Pass 2 — 30 Sep 2026 (web research, no calls)

Goal: answer the phone/field checklist above from the web, where an official page allows it. Single reads (WebSearch + WebFetch,
plus a `curl` of three public pages/PDFs to quote them exactly). No booking forms, no scraping loops. Proposed edits are in
`docs/data/verified-patch-2.json` (11 entries, all **applied on 2026-09-30**, plus the controller rulings listed under "Extra facts"). Same honesty rule: `verified` only when the operator /
authority states the value; otherwise `est` with a named source (`method: "web-est"`).

**New official source found: LTRC fare lists.** The Land Transport Regulatory Commission (هيئة تنظيم قطاع النقل البري) publishes
the regulated fare for every licensed public-transport line as PDFs on its fare-list page (قوائم الأجور, "اخر تعديل 2026/07/30"):
LTRC-List = https://ltrc.gov.jo/Ar/List/%D9%82%D9%88%D8%A7%D8%A6%D9%85_%D8%A7%D9%84%D8%A3%D8%AC%D9%88%D8%B1 ·
LTRC-Main = https://ltrc.gov.jo/ebv4.0/root_storage/ar/eb_list_page/%D8%A7%D9%84%D8%AE%D8%B7%D9%88%D8%B7_%D8%A7%D9%84%D8%B1%D8%A6%D9%8A%D8%B3%D9%8A%D8%A9_.pdf
(«الخطوط الرئيسية», 14 pages, PDF created 7 May 2026). Columns, quoted in this order: `وحدة التعرفة المستخدمة | فئة المركبة | التعرفة الحالية المستخدمة | مسار الخط | اسم الخط`
(unit | vehicle class | current tariff | route | line name). حافلة متوسطة = midibus/minibus, حافلة عمومية = full-size bus. The tariff gives
**fares only — no timetables or frequencies.**

### Results per target

| # | Target (field) | Searched | Best URLs · quote (≤ 200 chars) | Decision |
|---|---|---|---|---|
| 1 | `petra-wadi-rum.options[0].cost` (35–45) | "Wadi Rum camp transfer from Petra Wadi Musa price JOD per car"; camp sites | wadirumnomads.com/helpful-information/getting-there-and-away (camp/tour operator, 11 Mar 2025): "From Wadi Musa (Petra) to Wadi Rum: 2 hours. Costs 40 JOD per car." · wadi-rum-fire-camp.com transfer page: price shown only as "NZ$138.00" (geo-converted), "priced on a per-taxi basis", "maximum 4 guests per sedan car" · jordan-spirit.com/guides/getting-around-jordan (2026): Petra to Wadi Rum "35–50 JOD" | **est — range kept 35–45**, source + sourceUrl attached. One camp's own price is not a tariff for "your camp or a licensed driver"; sources span 35–50. Reference total unchanged. · **applied 2026-09-30** |
| 2a | Private driver full day from Amman (fallback "Private driver day", no leg field) | "private driver Jordan full day rate Amman JOD" | jordan-spirit.com (2026): "120–150 USD per day" · getyourguide private driver: "from $205 per group up to 3 people for 8 hours" (reseller) · jordan-car-and-driver.com: 403 | **unchanged** — nothing official; figures are in USD/reseller prices. |
| 2b | `amman-dead-sea.options[0].cost` (25–35) | same + "Amman to Dead Sea taxi one way" | continenthop.com/blog/amman-to-dead-sea (2026): "Getting from Amman to Dead Sea by taxi would cost you around 20-25 JD for a one-way trip." · jordan-spirit.com (2026): "approximately 20–30 JOD" · TripAdvisor forum digest: "around 25 JOD for a one way" | **est-narrowed 25–35 → 20–30** (not on the reference trip). · **applied 2026-09-30** |
| 3 | `places/dead-sea.ticket` (Amman Beach, jod null) | "Amman Beach Dead Sea entrance fee"; "official website" | No operator site found (pass 1: ammanbeach.com does not resolve). continenthop.com (2026): "The entrance fee to the Dead Sea public beach/ Amman beach costs 25 JD." · wowjordan.com/en/dead-sea-day-pass-prices (23 Oct 2025): "usually charge around 10 – 15 JOD per person" · TripAdvisor reviews: 20 JD | **est — jod stays null**; notes "guides report 10–25 JOD" + source. Too wide to pick a number honestly. · **applied 2026-09-30** |
| 4a | `amman-jerash.options[0]` (minibus, cost null) | "Amman to Jerash bus North station Tabarbour fare"; LTRC tariff | LTRC-Main: `دينار \| حافلة متوسطة \| 1.10 \| عمان(مجمع الشمال)/جرش \| عمان(مجمع الشمال)/جرش` · also `دينار \| حافلة عمومية \| 1.10 \| عمان(مجمع الشمال)/جرش` · guides: "1 JD"–"1.1 JD", "frequent buses" | **verified cost 1.10** (method web, LTRC). Frequency: not on any official page → notes "leaves when full", **no departs**. · **applied 2026-09-30** |
| 4b | `amman-madaba.options[0]` (minibus, cost null) | "Amman to Madaba minibus South station Wihdat fare"; LTRC | LTRC-Main: `فلس \| حافلة متوسطة \| 600 \| عمان(مجمع الجنوب)/مادبا \| عمان(مجمع الجنوب)/مادبا` · guides 0.45–1 JD (old) | **verified cost 0.60** (600 fils). No departs. · **applied 2026-09-30** |
| 5a | `amman-aqaba.options[0]` JETT (8–12, est) | "JETT bus Amman Aqaba schedule fare"; Arabic "جت مواعيد رحلات عمان العقبة"; jett.com.jo pages | jett.com.jo/en/schedule → **404**; /en/live-schedule → placeholders only ("--:--"); /en/programs → no fares; homepage → booking form only · 12go.asia/en/travel/amman/aqaba-jett: "JOD 9.41, though some departures are priced at JOD 10 or JOD 12" · LTRC-Main: `دينار \| حافلة عمومية \| 10.10 \| مجمع الجنوب الجديد - العقبة \| عمان-العقبة` (a regulated public-bus line, not JETT-specific) | **est-narrowed 8–12 → 9–12**, sources named. No departs (reseller times are not official). · **applied 2026-09-30** |
| 5b | `amman-petra.options[0]` JETT re-confirmation | "JETT Amman Petra Wadi Musa 6:30 fare 10 JD 2026" | No official static JETT page states it (same 404/empty pages as 5a). Guides: "departing at 6:30 am from Abdali and at 7:00 am from the 7th Circle", "10 JD" · LTRC-Main: `دينار \| حافلة عمومية \| 10.10 \| عمان - البتراء \| عمان - البتراء` | **unchanged** — keeps `verified 2026-09-24` (booking-form screenshot). The LTRC line is consistent (regulated 10.10) but is not JETT's own statement, so it is logged only. |
| 6 | `AMM-amman.options[0]` airport taxi (20–25) | "Queen Alia airport taxi fixed fare"; qaiairport.com; rj.com; visitjordan.com | qaiairport.com → **403** · rj.com "to-from-qaia": names the taxi kiosk, no fare · international.visitjordan.com/page/23/airports (JTB): "the fare is about 15 JDs (equivalent to around $22)" — outdated · alongdustyroads.com: "The current price (correct as of February 2024) is 22.50 JD (£26 / $32) per vehicle." · jordan-spirit.com (2026): "25–30 JOD … (metered)", night "30–35 JOD" | **est — range kept 20–25**, source/notes added (22.50 reported 2023–24). Not verified: no official tariff page readable; the JTB figure contradicts all recent reports. · **applied 2026-09-30** |
| 7 | `AMM-amman.options[1]` Airport Express timetable | sariyahexpress.com (curl of the page table); search "Sariyah Airport Express timetable" | sariyahexpress.com/airport-express: "Airport Express Bus Departure Schedule \| Departure from Amman (North Complex) \| Departure from the airport (Arrivals station) \| 6:15 AM \| 6:00 AM \| 6:30 AM \| 7:00 AM …" · "Transfer times on Friday are hourly." | **verified (notes refresh)**. Pass 1 missed it: the page **does** publish a timetable. From the airport: 06:00, 07:00, every 30 min 08:00–18:00, then hourly 19:00–05:00. From North Complex: every 30 min 06:15–17:30, then hourly 18:00–00:00. Written into `notes`; **no `departs`** (the engine reads a single `departs` as "one daily departure"). Also: RJ says its own City Terminal shuttle (7th Circle) is "JOD 4 per passenger" every 30 min; JTB page says "JOD3.00" (outdated). · **applied 2026-09-30** |
| 8a | `wadi-rum-aqaba.options[0]` (25–35) | wadirumnomads.com "how to leave" | wadirumnomads.com/how-to-leave-wadi-rum (23 Mar 2025): "A taxi transfer from Wadi Rum to Aqaba City takes about 1 hour and costs 25 JOD per car." · "A taxi to Aqaba Airport costs 35 JOD per car." · LTRC-Main: `دينار \| حافلة متوسطة \| 5.10 \| العقبه - وادي رم` | **est-narrowed 25–35 → 25–30**. · **applied 2026-09-30** |
| 8b | `petra-aqaba.options[0]` (45–60) | "Petra to Aqaba taxi price JOD" | TripAdvisor forum digests: "a taxi from the port area/South Beach to Petra would cost 45 JOD", "50 JD per transfer" · jordan-spirit.com: "80–100 JOD" (outlier) · LTRC-Main: `دينار \| حافلة متوسطة \| 2.30 \| العقبة - وادي موسى` and `دينار \| حافلة عمومية \| 6.10 \| العقبه - البتراء` | **est — range kept 45–60**, named sources replace "team estimate". Weak (forum digests). · **applied 2026-09-30** |
| 8c | `amman-kerak.options[0]` minibus (cost null) | "Amman to Kerak bus South station fare"; LTRC | LTRC-Main: `دينار \| حافلة متوسطة \| 2.30 \| عمان(مجمع الجنوب الجديد)/(مجمع الكرك الجديد) \| …` and `دينار \| حافلة عمومية \| 2.30 \| عمان/الكرك \| عمان/الكرك` · wikivoyage (Oct 2018): "2.25 JD … about 2 hours" | **verified cost 2.30**. durationText stays "To verify" (no official duration). · **applied 2026-09-30** |
| 8d | `amman-kerak.options[1]` private driver (40–55) | same | nothing found | **unchanged**. |
| 8e | `dana-petra.options[0]` (40–55) | "Dana to Petra taxi price JD" | TripAdvisor Dana forum: "The price should be around 25 JOD" — posted ~2010 · search digest "25–35 JOD" (unattributed) · theorangebackpack.nl: no price | **unchanged** — evidence 14 years old; not good enough to move the range. |
| 8f | `AQJ-aqaba.options[0]` (8–12) | "Aqaba airport taxi fare"; ASEZA (Arabic) | welcomepickups: "€12 (JOD 10)"; trip.com (ar): "متوسط تكلفة الرسوم 15 دينار"; no ASEZA tariff page found | **unchanged**. |
| 9a | Jordan Pass purchase timing | jordanpass.jo FAQs | jordanpass.jo/contents/FAQs.aspx: "If you purchase the Jordan Pass before your arrival to Jordan you can benefit from the entry visa fees exemption if you stay a minimum of two nights." · "When you are leaving the country the immigration system at the airport will check if you stayed more than 2 nights, if not, you will be directed to an office to pay the fees." · "valid for use within 3 months following date of purchase … expire after 1 month of the first time it is scanned" | **confirmed** (already applied in pass 1: 2 nights, before arrival). No patch. |
| 9b | Petra same-day 90 JD (`petraSeparateJod.sameDayNoOvernight`) | visitpetra.jo/en/Petrafees | "One Day Visit (Non-Accomodated Visitors in Jordan) 90 JD" · "Two-day and three-day admission tickets must be used on consecutive days" · "Daytime admission tickets and the Jordan Pass do not include admission to Petra by Night" | **confirmed** (90). The FAQ of jordanpass.jo does not mention it. No patch. |

Counts: **verified 4** (Jerash / Madaba / Kerak minibus fares from LTRC; Airport Express timetable notes) · **est-narrowed 3**
(Amman → Dead Sea, JETT Amman → Aqaba, Wadi Rum → Aqaba) · **est, range kept, source attached 4** (Petra → Wadi Rum,
airport taxi, Petra → Aqaba, Amman Beach ticket notes) · **unchanged 6** (private driver day, JETT Amman → Petra, Kerak
driver, Dana → Petra, AQJ taxi, and #10 of the checklist — St George's Church fee, not found on any official page this pass).

Impact check (dry run on a scratch copy with the patch applied; confirmed after applying — 40/40 tests, data check ok, `web-est` added to check-data methods): `scripts/check-data.mjs` passes; 38/39 test cases pass.
The failing one is expected: `test-cases.js` "Legs: new est. legs, …" asserts **all** options of the newly added legs are
`est` without times — `amman-kerak.options[0]` becomes verified (still no `departs`). The controller must update that
assertion (e.g. exclude the Kerak minibus or assert it is verified with no times). Reference trip 58 → 94, Pass
Explorer 75 / 116 and the 305–385 total are unaffected (no reference-trip leg changes its cost range).

### Extra facts (not in the data model yet)

- **Petra opening hours** — visitpetra.jo/en/Openinghours: summer "(March 2 - October 1, 2026) Site & Visitor Center: 06:00 - 18:00",
  winter "(October 2, 2026 - March 1, 2027) Site & Visitor Center: 06:30 - 17:00"; Little Petra ticket office 07:00–16:00 / 07:00–14:00.
  Relevant to a sunset or late-arrival rule and to the 05 leg page; winter hours start **2 Oct 2026**.
- **Public bus Amman → Dead Sea exists** — LTRC-Main: `فلس | حافلة متوسطة | 950 | عمان(مجمع المهاجرين)/العدسية/الروضه/الرامه/سويمه/استراحة البحر الميت | عمان(مجمع المهاجرين)/استراحة البحر الميت`
  (0.95 JOD, Muhajireen station → Dead Sea rest house via Suweimeh). `amman-dead-sea.publicTransport` was `"none"`. Continenthop adds
  a 4–5 JOD taxi from Suweimeh to Amman Beach. **Controller decision:** leave as is (it's not a practical beach day without a taxi at the
  end), or change to `"limited"` + add an est. option — that changes NO_PUBLIC_TRANSPORT behaviour, so it needs a test.
  **Applied 2026-09-30 (controller):** `publicTransport: "limited"` + option "Minibus from Muhajireen station" 0.95 JOD **verified** (LTRC-Main,
  method web), no `departs`, not recommended (taxi stays recommended). "Take the bus to the Dead Sea" from Amman is no longer nf (test added);
  the NO_PUBLIC_TRANSPORT test now uses Madaba → Dead Sea. Reference trip unchanged (58 → 94).
- **Other regulated lines** (LTRC-Main): Aqaba – Wadi Rum midibus 5.10; Aqaba – Wadi Musa midibus 2.30; Aqaba – Petra bus 6.10;
  Karak – Wadi Musa midibus 2.65; Amman (North) – Ajloun 1.25 (via Jerash); Amman – Petra bus 10.10; Amman – Aqaba bus 10.10 (also 6.50
  / 5.70 for other classes on line `عمان/العقبة`). All fares, none has a timetable.
- **Dana entry: two official pages disagree.** MoTA (last modified 2026/09/29): 8 JOD + 16 % (applied in pass 1). JTB
  international.visitjordan.com/page/17/entrance-fees (undated): `Dana Biosphere Reserve | 2 JD | 5 JD | 10 JD | Plus 16% tax`.
  Recommendation: keep MoTA's 8 (dated, ministry) but consider adding "(the JTB page lists 10)" to the note. Controller decision.
  **Applied 2026-09-30:** jod stays 8; notes add "The Jordan Tourism Board page lists 10 JOD + tax; the Ministry table (29 Sep 2026) says 8 — Darb uses the Ministry figure."
- **Wadi Rum** — JTB fees page `Wadi Rum | 1 | 5` agrees with MoTA 5. Guides (waditribe.com, not official): Jordan Pass holders
  show the pass at the Visitor Centre; "additional fee of 25 JD if you are entering with a vehicle that you intend to use in the desert";
  parking at the Visitor Centre is free. Not official — no patch.
- **Rum Bus** (Wadi Rum Nomads' own service): pick-up in Wadi Musa "between 6:00 and 6:30 AM … to our office in Wadi Rum Village by
  around 9:00 AM. Tickets cost 10 JOD per person." Operator-stated, one company; arrives in the morning so it could serve the Petra → Wadi Rum
  day if the traveller leaves Petra early. Candidate option for `petra-wadi-rum` (controller decision; would affect the Day 3 story).
  **Applied 2026-09-30:** option "Rum Bus shared shuttle (Wadi Musa 06:00–06:30)" 10 JOD per person, **est** (`method: "web-est"`, one operator,
  sourceUrl https://www.wadirumnomads.com/helpful-information/getting-there-and-away/ — quote re-read 30 Sep 2026: "picks you up from your
  accommodation in Wadi Musa between 6:00 and 6:30 AM and brings you to our office in Wadi Rum Village by around 9:00 AM. Tickets cost 10 JOD per person."),
  not recommended — the pre-arranged transfer stays recommended; reference Day 3 still uses the transfer, 94 unchanged.
- **Jordan Pass validity**: "valid for use within 3 months following date of purchase … expire after 1 month of the first time it is scanned".
- **JTB airports page is stale** (taxi "about 15 JDs", bus "JOD3.00", bus to "Amman's southern terminal") — don't cite it.

### Where the numbers live (how a data owner edits them)

`/admin` edits **legs only**: per option it shows *cost min*, *cost max*, *departs* (HH:MM), *status* (verified / est.),
*verified on*, *notes*, *source URL* and writes `legs/{id}` + an `operatorUpdates` doc. It does **not** edit `source` (the text
label), `method`, `label`, `durationText`, `publicTransport`, or anything in `places` / `config` — those change only in
`public/data/*.json` + `node scripts/seed.mjs` (which overwrites whole docs, including admin edits). "verified" in /admin requires
a Verified-on date and an https Source URL.

| Data field | Where to edit | Leg id → option label → field(s) |
|---|---|---|
| Airport taxi QAIA → Amman | /admin | `AMM-amman` → "Airport taxi" → cost min/max, notes, source URL |
| Airport Express fare / timetable | /admin | `AMM-amman` → "Airport Express bus" → cost min/max, notes (timetable text), verified on, source URL. Leave *departs* empty (frequent service) |
| JETT Amman → Petra time / fare | /admin | `amman-petra` → "JETT bus Abdali → Wadi Musa" → departs, cost min/max, status, verified on, source URL |
| Private driver Amman → Petra | /admin | `amman-petra` → "Private driver" → cost min/max |
| Petra → Wadi Rum transfer | /admin | `petra-wadi-rum` → "Pre-arranged transfer" → cost min/max, notes, source URL |
| Minibus Amman → Jerash | /admin | `amman-jerash` → "Minibus from North station (Tabarbour)" → cost, notes, status, verified on, source URL |
| Taxi Amman → Jerash | /admin | `amman-jerash` → "Taxi / driver" → cost min/max |
| Taxi Amman → Dead Sea | /admin | `amman-dead-sea` → "Taxi / driver" → cost min/max, notes, source URL |
| Minibus Amman → Madaba | /admin | `amman-madaba` → "Minibus from South station" → cost, notes, status, verified on, source URL |
| Taxi Amman → Madaba | /admin | `amman-madaba` → "Taxi / driver" → cost min/max |
| Madaba → Dead Sea driver | /admin | `madaba-dead-sea` → "Driver (combine with Nebo)" → cost min/max |
| Jerash → Dead Sea driver | /admin | `jerash-dead-sea` → "Private driver" → cost min/max |
| Amman → Umm Qais | /admin | `amman-umm-qais` → "Bus to Irbid + minibus to Umm Qais" / "Private driver" → cost, notes |
| Amman → Dana driver | /admin | `amman-dana` → "Private driver" → cost min/max |
| JETT Amman → Aqaba | /admin | `amman-aqaba` → "JETT bus Amman → Aqaba" → departs, cost min/max, status, verified on, source URL |
| Amman → Aqaba driver | /admin | `amman-aqaba` → "Private driver day" → cost min/max |
| Petra → Aqaba driver | /admin | `petra-aqaba` → "Private driver" → cost min/max, notes, source URL |
| Wadi Rum → Aqaba | /admin | `wadi-rum-aqaba` → "Taxi / driver" → cost min/max, notes, source URL |
| Minibus Amman → Kerak | /admin | `amman-kerak` → "Minibus from South station" → cost, notes, status, verified on, source URL (durationText only in JSON) |
| Amman → Kerak driver | /admin | `amman-kerak` → "Private driver" → cost min/max |
| Dana → Petra driver | /admin | `dana-petra` → "Private driver" → cost min/max, notes |
| Aqaba airport taxi | /admin | `AQJ-aqaba` → "Airport taxi" → cost min/max |
| Rental car (any leg) | /admin | e.g. `amman-petra` → "Rental car" → cost min/max (costUnit "per day + fuel" only in JSON) |
| Site tickets (Petra, Jerash, Wadi Rum, Dana, Amman Beach …) | JSON + seed | `public/data/places.json` → `places[id].ticket` (`jod`, `status`, `verifiedOn`, `sourceUrl`, `notes`) |
| Jordan Pass tiers, visa, nights rule | JSON + seed | `public/data/jordan-pass.json` → `config/jordanPass` |
| Fallback taxi/driver formula (0.30–0.40 JOD/km, min 15/20) | code + JSON `_meta` | `public/js/engine/model.js` (§4.2) |

Suggestion (not done here): add places-ticket editing to /admin so MoTA/visitpetra prices can be refreshed every 90 days without a re-seed.

### Phone/field checklist — status after pass 2

| # | Status |
|---|---|
| 1–2 Wadi Rum camps | partly answered by web (40 JOD per car, one operator); still worth two WhatsApp quotes to make it `method: "whatsapp"` verified |
| 3–4 Private drivers | not answered (only USD/reseller prices online) — still needed |
| 5 Amman Beach | not answered — still needed (no official page) |
| 6 Tabarbour → Jerash | **fare answered** (LTRC 1.10); first/last departure still needs a field check |
| 7 South station → Madaba | **fare answered** (LTRC 0.60); times still field-only |
| 8 JETT | not answered by any official static page — booking-form screenshot remains the only route |
| 9 QAIA taxi desk | not answered (qaiairport.com 403) — still needed |
| 10 St George's Church | not answered — still needed |
