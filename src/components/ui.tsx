import { CircleAlert, CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Severity, SupplierStatus } from "@/lib/types";

/* Status palette (fixed). Colour always ships with an icon + a text label. */
export const SEV: Record<Severity, { label: string; color: string; tint: string; Icon: LucideIcon }> = {
  critical: { label: "Critical", color: "#d03b3b", tint: "#fdf0f0", Icon: OctagonAlert },
  major: { label: "Major", color: "#ec835a", tint: "#fdf3ee", Icon: TriangleAlert },
  minor: { label: "Minor", color: "#d99a0b", tint: "#fef8ea", Icon: CircleAlert },
  info: { label: "Info", color: "#64748b", tint: "#f1f5f9", Icon: Info },
};
export const GOOD = { color: "#0ca30c", tint: "#eefaee" };

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-800" style={{ background: s.tint }}>
      <s.Icon className="h-3.5 w-3.5" style={{ color: s.color }} strokeWidth={2.5} aria-hidden />
      {s.label}
    </span>
  );
}

const STATUS: Record<SupplierStatus, { label: string; cls: string }> = {
  invited: { label: "Invited", cls: "bg-slate-100 text-slate-700" },
  collecting: { label: "Collecting", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  submitted: { label: "Submitted", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  verified: { label: "Verified", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
};

export function StatusPill({ status }: { status: SupplierStatus }) {
  const s = STATUS[status];
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/5", s.cls)}>{status === "verified" && <CircleCheck className="h-3.5 w-3.5" aria-hidden />}{s.label}</span>;
}

export function Grade({ grade }: { grade: "A" | "B" | "C" | "D" }) {
  const c = { A: "bg-emerald-600", B: "bg-lime-600", C: "bg-amber-500", D: "bg-rose-600" }[grade];
  return <span className={cx("inline-grid h-6 w-6 place-items-center rounded-md text-xs font-bold text-white", c)} title={`Data grade ${grade}`}>{grade}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("print-break rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div className="min-w-0">
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
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200/70"><Icon className="h-4 w-4" aria-hidden /></span>
      </div>
      <div className="num mt-3 text-[26px] font-semibold leading-none tracking-tight text-slate-900">{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}

export function Meter({ value, className = "h-1.5" }: { value: number; className?: string }) {
  const color = value >= 80 ? GOOD.color : value >= 50 ? "#d99a0b" : SEV.critical.color;
  return (
    <div className="w-full overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("rounded-full", className)} style={{ width: `${Math.max(value, 3)}%`, background: color }} />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-slate-200/70", className)} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50",
  whatsapp: "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1f9d55] px-2.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#188046]",
};
