# CarbonLink: supplier emissions data engine for CBAM

CarbonLink helps an Indian exporter (or tier-1 manufacturer) collect **verifier-ready embedded-emissions data from 20–200 small suppliers**. The goal is to stop paying CBAM default-value penalties (+10% in 2026, +20% in 2027, +30% from 2028).

Suppliers get a WhatsApp link to a mobile page in their own language and upload photos of their bills. AI reads the bills, a rules engine checks them, and the exporter gets per-product embedded emissions, a savings figure, and an evidence pack a verifier can sample.

## Quick start

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY to read scanned bills and photos (optional)
npm run dev                  # http://localhost:3000 → click "Load demo"
```

| Mode | When | Reads |
|---|---|---|
| **Offline** | no API key | `.txt` and text-based PDFs laid out as `Label: value` lines (see `samples/`) |
| **AI** | `ANTHROPIC_API_KEY` set | any PDF, scans and phone photos (JPG/PNG/WEBP) of DISCOM bills, fuel invoices, weighbridge slips, handwritten registers |

```bash
npm test        # engine tests: hand-checked numbers, every planted data problem caught, audit-chain tamper test
npm run build
```

### The demo workspace (a fastener cluster)

| Supplier | What it shows |
|---|---|
| Shakti Wire Rod Mills (Punjab) | Clean data, grade A. Wire rod at **1.17 tCO₂/t actual vs 3.10 default** |
| Ludhiana Precision Fasteners | Buys rod from Shakti, **linked by passport** (multi-tier). Planted problems: duplicate bill upload, missing August bill, illegible handwritten "23?" in the register |
| Gujarat Alu Extrusions | Staff-colony meter mixed into the factory bill (intensity flag), rooftop solar claimed without a PPA, billets still on default values |
| Sri Balaji Cement Grinding | Invited, nothing uploaded. Shows the WhatsApp invite flow |

## What's built

Your MVP (features 2, 4, 6, 8) plus the other six features, and nine extras aimed at the gaps that crowded exporter-level CBAM tools leave open.

| # | Feature | Where |
|---|---|---|
| 1 | Supplier invite + mobile portal, 5 languages (EN, हिन्दी, ગુજરાતી, தமிழ், ਪੰਜਾਬੀ) | `/s/[token]`, `src/lib/i18n.ts` |
| 2 | AI extraction of bills, invoices, slips, registers (scans and photos) | `src/lib/extract/claude.ts` |
| 3 | Product → CN code + production-route mapping | Products tab, `src/lib/factors.ts` |
| 4 | Embedded-emissions calculation per product | `src/lib/calc.ts` |
| 5 | 19 data-quality and anomaly rules (intensity screening, gaps, overlaps, duplicates, yield / mass balance…) | `src/lib/flags.ts` |
| 6 | Evidence vault: every number → source document + verbatim quote + SHA-256 | Data & evidence tab |
| 7 | Verifier workspace: per-value accept/query, sign-off, printable pack | `/verify/[token]` |
| 8 | Default-vs-actual cost simulator, 2026–2034 | `/simulator`, `src/lib/simulator.ts` |
| 9 | Buyer exports: XLSX laid out after the EU communication template, CSV, JSON | `src/lib/export.ts` |
| 10 | Supplier scorecard, reduction ideas, UK CBAM scope tag | Overview tab, `src/lib/suggestions.ts` |

### The extras (the USPs)

1. **Carbon Passport (network effect).** A supplier fills in its data once and shares one public link with every buyer (`/passport/[token]`). Competitors sell to one exporter at a time; a passport makes each supplier you onboard useful to the next exporter who buys from them.
2. **Multi-tier roll-up.** A fastener maker's wire-rod precursor links to the rod mill's passport, and the mill's actual figure flows into the fastener's footprint automatically (`makeResolver` in `pipeline.ts`). This is the supply-chain depth that exporter-level tools don't reach.
3. **WhatsApp-first invites** in the supplier's language (`wa.me` deep link with a pre-written message). MSME owners answer WhatsApp, not email.
4. **Tamper-evident evidence.** Files are stored by SHA-256, and the audit log is hash-chained (`store.ts`). A verifier can **re-compute each file's hash in their own browser**. This targets your "verifiers distrust the pack" risk directly.
5. **Verbatim source quotes.** The AI must return the exact text each number came from, so a verifier samples in seconds.
6. **Sign-off gates.** A verifier can't sign while queries or critical flags are open, and verified data is locked against supplier edits.
7. **Savings pitch generator.** The simulator writes a one-line ₹ pitch for LinkedIn or the export manager (your channel plan).
8. **Offline mode.** The demo and the tests run with no API cost, which helps for sales demos on a bad connection.
9. **Settings with an audit trail.** Every factor (grid EF, ETS price, default-value overrides) is editable, and every change is logged for the advisor.

## How the numbers are calculated

```
Direct (installation)  = Σ fuel × NCV × EF (IPCC 2006)  +  electrodes × 3.66
Indirect               = grid MWh × grid EF (CEA)       (renewables need PPA evidence → flagged)
Per product p          = installation total × mass share of p           ← simplification
                       + Σ precursor tonnes × precursor SEE (default / actual / linked passport)
SEE_p                  = that ÷ output_p
Priced by CBAM         = direct only (steel, aluminium, hydrogen) | direct + indirect (cement, fertilisers)

Simulator: certificates/t = max(0, SEE − benchmark × free-allocation share(year))
           default SEE    = EU default × (1 + mark-up(year));  actual cost capped at default cost
           saving         = (default − actual certificates) × tonnes × (€ price − India carbon price)
```

The free-allocation deduction depends on the benchmark, not on the reported figure. So every tonne of CO₂ a supplier proves it didn't emit is saved at the full certificate price; that is the sales argument.

**Design choice:** AI only *reads* documents. Every number and every flag comes from plain, deterministic code a verifier can re-perform.

## Known limits (read before showing a customer)

- **Default values and benchmarks are ILLUSTRATIVE.** Load the EU's official default values for India in **Settings → Default value overrides**, and replace the sector benchmarks in `factors.ts`. Until then, savings figures are indicative only.
- **Methodology is simplified.** It uses mass-based attribution between products of one installation, purchases treated as consumption (no stock change), and one installation per supplier. A CBAM advisor must review `calc.ts` and `factors.ts` before a pilot. This is your "methodology risk" from the plan.
- **The workbook is not the official EU template file.** It mirrors the template's sections; copy it into the Commission's current `.xlsx` before filing.
- **The AI path hasn't been run against the live API.** It type-checks against the SDK and mirrors the TradeCheck extractor, but it was built without a key. Run 20 real anonymised bills (step 3 of your 30-day plan) and record accuracy.
- **No login.** Exporter pages are open; supplier, verifier and passport views use secret links. Add auth and Postgres (storage is `./data/db.json`) before a second customer.
- **The translations are machine-drafted.** Have a native speaker from each cluster review `i18n.ts`.
- **HEIC photos** (the iPhone default) are rejected with instructions; add conversion if pilots use iPhones.
- Uploaded documents go to the Anthropic API in AI mode. Put that in your supplier terms.

## Project layout

| Path | What |
|---|---|
| `src/lib/factors.ts` | Fuels, routes + screening ranges, CN codes, defaults, mark-ups, free-allocation phase-out |
| `src/lib/calc.ts` | Emissions engine (pure functions) |
| `src/lib/flags.ts` | Data-quality rules R01–R19 and the scorecard |
| `src/lib/simulator.ts` | Default-vs-actual cost model |
| `src/lib/pipeline.ts` | Extract → evidence + rows; multi-tier passport resolver |
| `src/lib/store.ts` | JSON store, evidence files by hash, hash-chained audit |
| `src/lib/export.ts` | XLSX, CSV, passport JSON |
| `src/app/(app)/` | Exporter workspace: suppliers, simulator, audit, settings |
| `src/app/s`, `verify`, `passport` | Supplier portal, verifier workspace, public passport |
| `samples/` | Demo documents for three suppliers, with planted problems |
