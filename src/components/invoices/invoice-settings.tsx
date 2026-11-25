"use client";

// Business / GST details shown on every document, numbering, UPI ID,
// and the WhatsApp payment-reminder template.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { countPlaceholders } from "@/lib/followups/schedule";
import { GST_STATES } from "@/lib/invoices/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { sendJson } from "@/components/followups/shared";

export interface InvoiceSettingsRow {
  business_name: string | null;
  gstin: string | null;
  address: string | null;
  state_code: string | null;
  phone: string | null;
  email: string | null;
  upi_id: string | null;
  bank_details: string | null;
  invoice_prefix: string;
  estimate_prefix: string;
  default_terms: string | null;
  reminder_template_name: string | null;
  reminder_template_language: string;
  reminder_variables: string[];
  reminders_enabled: boolean;
}

interface Tpl {
  name: string;
  language: string | null;
  category: string;
  body_text: string;
}

const TOKENS = ["{{first_name}}", "{{number}}", "{{amount}}", "{{due_date}}", "{{upi}}", "{{link}}"];
const DEFAULT_VARS = ["{{first_name}}", "{{amount}}", "{{number}}", "{{due_date}}", "{{link}}"];

export function InvoiceSettings({ initial, canEdit, onSaved }: { initial: InvoiceSettingsRow | null; canEdit: boolean; onSaved: () => void }) {
  const t = useTranslations("Invoices");
  const [f, setF] = useState({
    business_name: initial?.business_name ?? "",
    gstin: initial?.gstin ?? "",
    address: initial?.address ?? "",
    state_code: initial?.state_code ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    upi_id: initial?.upi_id ?? "",
    bank_details: initial?.bank_details ?? "",
    invoice_prefix: initial?.invoice_prefix ?? "INV-",
    estimate_prefix: initial?.estimate_prefix ?? "EST-",
    default_terms: initial?.default_terms ?? "",
  });
  const [tplKey, setTplKey] = useState(initial?.reminder_template_name ? `${initial.reminder_template_name}|${initial.reminder_template_language}` : "");
  const [vars, setVars] = useState<string[]>(initial?.reminder_variables ?? []);
  const [enabled, setEnabled] = useState(initial?.reminders_enabled ?? true);
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    createClient()
      .from("message_templates")
      .select("name, language, category, body_text")
      .eq("status", "APPROVED")
      .order("name")
      .then(({ data }) => setTemplates((data ?? []) as Tpl[]));
  }, []);
  const byKey = useMemo(() => new Map(templates.map((x) => [`${x.name}|${x.language ?? "en_US"}`, x])), [templates]);

  const field = (key: keyof typeof f, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`is-${key}`}>{label}</Label>
      <Input id={`is-${key}`} value={f[key]} disabled={!canEdit} onChange={(e) => setF({ ...f, [key]: e.target.value })} {...props} />
    </div>
  );

  const pick = (k: string) => {
    setTplKey(k);
    const n = countPlaceholders(byKey.get(k)?.body_text);
    setVars(Array.from({ length: n }, (_, i) => vars[i] ?? DEFAULT_VARS[i] ?? ""));
  };

  const save = async () => {
    setSaving(true);
    const [name, lang] = tplKey ? tplKey.split("|") : [null, "en_US"];
    const res = await sendJson("/api/invoices/settings", "PUT", {
      ...f,
      reminder_template_name: name,
      reminder_template_language: lang,
      reminder_variables: vars,
      reminders_enabled: enabled,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    toast.success(t("settingsSaved"));
    onSaved();
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="font-medium text-foreground">{t("businessDetails")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("business_name", t("businessName"), { maxLength: 200 })}
          {field("gstin", t("gstin"), { maxLength: 15, placeholder: "19ABCDE1234F1Z5" })}
          <div className="space-y-1.5">
            <Label htmlFor="is-state">{t("state")}</Label>
            <select id="is-state" value={f.state_code} disabled={!canEdit} onChange={(e) => setF({ ...f, state_code: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
              <option value="">—</option>
              {GST_STATES.map(([c, n]) => (
                <option key={c} value={c}>{c} · {n}</option>
              ))}
            </select>
          </div>
          {field("phone", t("phone"), { maxLength: 40 })}
          {field("email", t("email"), { maxLength: 200 })}
          {field("upi_id", t("upiId"), { maxLength: 320, placeholder: "yourshop@okhdfcbank" })}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="is-address">{t("address")}</Label>
            <textarea id="is-address" value={f.address} disabled={!canEdit} rows={2} maxLength={500} onChange={(e) => setF({ ...f, address: e.target.value })} className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="is-bank">{t("bankDetails")}</Label>
            <textarea id="is-bank" value={f.bank_details} disabled={!canEdit} rows={2} maxLength={500} placeholder={t("bankPlaceholder")} onChange={(e) => setF({ ...f, bank_details: e.target.value })} className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
          </div>
          {field("invoice_prefix", t("invoicePrefix"), { maxLength: 12 })}
          {field("estimate_prefix", t("estimatePrefix"), { maxLength: 12 })}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="is-terms">{t("defaultTerms")}</Label>
            <textarea id="is-terms" value={f.default_terms} disabled={!canEdit} rows={2} maxLength={1000} onChange={(e) => setF({ ...f, default_terms: e.target.value })} className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-medium text-foreground">{t("remindersTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("remindersHint")}</p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} />
          {t("remindersOn")}
        </label>
        <div className="space-y-1.5">
          <Label>{t("reminderTemplate")}</Label>
          <select value={tplKey} disabled={!canEdit} onChange={(e) => pick(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
            <option value="">{t("noTemplate")}</option>
            {templates.map((o) => (
              <option key={`${o.name}|${o.language}`} value={`${o.name}|${o.language ?? "en_US"}`}>
                {o.name} ({o.language ?? "en_US"} · {o.category})
              </option>
            ))}
          </select>
        </div>
        {tplKey && byKey.get(tplKey) && <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground">{byKey.get(tplKey)!.body_text}</p>}
        {vars.map((v, i) => (
          <div key={i} className="space-y-1">
            <Label className="text-xs">{t("variableLabel", { n: i + 1 })}</Label>
            <Input value={v} disabled={!canEdit} maxLength={200} onChange={(e) => setVars(vars.map((x, j) => (j === i ? e.target.value : x)))} />
            {canEdit && (
              <div className="flex flex-wrap gap-1">
                {TOKENS.map((tok) => (
                  <button key={tok} type="button" onClick={() => setVars(vars.map((x, j) => (j === i ? tok : x)))} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground">
                    {tok}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {canEdit && (
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {t("save")}
        </Button>
      )}
    </div>
  );
}
