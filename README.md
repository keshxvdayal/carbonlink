# TradeCheck: pre-filing trade-document compliance

TradeCheck checks one shipment's export paperwork (commercial invoice, packing list, bill of lading, certificate of origin, shipping bill, letter of credit) **before** it reaches customs, the bank or the buyer, and produces a "fix before filing" report.

This is the MVP from the business plan: **features 1, 2, 3 and 8** (extraction, cross-document consistency, HS-code suggestion, risk score and checklist), plus a first cut of L/C discrepancy checks and a reviewer audit trail. That combination supports the productized-service offer: run the check, review the findings, then send the printed report.

## Quick start

```bash
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY for AI mode (optional)
npm run dev                    # http://localhost:3000
```

Click **"Shipment with errors"** on the home page to see a full report without uploading anything.

| Mode | When | Reads |
|---|---|---|
| **Offline** | no API key | `.txt` files and text-based PDFs laid out as `Label: value` lines (see `samples/`) |
| **AI** | `ANTHROPIC_API_KEY` set | any PDF, scans and phone photos (PNG/JPG/WEBP); also adds AI HS classification |

## How it works

```
upload ─► extract (Claude or offline parser) ─► normalized ExtractedDoc per file
                                                  │
         deterministic rules engine ◄─────────────┘
         • required fields per doc type      • arithmetic (qty × price, totals, net ≤ gross)
         • cross-doc consistency (consignee, ports, value, packages, weights, HS, containers…)
         • formats (IEC, GSTIN, ISO 6346 container check digit, HS length)
         • dates + L/C (latest shipment, expiry, amount, beneficiary/applicant, ports)
                                                  │
         HS review (Claude classification or offline reference table)
                                                  │
         risk score (critical 30 / major 12 / minor 4) ─► status ─► report + audit trail
```

**Design choice:** the AI only *reads* documents. Every pass/fail decision comes from plain rules in `src/lib/rules.ts`, so each finding has a rule ID and an explanation you can defend to a customer. The extraction prompt tells the model to copy values exactly and never "fix" them, because a silently corrected value would hide the very discrepancy you are looking for. Fields the model couldn't read clearly are flagged for human review.

## Project layout

| Path | What |
|---|---|
| `src/lib/types.ts` | Zod schema for extracted documents (also the Claude structured-output schema) |
| `src/lib/extract/claude.ts` | Claude extraction + HS classification (Opus 5.5, structured outputs, server-side refusal fallback) |
| `src/lib/extract/heuristic.ts` | Offline label/value + table parser |
| `src/lib/rules.ts` | The rules engine. **Add new checks here.** |
| `src/lib/hs.ts` | Small 6-digit HS reference table (offline fallback only) |
| `src/lib/pipeline.ts` | Orchestration, risk score, status |
| `src/lib/store.ts` | JSON-file storage in `./data/checks` |
| `src/app/api/checks` | `POST` (multipart `files[]` or `sample=clean|discrepant`), `GET` list, `GET/PATCH/DELETE /:id` |
| `samples/` | A clean shipment set and the same set with 9 planted errors |
| `tests/engine.test.ts` | Engine tests: clean set → no serious findings; every planted error caught |

```bash
npm test         # engine tests (offline, no API cost)
npm run build    # production build
```

## Known limits (read before showing a customer)

- **The AI path hasn't been run against the live API yet.** It type-checks against the SDK, but it was built without an API key. Run the samples and a few real scanned sets in AI mode before a pilot.
- **HS suggestions are advisory.** The offline table is about 35 common headings at the 6-digit level, with no duty or incentive rates. Always confirm against the current ITC-HS schedule.
- **Storage is JSON files** on one machine. Move to Postgres plus auth before more than one user or server.
- **No sanctions screening, document generation or ERP integrations yet** (features 5, 7 and 9). Add them when paying pilots ask.
- Uploaded documents are sent to the Anthropic API in AI mode. Put that in your customer terms.

## Next steps that map to the plan

1. Run 20–30 real (anonymized) document sets. For every miss or false positive, add or tune a rule in `rules.ts` and a test case. The tests are your accuracy record.
2. Track reviewer "false positive" marks per rule ID (already in the audit data) to find noisy rules.
3. Then: L/C clause parsing (feature 4 in full), denied-party screening (5), a corrected-document draft (7).
