# How Darb verifies data

**Principle: verified = source + date + method.** A price or schedule gets a ✓ only when we can say *where* it was confirmed
(`sourceUrl`), *when* (`verifiedOn`) and *how* (`method`). Everything else is shown as `est.` with a range.
A verified value older than 90 days is shown as `est.` automatically (engine and dashboard freshness), and CI fails
when a verified value has no source or is older than 90 days.

## Methods
| method | meaning | can be `verified`? | evidence we keep |
|---|---|---|---|
| `web` | read on the operator's or authority's official page | yes | URL + verbatim quote in [`docs/data/verification-log.md`](data/verification-log.md) |
| `phone` | called the operator | yes | who, number called, date, answer in the log |
| `field` | seen on site (station sign, ticket office) | yes | photo, date, place in the log |
| `operator` | the data owner changed it in `/admin` | yes | `operatorUpdates` entry (who, when, from → to) |
| `whatsapp` | written quote from a driver or camp | no, stays `est.` | screenshot of the quote; range = min/max of at least 3 quotes |
| `web-est` | an operator's own page states it, but it is one company and not an official tariff | no, stays `est.` | URL + quote in the log |

The list is enforced by `scripts/check-data.mjs` (unknown values fail) and by `/admin` (a leg option cannot be saved as
`verified` without a method in the first four rows, a Source URL and a Verified-on date).

## Sources actually used (pass of 30 Sep 2026)
| data | source | method |
|---|---|---|
| Site entry fees (Citadel, Jerash, Ajloun, Umm Qais, Kerak, Wadi Rum, Madaba, reserves) | Ministry of Tourism fee table, mota.gov.jo (page dated 29 Sep 2026) | web |
| Petra tickets (1/2/3 days, same-day 90 JOD) and opening hours | visitpetra.jo | web |
| Jordan Pass tiers, visa waiver rule, covered sites | jordanpass.jo (Prices, FAQs, Included Attractions) | web |
| Public bus and minibus fares (Amman–Petra, Amman–Aqaba, Tabarbour → Jerash, Wihdat → Madaba, Amman → Dead Sea, Aqaba lines) | Land Transport Regulatory Commission (LTRC) licensed-line fare list, ltrc.gov.jo. **Official fares only, no timetables.** | web |
| JETT Amman → Petra 06:30, 10 JOD | JETT booking system, one manual dated check with screenshot (24 Sep 2026) | web |
| Airport Express bus timetable | operator's own site, sariyahexpress.com | web |
| Rum Bus shuttle | operator's own site (Wadi Rum Nomads); one company | web-est |
| Transfers, private drivers, Dead Sea day use, camp prices | no official page | stays `est.`; range from quotes when we have them (`whatsapp`) |
| Drive times | Google Maps, departure 08:00 on a weekday, recorded by hand (no API) | web |

Items first planned as phone or field checks were replaced by web research wherever an official page exists (Ministry,
LTRC, visitpetra.jo, jordanpass.jo, Sariyah). Where none exists (minibus frequencies, transfers, Dead Sea day use) the
value remains `est.` and no timetable is invented.

**No scraping.** We never scrape or automate jett.com.jo or any booking system. Every check is a manual, dated read by one of us,
logged with evidence in the verification log.

## The 90-day rule in CI
`scripts/check-data.mjs` reads `public/data/places.json` and `legs.json` and fails when a `verified` value has no
`https://` `sourceUrl`, no `verifiedOn`, a `verifiedOn` older than 90 days, or an unknown `method`. It also runs inside
`node scripts/run-tests.mjs`. Values verified on 30 Sep 2026 expire on **2026-12-29**, so the check turns red from
**2026-12-23** on and stays red until values are re-verified (or downgraded to `est.`), which is the reminder.

## Cadence
- Every verified value is re-checked within **90 days** (`nextCheck` column of the log).
- **Monthly review** (first Monday): go through the log, re-check anything with `nextCheck` in the next 30 days, and
  compare with traveller confirmations (below).

## Data owners (admin.html)
Operators (JETT, PDTRA, reserves) sign in at `/admin` and edit their own legs: cost, departure time, status,
verified-on date, notes, **Source URL** and **Method**. Each change is written to `operatorUpdates` (who, when, from → to)
and shown on the dashboard. Accounts are added with `node scripts/seed.mjs admin <email>`. Ticket prices (`places`) and
labels are edited in `public/data/*.json` by the team and re-seeded.

## Traveller confirmations
After a trip, the shared plan asks "Was this transport there? Yes / No" per leg (`confirmations` collection). Answers do
not change prices. A leg with repeated "No" answers is re-checked first at the monthly review. A "Yes" is a signal, never a
substitute for a source.

## Next step (not implemented): evidence files in Firebase Storage
Screenshots and photos would be uploaded by data owners to Firebase Storage under `evidence/<legId|placeId>/<date>.png`
and linked from the value as `evidenceUrl`. Sketch of the rules (public read, admins write):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /evidence/{item}/{file} {
      allow read: if true;
      allow write: if request.auth != null
        && firestore.exists(/databases/(default)/documents/admins/$(request.auth.token.email))
        && request.resource.size < 2 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```
