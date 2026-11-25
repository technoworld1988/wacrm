"use client";

// Create / edit an estimate or invoice: customer, dates, line items with
// GST rate, discount, notes. Totals preview uses the same maths as the
// server (src/lib/invoices/calc.ts), which recomputes on save.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { contactSearchFilter } from "@/lib/contacts/search-filter";
import { computeTotals, GST_RATES, GST_STATES, inr, istDate, type InvoiceItem } from "@/lib/invoices/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendJson } from "@/components/followups/shared";

export interface InvoiceDoc {
  id: string;
  kind: "estimate" | "invoice";
  number: string;
  status: string;
  contact_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_gstin: string | null;
  customer_address: string | null;
  place_of_supply: string | null;
  issue_date: string;
  due_date: string | null;
  items: InvoiceItem[];
  discount: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  amount_paid: number;
  notes: string | null;
  terms: string | null;
  public_token: string;
  reminder_count: number;
  last_reminder_at: string | null;
  last_error: string | null;
}

interface ContactOption {
  id: string;
  name: string | null;
  phone: string | null;
  company?: string | null;
}

const emptyItem = (): InvoiceItem => ({ description: "", hsn: "", qty: 1, rate: 0, gst_rate: 18 });
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function InvoiceEditor({
  kind,
  doc,
  sellerState,
  onClose,
  onSaved,
}: {
  kind: "estimate" | "invoice";
  doc?: InvoiceDoc | null;
  sellerState: string | null;
  onClose: () => void;
  onSaved: (doc: InvoiceDoc) => void;
}) {
  const t = useTranslations("Invoices");
  const today = istDate();
  const [contact, setContact] = useState<ContactOption | null>(
    doc?.contact_id ? { id: doc.contact_id, name: doc.customer_name, phone: doc.customer_phone } : null,
  );
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [name, setName] = useState(doc?.customer_name ?? "");
  const [phone, setPhone] = useState(doc?.customer_phone ?? "");
  const [gstin, setGstin] = useState(doc?.customer_gstin ?? "");
  const [address, setAddress] = useState(doc?.customer_address ?? "");
  const [pos, setPos] = useState(doc?.place_of_supply ?? sellerState ?? "");
  const [issue, setIssue] = useState(doc?.issue_date ?? today);
  const [due, setDue] = useState(doc?.due_date ?? plusDays(today, kind === "invoice" ? 15 : 30));
  const [items, setItems] = useState<InvoiceItem[]>(doc?.items?.length ? doc.items : [emptyItem()]);
  const [discount, setDiscount] = useState(doc?.discount ?? 0);
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (contact) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      let q = createClient().from("contacts").select("id, name, phone, company").order("updated_at", { ascending: false }).limit(6);
      const f = contactSearchFilter(search);
      if (f) q = q.or(f);
      const { data } = await q;
      if (mine === seq.current) setOptions((data ?? []) as ContactOption[]);
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, contact]);

  const totals = useMemo(() => computeTotals(items, discount, sellerState, pos || null), [items, discount, sellerState, pos]);
  const setItem = (i: number, patch: Partial<InvoiceItem>) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const pickContact = (c: ContactOption) => {
    setContact(c);
    if (!name) setName(c.company || c.name || c.phone || "");
    if (!phone) setPhone(c.phone ?? "");
  };

  const save = async () => {
    setSaving(true);
    const body = {
      ...(doc ? {} : { kind }),
      contact_id: contact?.id ?? null,
      customer_name: name,
      customer_phone: phone,
      customer_gstin: gstin,
      customer_address: address,
      place_of_supply: pos || null,
      issue_date: issue,
      due_date: due || null,
      items: items.filter((i) => i.description.trim()),
      discount,
      notes,
    };
    const res = doc ? await sendJson(`/api/invoices/${doc.id}`, "PATCH", body) : await sendJson("/api/invoices", "POST", body);
    setSaving(false);
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    toast.success(t("saved"));
    onSaved(res.data?.invoice as InvoiceDoc);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {doc ? t("editDoc", { number: doc.number }) : kind === "invoice" ? t("newInvoice") : t("newEstimate")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("whatsappContact")}</Label>
              {contact ? (
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="truncate">{contact.name || contact.phone}</span>
                  <button type="button" className="text-xs text-primary" onClick={() => setContact(null)}>
                    {t("change")}
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Input value={search} placeholder={t("searchContact")} onChange={(e) => setSearch(e.target.value)} />
                  {options.length > 0 && (
                    <ul className="max-h-36 overflow-y-auto rounded-lg border border-border">
                      {options.map((o) => (
                        <li key={o.id}>
                          <button type="button" onClick={() => pickContact(o)} className="flex w-full justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted">
                            <span className="truncate">{o.name || o.phone}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{o.phone}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">{t("contactHint")}</p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">{t("billTo")}</Label>
              <Input id="inv-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-gstin">{t("customerGstin")}</Label>
              <Input id="inv-gstin" value={gstin} maxLength={15} placeholder="19ABCDE1234F1Z5" onChange={(e) => {
                const v = e.target.value.toUpperCase();
                setGstin(v);
                if (/^[0-9]{2}/.test(v)) setPos(v.slice(0, 2));
              }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-pos">{t("placeOfSupply")}</Label>
              <select id="inv-pos" value={pos} onChange={(e) => setPos(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                <option value="">—</option>
                {GST_STATES.map(([c, n]) => (
                  <option key={c} value={c}>{c} · {n}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="inv-addr">{t("customerAddress")}</Label>
              <textarea id="inv-addr" value={address} rows={2} maxLength={500} onChange={(e) => setAddress(e.target.value)} className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-issue">{t("issueDate")}</Label>
              <Input id="inv-issue" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-due">{kind === "invoice" ? t("dueDate") : t("validTill")}</Label>
              <Input id="inv-due" type="date" value={due ?? ""} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <Label>{t("items")}</Label>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-6 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_5rem_4.5rem_7rem_5.5rem_auto]">
                <Input className="col-span-6 sm:col-span-1" value={it.description} placeholder={t("itemPlaceholder")} maxLength={300} onChange={(e) => setItem(i, { description: e.target.value })} />
                <Input className="col-span-2 sm:col-span-1" value={it.hsn ?? ""} placeholder="HSN/SAC" maxLength={12} onChange={(e) => setItem(i, { hsn: e.target.value })} aria-label="HSN/SAC" />
                <Input className="col-span-1" type="number" min={0} step="any" value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} aria-label={t("qty")} />
                <Input className="col-span-3 sm:col-span-1" type="number" min={0} step="any" value={it.rate} onChange={(e) => setItem(i, { rate: Number(e.target.value) })} aria-label={t("rate")} />
                <select value={it.gst_rate} onChange={(e) => setItem(i, { gst_rate: Number(e.target.value) })} aria-label="GST" className="col-span-3 h-9 rounded-lg border border-border bg-background px-2 text-sm sm:col-span-1">
                  {GST_RATES.map((r) => (
                    <option key={r} value={r}>GST {r}%</option>
                  ))}
                </select>
                <div className="col-span-3 flex items-center justify-end gap-2 sm:col-span-1">
                  <span className="text-sm tabular-nums">{inr((Number(it.qty) || 0) * (Number(it.rate) || 0))}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500" aria-label={t("removeItem")}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {items.length < 100 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, emptyItem()])}>
                <Plus className="mr-1 h-4 w-4" />
                {t("addItem")}
              </Button>
            )}
          </div>

          {/* Totals */}
          <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
            <div className="space-y-1.5">
              <Label htmlFor="inv-notes">{t("notes")}</Label>
              <textarea id="inv-notes" value={notes} rows={3} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesPlaceholder")} className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
            </div>
            <dl className="space-y-1 rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between"><dt>{t("subtotal")}</dt><dd>{inr(totals.subtotal)}</dd></div>
              <div className="flex items-center justify-between gap-2">
                <dt>{t("discount")}</dt>
                <dd><Input type="number" min={0} step="any" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="h-7 w-24 text-right" /></dd>
              </div>
              {totals.intraState ? (
                <>
                  <div className="flex justify-between"><dt>CGST</dt><dd>{inr(totals.cgst)}</dd></div>
                  <div className="flex justify-between"><dt>SGST</dt><dd>{inr(totals.sgst)}</dd></div>
                </>
              ) : (
                <div className="flex justify-between"><dt>IGST</dt><dd>{inr(totals.igst)}</dd></div>
              )}
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>{t("total")}</dt><dd>{inr(totals.total)}</dd></div>
            </dl>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={save} disabled={saving || !name.trim() || !items.some((i) => i.description.trim())}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("saveDraft")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
