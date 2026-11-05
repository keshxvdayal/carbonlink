"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Ban, Check, ChevronRight, CircleCheck, Columns3, History, ListChecks, Printer, Sparkles, Tag, Trash2, Undo2, Wrench, X } from "lucide-react";
import { Card, CardHeader, DOC_ICON, GOOD, Meter, RISK, SEV, SeverityBadge, SeverityBar, Skeleton, StatusPill, btn, cx } from "@/components/ui";
import { dateTime, plural } from "@/lib/format";
import { DOC_TYPE_LABELS, type CheckResult, type ExtractedDoc, type Finding, type FindingStatus, type Severity, type SourceDoc } from "@/lib/types";

const SEVERITIES: Severity[] = ["critical", "major", "minor", "info"];

const CONSEQUENCE: Partial<Record<Finding["category"], string>> = {
  letter_of_credit: "a bank discrepancy under the L/C",
  hs_code: "a customs query on classification",
  consistency: "a customs hold over mismatched documents",
  arithmetic: "value errors on the invoice",
  format: "invalid registration or container numbers",
  missing_field: "missing mandatory details",
  dates: "date problems",
};

// Most consequential first when summarising.
const CONSEQUENCE_ORDER: Finding["category"][] = ["letter_of_credit", "hs_code", "consistency", "arithmetic", "format", "missing_field", "dates"];

const COMPARE_ROWS: { label: string; get: (d: ExtractedDoc) => string | number | null; check?: boolean }[] = [
  { label: "Document no.", get: (d) => d.documentNumber },
  { label: "Date", get: (d) => d.documentDate },
  { label: "Invoice ref", get: (d) => d.invoiceNumberRef, check: true },
  { label: "Exporter", get: (d) => d.exporter.name, check: true },
  { label: "Consignee", get: (d) => d.consignee.name, check: true },
  { label: "Port of loading", get: (d) => d.portOfLoading, check: true },
  { label: "Port of discharge", get: (d) => d.portOfDischarge, check: true },
  { label: "Country of origin", get: (d) => d.countryOfOrigin, check: true },
  { label: "Incoterms", get: (d) => d.incoterms },
  { label: "Currency", get: (d) => d.currency, check: true },
  { label: "Total value", get: (d) => d.totalValue },
  { label: "Total quantity", get: (d) => d.totalQuantity, check: true },
  { label: "Packages", get: (d) => d.numberOfPackages, check: true },
  { label: "Gross weight (kg)", get: (d) => d.grossWeightKg, check: true },
  { label: "Net weight (kg)", get: (d) => d.netWeightKg, check: true },
  { label: "Vessel", get: (d) => d.vesselOrFlight },
  { label: "Containers", get: (d) => (d.containerNumbers.length ? d.containerNumbers.join(", ") : null), check: true },
  { label: "HS codes", get: (d) => (d.lineItems.some((l) => l.hsCode) ? d.lineItems.map((l) => l.hsCode ?? "–").join(" · ") : null), check: true },
  { label: "L/C latest shipment", get: (d) => d.latestShipmentDate },
  { label: "L/C expiry", get: (d) => d.lcExpiryDate },
];

const loose = (v: string | number | null) => (v === null ? "" : String(v).toLowerCase().replace(/\b(pvt|private|ltd|limited)\b/g, "").replace(/[^a-z0-9]/g, ""));

type Tab = "issues" | "compare" | "hs" | "activity";

export default function Report({ id }: { id: string }) {
  const router = useRouter();
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTabState] = useState<Tab>(() => {
    const t = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab");
    return t === "compare" || t === "hs" || t === "activity" ? t : "issues";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, "", t === "issues" ? window.location.pathname : `?tab=${t}`);
  };
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [docFilter, setDocFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/checks/${id}`).then(async (r) => (r.ok ? setCheck(await r.json()) : setNotFound(true)));
  }, [id]);

  const open = useMemo(() => check?.findings.filter((f) => f.status === "open") ?? [], [check]);
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, major: 0, minor: 0, info: 0 };
    open.forEach((f) => c[f.severity]++);
    return c;
  }, [open]);

  async function review(f: Finding, status: FindingStatus, note?: string) {
    if (!check) return;
    const prev = check;
    setCheck({ ...check, findings: check.findings.map((x) => (x.id === f.id ? { ...x, status, reviewerNote: note } : x)) });
    const res = await fetch(`/api/checks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ findingId: f.id, status, note }) });
    setCheck(res.ok ? await res.json() : prev);
  }

  async function remove() {
    if (!confirm("Delete this check and its extracted data?")) return;
    await fetch(`/api/checks/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (notFound)
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Check not found</h1>
        <p className="mt-1 text-sm text-slate-500">It may have been deleted.</p>
        <Link href="/" className={`${btn.secondary} mt-5`}>Back to shipments</Link>
      </Card>
    );
  if (!check)
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-52 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );

  const docById = new Map(check.docs.map((d) => [d.id, d]));
  // A document is implicated when its value is the odd one out (majority vote across 3+ documents);
  // with only 1-2 documents in the evidence, any of them could be the wrong one.
  const implicates = (f: Finding, docId: string) => {
    const ev = f.evidence ?? [];
    const mine = ev.filter((e) => e.docId === docId);
    if (!mine.length) return false;
    const docsInvolved = new Set(ev.map((e) => e.docId));
    if (docsInvolved.size < 3) return true;
    const tally = new Map<string, number>();
    ev.forEach((e) => tally.set(loose(e.value), (tally.get(loose(e.value)) ?? 0) + 1));
    const majority = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return mine.some((e) => loose(e.value) !== majority);
  };
  const issuesPerDoc = (docId: string) => open.filter((f) => f.severity !== "info" && implicates(f, docId));
  const serious = counts.critical + counts.major;
  const seriousCats = new Set(open.filter((f) => f.severity === "critical" || f.severity === "major").map((f) => f.category));
  const consequences = CONSEQUENCE_ORDER.filter((c) => seriousCats.has(c)).map((c) => CONSEQUENCE[c]).slice(0, 2);
  const verdict =
    serious > 0
      ? `${[counts.critical && plural(counts.critical, "critical issue"), counts.major && plural(counts.major, "major issue")].filter(Boolean).join(" and ")} found. As filed, this set risks ${consequences.join(" and ") || "rejection"}.`
      : open.length
        ? `No blocking issues. ${plural(open.length, "item")} worth a quick look before filing.`
        : `All ${check.docs.length} documents agree with each other. Nothing to fix.`;

  const hsMismatch = check.hsSuggestions.filter((s) => s.matchesDeclared === false).length;
  const visible = check.findings
    .filter((f) => (filter === "open" ? f.status === "open" : filter === "done" ? f.status !== "open" : true))
    .filter((f) => !docFilter || implicates(f, docFilter));

  const TABS: { key: Tab; label: string; Icon: typeof ListChecks; badge?: number }[] = [
    { key: "issues", label: "Issues", Icon: ListChecks, badge: open.filter((f) => f.severity !== "info").length },
    { key: "compare", label: "Side-by-side", Icon: Columns3 },
    { key: "hs", label: "HS codes", Icon: Tag, badge: hsMismatch || undefined },
    { key: "activity", label: "Activity", Icon: History },
  ];

  return (
    <div className="rise space-y-6">
      <nav className="no-print flex items-center gap-1.5 text-[13px] text-slate-500">
        <Link href="/" className="hover:text-slate-900">Shipments</Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span className="truncate text-slate-900">{check.name}</span>
      </nav>

      {/* Verdict */}
      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_320px]">
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <StatusPill status={check.status} size="lg" />
              <div className="no-print flex gap-2">
                <button onClick={() => window.print()} className={btn.secondary}><Printer className="h-4 w-4" aria-hidden /> Export report</button>
                <button onClick={remove} className={cx(btn.secondary, "px-2.5 hover:border-red-200 hover:text-red-600")} aria-label="Delete check"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">{check.name}</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600">{verdict}</p>
            <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
              <div className="flex gap-1.5"><dt className="text-slate-500">Documents</dt><dd className="font-medium">{check.docs.length}</dd></div>
              <div className="flex gap-1.5"><dt className="text-slate-500">Extraction</dt><dd className="flex items-center gap-1 font-medium">{check.mode === "ai" && <Sparkles className="h-3.5 w-3.5 text-teal-600" aria-hidden />}{check.mode === "ai" ? "AI" : "Offline"}</dd></div>
              <div className="flex gap-1.5"><dt className="text-slate-500">Checked</dt><dd className="font-medium">{dateTime(check.createdAt)}</dd></div>
              <div className="flex gap-1.5"><dt className="text-slate-500">Ref</dt><dd className="font-mono font-medium">{check.id}</dd></div>
            </dl>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 p-6 sm:p-7 lg:border-l lg:border-t-0">
            <div className="text-[13px] font-medium text-slate-500">Risk score</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[56px] font-semibold leading-none tracking-tight text-slate-900">{check.riskScore}</span>
              <span className="text-sm text-slate-500">/ 100</span>
            </div>
            <div className="mt-3"><Meter value={check.riskScore} level={check.riskLevel} className="h-2" /></div>
            <div className="mt-1.5 text-xs font-medium text-slate-600">{RISK[check.riskLevel].label}</div>

            <div className="mt-6 text-[13px] font-medium text-slate-500">Open issues by severity</div>
            <SeverityBar counts={counts} className="mt-2 h-2" />
            <ul className="mt-3 grid grid-cols-2 gap-y-1.5 text-[13px]">
              {SEVERITIES.map((s) => {
                const S = SEV[s];
                return (
                  <li key={s} className="flex items-center gap-1.5 text-slate-700">
                    <S.Icon className="h-3.5 w-3.5" style={{ color: S.color }} strokeWidth={2.5} aria-hidden />
                    <span className="font-semibold">{counts[s]}</span> {S.label.toLowerCase()}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Card>

      {/* Document strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {check.docs.map((d) => {
          const Icon = DOC_ICON[d.data.docType];
          const issues = issuesPerDoc(d.id);
          const worst = SEVERITIES.find((s) => issues.some((f) => f.severity === s));
          const active = docFilter === d.id;
          return (
            <button
              key={d.id}
              onClick={() => { setDocFilter(active ? null : d.id); setTab("issues"); }}
              className={cx("print-break rounded-xl border bg-white p-3.5 text-left transition", active ? "border-teal-600 ring-4 ring-teal-100" : "border-slate-200/80 hover:border-slate-300 hover:shadow-sm")}
            >
              <div className="flex items-center justify-between">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200"><Icon className="h-4 w-4 text-slate-600" aria-hidden /></span>
                {worst ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-700" style={{ background: SEV[worst].tint }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEV[worst].color }} aria-hidden />
                    {issues.length}
                  </span>
                ) : (
                  <CircleCheck className="h-4 w-4" style={{ color: GOOD.color }} aria-label="No issues" />
                )}
              </div>
              <div className="mt-3 text-[13px] font-semibold text-slate-900">{DOC_TYPE_LABELS[d.data.docType]}</div>
              <div className="truncate text-[11px] text-slate-500" title={d.fileName}>{d.fileName}</div>
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="no-print sticky top-14 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-xl bg-[#f5f6f8]/90 p-1 backdrop-blur lg:top-0">
        {TABS.map(({ key, label, Icon, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx("flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition", tab === key ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900")}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
            {badge ? <span className={cx("rounded-full px-1.5 text-[11px] font-semibold", tab === key ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700")}>{badge}</span> : null}
          </button>
        ))}
      </div>

      {/* Issues */}
      <div className={tab === "issues" ? "space-y-4" : "hidden print:block"}>
        <div className="no-print flex flex-wrap items-center gap-2">
          {([["open", `Open · ${open.length}`], ["done", `Reviewed · ${check.findings.length - open.length}`], ["all", `All · ${check.findings.length}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={cx("rounded-full px-3 py-1 text-[13px] font-medium transition", filter === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300")}>{l}</button>
          ))}
          {docFilter && (
            <button onClick={() => setDocFilter(null)} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-[13px] font-medium text-teal-800 ring-1 ring-teal-200">
              {DOC_TYPE_LABELS[docById.get(docFilter)!.data.docType]} <X className="h-3.5 w-3.5" aria-label="Clear document filter" />
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <Card className="px-6 py-14 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl" style={{ background: GOOD.tint }}><CircleCheck className="h-6 w-6" style={{ color: GOOD.color }} aria-hidden /></div>
            <h3 className="mt-3 font-semibold">{filter === "open" ? "No open issues" : "Nothing here"}</h3>
            <p className="mt-1 text-sm text-slate-500">{filter === "open" ? "Every document in this set agrees with the others." : "Try another filter."}</p>
          </Card>
        ) : (
          SEVERITIES.map((s) => {
            const group = visible.filter((f) => f.severity === s);
            if (!group.length) return null;
            const S = SEV[s];
            return (
              <section key={s} className="space-y-2.5">
                <h3 className="flex items-center gap-2 px-1 pt-2 text-[13px] font-semibold text-slate-700">
                  <S.Icon className="h-4 w-4" style={{ color: S.color }} strokeWidth={2.5} aria-hidden /> {S.label} <span className="font-normal text-slate-400">{group.length}</span>
                </h3>
                {group.map((f) => <IssueCard key={f.id} f={f} docById={docById} onReview={review} />)}
              </section>
            );
          })
        )}
      </div>

      {/* Side-by-side */}
      <div className={tab === "compare" ? "" : "hidden print:block"}>
        <Card className="overflow-hidden">
          <CardHeader
            title="Side-by-side"
            subtitle={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">Every extracted value. The commercial invoice is the reference.<span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm ring-1 ring-inset" style={{ background: SEV.critical.tint, boxShadow: `inset 0 0 0 1px ${SEV.critical.track}` }} /> differs from reference</span></span>}
          />
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-slate-100 bg-white px-6 py-3 text-left text-xs font-medium text-slate-500">Field</th>
                  {check.docs.map((d, i) => {
                    const Icon = DOC_ICON[d.data.docType];
                    return (
                      <th key={d.id} className={cx("min-w-44 border-b border-slate-100 px-4 py-3 text-left align-bottom", i === 0 && "bg-teal-50/40")}>
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900"><Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden />{DOC_TYPE_LABELS[d.data.docType]}</div>
                        <div className="mt-0.5 truncate text-[11px] font-normal text-slate-400">{i === 0 ? "Reference · " : ""}{d.fileName}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const ordered = [...check.docs].sort((a, b) => (a.data.docType === "commercial_invoice" ? -1 : b.data.docType === "commercial_invoice" ? 1 : 0));
                  return COMPARE_ROWS.map((row) => {
                    const vals = ordered.map((d) => row.get(d.data));
                    if (vals.every((v) => v === null || v === "")) return null;
                    const ref = vals.find((v) => v !== null && v !== "") ?? null;
                    return (
                      <tr key={row.label} className="group">
                        <td className="sticky left-0 z-10 whitespace-nowrap border-b border-slate-50 bg-white px-6 py-2.5 text-[13px] font-medium text-slate-600 group-hover:bg-slate-50">{row.label}</td>
                        {vals.map((v, i) => {
                          const diff = row.check && v !== null && v !== "" && ref !== null && loose(v) !== loose(ref);
                          return (
                            <td key={i} className={cx("border-b border-slate-50 px-4 py-2.5 font-mono text-[12px] group-hover:bg-slate-50", i === 0 && "bg-teal-50/30")} style={diff ? { background: SEV.critical.tint, boxShadow: `inset 3px 0 0 ${SEV.critical.color}` } : undefined}>
                              {v === null || v === "" ? <span className="text-slate-300">—</span> : <span className={diff ? "font-semibold text-slate-900" : "text-slate-800"}>{v}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* HS codes */}
      <div className={tab === "hs" ? "" : "hidden print:block"}>
        <Card>
          <CardHeader
            title="HS code review"
            subtitle={check.mode === "ai" ? "Each item classified independently from its description, then compared with what was declared." : "Offline keyword check against a small 6-digit reference table. Turn on AI mode for full classification."}
          />
          {check.hsSuggestions.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No line items found to classify.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {check.hsSuggestions.map((s, i) => {
                const mismatch = s.matchesDeclared === false;
                return (
                  <li key={i} className="print-break grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <div className="text-[15px] font-medium text-slate-900">{s.description}</div>
                      <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{s.rationale}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Declared</div>
                        <div className="font-mono text-[15px] font-semibold">{s.declared ?? "—"}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300" aria-hidden />
                      <div className="rounded-xl px-3 py-2 ring-1 ring-inset" style={mismatch ? { background: SEV.major.tint, boxShadow: `inset 0 0 0 1px ${SEV.major.track}` } : { background: GOOD.tint, boxShadow: `inset 0 0 0 1px ${GOOD.track}` }}>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Suggested · {s.confidence}</div>
                        <div className="font-mono text-[15px] font-semibold">{s.suggested ?? "—"}</div>
                      </div>
                      <span className="w-24 text-[13px] font-medium">
                        {s.matchesDeclared === null ? <span className="text-slate-400">Unverified</span> : mismatch ? (
                          <span className="inline-flex items-center gap-1 text-slate-800"><SeverityBadge severity="major" compact /> Review</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-800"><CircleCheck className="h-4 w-4" style={{ color: GOOD.color }} aria-hidden /> Match</span>
                        )}
                      </span>
                    </div>
                    {s.suggestedDescription && <div className="-mt-2 text-xs text-slate-500 md:col-span-2">{s.suggested}: {s.suggestedDescription}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-3 text-xs text-slate-500">Suggestions only. Confirm against the current ITC-HS schedule and customs tariff; duty and incentive rates are not shown.</p>
        </Card>
      </div>

      {/* Activity */}
      <div className={tab === "activity" ? "" : "hidden print:block"}>
        <Card>
          <CardHeader title="Activity" subtitle="Every review decision on this check, for your audit trail." />
          <ol className={cx("relative space-y-5 px-6 py-5", check.audit.length > 1 && "before:absolute before:bottom-8 before:left-[33px] before:top-8 before:w-px before:bg-slate-200")}>
            {[...check.audit].reverse().map((a, i) => {
              const tone = a.action.includes("resolved") ? { Icon: Check, bg: GOOD.tint, fg: GOOD.color } : a.action.includes("false_positive") ? { Icon: Ban, bg: "#f1f5f9", fg: "#64748b" } : a.action.includes("open") && a.action !== "check_created" ? { Icon: Undo2, bg: "#f1f5f9", fg: "#64748b" } : { Icon: Sparkles, bg: "#f0fdfa", fg: "#0f766e" };
              return (
                <li key={i} className="relative flex gap-4">
                  <span className="relative z-10 grid h-5 w-5 shrink-0 place-items-center rounded-full ring-4 ring-white" style={{ background: tone.bg }}><tone.Icon className="h-3 w-3" style={{ color: tone.fg }} strokeWidth={3} aria-hidden /></span>
                  <div className="-mt-0.5 min-w-0">
                    <div className="text-sm font-medium capitalize text-slate-900">{a.action.replace(/^finding_/, "marked ").replace(/_/g, " ")}</div>
                    {a.detail && <div className="text-[13px] text-slate-600">{a.detail}</div>}
                    <div className="mt-0.5 text-xs text-slate-400">{dateTime(a.at)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </div>
  );
}

function IssueCard({ f, docById, onReview }: { f: Finding; docById: Map<string, SourceDoc>; onReview: (f: Finding, s: FindingStatus, note?: string) => void }) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const S = SEV[f.severity];
  const done = f.status !== "open";
  const ev = f.evidence ?? [];
  const ref = ev[0]?.value ?? null;

  return (
    <Card className={cx("relative overflow-hidden transition", done && "opacity-70")}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: done ? "#cbd5e1" : S.color }} aria-hidden />
      <div className="flex flex-col gap-4 py-4 pl-6 pr-5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            <h4 className={cx("text-[15px] font-semibold text-slate-900", done && "line-through decoration-slate-400")}>{f.title}</h4>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{f.ruleId}</span>
            {f.status === "resolved" && <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700"><Check className="h-3.5 w-3.5" style={{ color: GOOD.color }} strokeWidth={3} aria-hidden />Resolved</span>}
            {f.status === "false_positive" && <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"><Ban className="h-3.5 w-3.5" aria-hidden />False positive</span>}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.detail}</p>

          {ev.length > 1 && (
            <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
              {ev.map((e, i) => {
                const d = docById.get(e.docId);
                const Icon = d ? DOC_ICON[d.data.docType] : null;
                const diff = i > 0 && e.value !== null && ref !== null && loose(e.value) !== loose(ref);
                return (
                  <div key={i} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-[13px] last:border-0" style={diff ? { background: S.tint } : undefined}>
                    <span className="flex w-28 shrink-0 items-center gap-1.5 text-slate-500 sm:w-44">
                      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                      <span className="truncate">{d ? DOC_TYPE_LABELS[d.data.docType] : e.docId}</span>
                    </span>
                    <span className="hidden w-36 shrink-0 truncate text-xs text-slate-400 sm:block" title={e.field}>{e.field}</span>
                    <span className={cx("min-w-0 flex-1 truncate font-mono text-[12px]", diff ? "font-semibold text-slate-900" : "text-slate-700")}>{e.value ?? <span className="text-slate-400">missing</span>}</span>
                    {diff && <span className="shrink-0 text-[11px] font-medium text-slate-600">differs</span>}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex gap-2 rounded-xl bg-teal-50/60 px-3 py-2.5 text-[13px] text-slate-700 ring-1 ring-inset ring-teal-100">
            <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden />
            <span><span className="font-semibold text-teal-900">How to fix: </span>{f.fix}</span>
          </div>

          {f.reviewerNote && <p className="mt-2 text-xs text-slate-500">Reviewer note: <span className="italic">{f.reviewerNote}</span></p>}

          {noting && (
            <form className="no-print mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); onReview(f, "false_positive", note); setNoting(false); }}>
              <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this not a problem? (kept in the audit trail)" className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />
              <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-medium text-white">Save</button>
              <button type="button" onClick={() => setNoting(false)} className={btn.ghost}>Cancel</button>
            </form>
          )}
        </div>

        <div className="no-print flex shrink-0 gap-1.5 sm:flex-col">
          {done ? (
            <button onClick={() => onReview(f, "open")} className={btn.ghost}><Undo2 className="h-3.5 w-3.5" aria-hidden /> Reopen</button>
          ) : (
            <>
              <button onClick={() => onReview(f, "resolved")} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-slate-700"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> Resolve</button>
              <button onClick={() => setNoting(true)} className={btn.ghost}><Ban className="h-3.5 w-3.5" aria-hidden /> Not an issue</button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
