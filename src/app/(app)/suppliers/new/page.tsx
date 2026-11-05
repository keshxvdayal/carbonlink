"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { ProductEditor, newProduct, type UpstreamOption } from "@/components/product-editor";
import { Card, CardHeader, Field, btn, input } from "@/components/ui";
import { LANG_LABEL } from "@/lib/i18n";
import { LANGS, type Lang, type Product } from "@/lib/types";

export default function NewSupplier() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", city: "", state: "", contactName: "", phone: "+91", language: "hi" as Lang });
  const [products, setProducts] = useState<Product[]>([newProduct()]);
  const [upstream, setUpstream] = useState<UpstreamOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/suppliers").then((r) => r.json()).then(setUpstream).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/suppliers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(body.error);
    }
    const valid = products.filter((p) => p.name.trim() && p.cnCode.trim());
    if (valid.length) {
      const r2 = await fetch(`/api/suppliers/${body.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ products: valid }) });
      if (!r2.ok) setError((await r2.json()).error);
    }
    router.push(`/suppliers/${body.id}?tab=share`);
  }

  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <form onSubmit={submit} className="rise mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Invite a supplier</h1>
        <p className="mt-1 text-[15px] text-slate-500">They get a WhatsApp link to a simple mobile page in their language. No login, no app, no training.</p>
      </div>
      <Card>
        <CardHeader title="Supplier" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <Field label="Company name"><input required className={input} {...f("name")} placeholder="Ludhiana Precision Fasteners" /></Field>
          <Field label="Contact person"><input className={input} {...f("contactName")} /></Field>
          <Field label="City"><input className={input} {...f("city")} /></Field>
          <Field label="State"><input className={input} {...f("state")} /></Field>
          <Field label="WhatsApp number" hint="With country code, e.g. +91 98…"><input className={input} {...f("phone")} inputMode="tel" /></Field>
          <Field label="Portal language">
            <select className={input} {...f("language")}>{LANGS.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}</select>
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Products you buy from them" subtitle="CN code and production route decide the default value, the screening ranges and which precursors to ask for." />
        <div className="p-5 sm:p-6"><ProductEditor products={products} onChange={setProducts} upstream={upstream} /></div>
      </Card>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end">
        <button className={btn.primary} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />} Create and get invite link</button>
      </div>
    </form>
  );
}
