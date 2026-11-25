"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRightLeft, ExternalLink, FileText, IndianRupee, Loader2, Pencil, Plus, Send, Settings2, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { inr, istDate } from "@/lib/invoices/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { sendJson } from "@/components/followups/shared";
import { InvoiceEditor, type InvoiceDoc } from "@/components/invoices/invoice-editor";
import { InvoiceSettings, type InvoiceSettingsRow } from "@/components/invoices/invoice-settings";

type Tab = "invoices" | "estimates" | "settings";
const TABS: Tab[] = ["invoices", "estimates", "settings"];

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  accepted: "bg-green-500/10 text-green-600 dark:text-green-400",
  declined: "bg-muted text-muted-foreground",
  partially_paid: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  paid: "bg-green-500/10 text-green-600 dark:text-green-400",
  cancelled: "bg-muted text-muted-foreground line-through",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
};

function InvoicesInner() {
  const t = useTranslations("Invoices");
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "invoices") as Tab;
  const { accountId } = useAuth();
  const canAct = useCan("send-messages");
  const canEdit = useCan("edit-settings");
  const [docs, setDocs] = useState<InvoiceDoc[]>([]);
  const [settings, setSettings] = useState<InvoiceSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<InvoiceDoc | "new" | null>(null);
  const [paying, setPaying] = useState<InvoiceDoc | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [today, setToday] = useState("");
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      tab === "settings"
        ? Promise.resolve({ data: [] })
        : supabase.from("invoices").select("*").eq("account_id", accountId).eq("kind", tab === "estimates" ? "estimate" : "invoice").order("created_at", { ascending: false }).limit(300),
      supabase.from("invoice_settings").select("*").eq("account_id", accountId).maybeSingle(),
    ]).then(([list, s]) => {
      if (cancelled) return;
      setDocs(((list as { data: unknown[] | null }).data ?? []) as InvoiceDoc[]);
      setSettings((s.data as InvoiceSettingsRow | null) ?? null);
      setToday(istDate());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, tab, version]);

  const setTab = (next: Tab) => router.replace(next === "invoices" ? "/invoices" : `/invoices?tab=${next}`, { scroll: false });
  const kind = tab === "estimates" ? "estimate" : "invoice";

  const statusOf = (d: InvoiceDoc) =>
    d.kind === "invoice" && ["sent", "partially_paid"].includes(d.status) && d.due_date && d.due_date < today ? "overdue" : d.status;

  const act = async (d: InvoiceDoc, fn: () => Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }>, okMsg?: string) => {
    setBusy(d.id);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    if (okMsg) toast.success(okMsg);
    reload();
  };

  const unpaid = docs.filter((d) => d.kind === "invoice" && ["sent", "partially_paid"].includes(d.status));
  const outstanding = unpaid.reduce((s, d) => s + (Number(d.total) - Number(d.amount_paid)), 0);
  const overdue = unpaid.filter((d) => d.due_date && d.due_date < today);
  const needsSetup = !settings?.business_name;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canAct && tab !== "settings" && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" />
            {kind === "invoice" ? t("newInvoice") : t("newEstimate")}
          </Button>
        )}
      </div>

      {!loading && needsSetup && tab !== "settings" && (
        <button type="button" onClick={() => setTab("settings")} className="flex w-full items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <Settings2 className="h-4 w-4 shrink-0" />
          {t("setupBanner")}
        </button>
      )}

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-1" role="tablist">
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium", tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {k === "settings" && <Settings2 className="h-3.5 w-3.5" />}
            {t(`tab_${k}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tab === "settings" ? (
        <InvoiceSettings key={version} initial={settings} canEdit={canEdit} onSaved={reload} />
      ) : (
        <>
          {tab === "invoices" && docs.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label={t("outstanding")} value={inr(outstanding)} />
              <Stat label={t("overdueCount")} value={String(overdue.length)} tone={overdue.length ? "warn" : undefined} />
              <Stat label={t("paidThisMonth")} value={inr(docs.filter((d) => d.status === "paid" && d.issue_date.slice(0, 7) === today.slice(0, 7)).reduce((s, d) => s + Number(d.total), 0))} />
            </div>
          )}
          {docs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium text-foreground">{kind === "invoice" ? t("emptyInvoices") : t("emptyEstimates")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {docs.map((d) => {
                const st = statusOf(d);
                const balance = Number(d.total) - Number(d.amount_paid);
                const editable = !["paid", "cancelled"].includes(d.status) && Number(d.amount_paid) === 0;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-foreground">{d.number}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[st])}>{t(`status_${st}`)}</span>
                      </div>
                      <p className="truncate text-sm text-foreground">{d.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(`${d.issue_date}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                        {d.due_date && ` · ${d.kind === "invoice" ? t("due") : t("validTill")} ${new Date(`${d.due_date}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
                        {d.kind === "invoice" && d.reminder_count > 0 && ` · ${t("remindersSent", { count: d.reminder_count })}`}
                      </p>
                      {d.last_error && (
                        <p className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3 w-3" />{d.last_error}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-foreground">{inr(Number(d.total))}</p>
                      {d.kind === "invoice" && Number(d.amount_paid) > 0 && balance > 0.005 && (
                        <p className="text-xs text-muted-foreground">{t("balance", { amount: inr(balance) })}</p>
                      )}
                    </div>
                    <div className="flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
                      {d.status !== "draft" && (
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => window.open(`/i/${d.public_token}`, "_blank", "noopener")} aria-label={t("view")}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canAct && d.status !== "cancelled" && d.status !== "paid" && (
                        <Button size="sm" variant="outline" className="h-8" disabled={busy === d.id} onClick={() => act(d, () => sendJson(`/api/invoices/${d.id}/send`, "POST"), t("sentOk"))}>
                          <Send className="mr-1 h-3.5 w-3.5" />
                          {t("sendWhatsapp")}
                        </Button>
                      )}
                      {canAct && d.kind === "invoice" && ["sent", "partially_paid"].includes(d.status) && (
                        <Button size="sm" className="h-8" onClick={() => { setPaying(d); setPayAmount(balance.toFixed(2)); }}>
                          <IndianRupee className="mr-1 h-3.5 w-3.5" />
                          {t("recordPayment")}
                        </Button>
                      )}
                      {canAct && d.kind === "estimate" && !["cancelled", "declined"].includes(d.status) && (
                        <Button size="sm" variant="outline" className="h-8" disabled={busy === d.id} onClick={() => act(d, () => sendJson(`/api/invoices/${d.id}/convert`, "POST"), t("converted"))}>
                          <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                          {t("toInvoice")}
                        </Button>
                      )}
                      {canAct && editable && (
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(d)} aria-label={t("edit")}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canAct && d.status === "draft" && (
                        <Button size="sm" variant="ghost" className="h-8 text-red-500" aria-label={t("delete")} onClick={async () => {
                          if (await confirmDialog(t("deleteConfirm"), { destructive: true })) act(d, () => sendJson(`/api/invoices/${d.id}`, "DELETE"));
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canAct && !["draft", "cancelled", "paid"].includes(d.status) && Number(d.amount_paid) === 0 && (
                        <Button size="sm" variant="ghost" className="h-8 text-red-500" aria-label={t("cancelDoc")} onClick={async () => {
                          if (await confirmDialog(t("cancelConfirm"), { destructive: true })) act(d, () => sendJson(`/api/invoices/${d.id}`, "PATCH", { status: "cancelled" }));
                        }}>
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {editing && (
        <InvoiceEditor
          kind={editing === "new" ? kind : editing.kind}
          doc={editing === "new" ? null : editing}
          sellerState={settings?.state_code ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {paying && (
        <Dialog open onOpenChange={(o) => !o && setPaying(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>{t("recordPaymentFor", { number: paying.number })}</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <Input type="number" min={0} step="any" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("balance", { amount: inr(Number(paying.total) - Number(paying.amount_paid)) })}</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPaying(null)}>{t("cancel")}</Button>
              <Button onClick={() => { const d = paying; setPaying(null); act(d, () => sendJson(`/api/invoices/${d.id}`, "PATCH", { payment: payAmount }), t("paymentRecorded")); }}>
                {t("recordPayment")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", tone === "warn" ? "text-red-500" : "text-foreground")}>{value}</p>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesInner />
    </Suspense>
  );
}
