import { Ban, CircleCheck, Info, OctagonAlert, ScrollText, Landmark, Package, Receipt, Ship, Globe, FileText, TriangleAlert, CircleAlert, type LucideIcon } from "lucide-react";
import type { CheckStatus, DocType, Severity } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Status palette (fixed, never themed). Colour always ships with an   *
 * icon + a text label so it never carries meaning alone.              *
 * ------------------------------------------------------------------ */
export const SEV: Record<Severity, { label: string; color: string; tint: string; track: string; Icon: LucideIcon }> = {
  critical: { label: "Critical", color: "#d03b3b", tint: "#fdf0f0", track: "#f6d3d3", Icon: OctagonAlert },
  major: { label: "Major", color: "#ec835a", tint: "#fdf3ee", track: "#f9dccf", Icon: TriangleAlert },
  minor: { label: "Minor", color: "#fab219", tint: "#fef8ea", track: "#fdeac0", Icon: CircleAlert },
  info: { label: "Info", color: "#64748b", tint: "#f1f5f9", track: "#e2e8f0", Icon: Info },
};
export const GOOD = { color: "#0ca30c", tint: "#eefaee", track: "#cdeccd" };

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function SeverityBadge({ severity, compact = false }: { severity: Severity; compact?: boolean }) {
  const s = SEV[severity];
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-800" style={{ background: s.tint }}>
      <s.Icon className="h-3.5 w-3.5" style={{ color: s.color }} strokeWidth={2.5} aria-hidden />
      {!compact && s.label}
    </span>
  );
}

const STATUS: Record<CheckStatus, { label: string; color: string; tint: string; Icon: LucideIcon }> = {
  issues_found: { label: "Fix before filing", color: SEV.critical.color, tint: SEV.critical.tint, Icon: Ban },
  needs_review: { label: "Needs review", color: "#c98a00", tint: SEV.minor.tint, Icon: CircleAlert },
  clear: { label: "Clear to file", color: GOOD.color, tint: GOOD.tint, Icon: CircleCheck },
};

export function StatusPill({ status, size = "sm" }: { status: CheckStatus; size?: "sm" | "lg" }) {
  const s = STATUS[status];
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 rounded-full font-medium text-slate-800 ring-1 ring-inset ring-black/5", size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs")}
      style={{ background: s.tint }}
    >
      <s.Icon className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} style={{ color: s.color }} strokeWidth={2.5} aria-hidden />
      {s.label}
    </span>
  );
}

export const RISK = {
  low: { label: "Low risk", color: GOOD.color, track: GOOD.track },
  medium: { label: "Medium risk", color: "#e09a00", track: SEV.minor.track },
  high: { label: "High risk", color: SEV.critical.color, track: SEV.critical.track },
} as const;

/** Meter: fill carries severity; the track is a lighter step of the same hue. */
export function Meter({ value, level, className = "h-1.5" }: { value: number; level: keyof typeof RISK; className?: string }) {
  const r = RISK[level];
  return (
    <div className={cx("w-full overflow-hidden rounded-full", className)} style={{ background: r.track }} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={`Risk ${value} of 100`}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(value, 3)}%`, background: r.color }} />
    </div>
  );
}

/** Thin segmented bar: one whole (open findings) split by severity. Zero parts draw nothing. */
export function SeverityBar({ counts, className = "h-2" }: { counts: Partial<Record<Severity, number>>; className?: string }) {
  const parts = (["critical", "major", "minor"] as const).map((s) => ({ s, n: counts[s] ?? 0 })).filter((p) => p.n > 0);
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (!total) return <div className={cx("w-full rounded-full", className)} style={{ background: GOOD.track }} aria-label="No open issues" />;
  return (
    <div className={cx("flex w-full gap-[2px]", className)} role="img" aria-label={parts.map((p) => `${p.n} ${p.s}`).join(", ")}>
      {parts.map((p) => (
        <div key={p.s} className="h-full rounded-full" style={{ flexGrow: p.n, background: SEV[p.s].color }} title={`${p.n} ${SEV[p.s].label.toLowerCase()}`} />
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("print-break rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({ label, value, hint, Icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; Icon: LucideIcon }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200/70">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-slate-900">{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-slate-200/70", className)} />;
}

export const DOC_ICON: Record<DocType, LucideIcon> = {
  commercial_invoice: Receipt,
  packing_list: Package,
  bill_of_lading: Ship,
  certificate_of_origin: Globe,
  shipping_bill: ScrollText,
  letter_of_credit: Landmark,
  other: FileText,
};

export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-900/10 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm shadow-slate-900/5 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200",
  ghost: "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900",
};
