"use client";

import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { discountLabel, discountUsable } from "@/lib/platform/plans";
import {
  ErrorNote,
  Field,
  Panel,
  PrimaryButton,
  SecondaryButton,
  api,
  fieldClass,
  formatDate,
  useCatalog,
  type CatalogDiscount,
} from "../ui";

interface FormState {
  name: string;
  kind: "percent" | "amount";
  value: string;
  note: string;
  validUntil: string;
  isActive: boolean;
}

const EMPTY: FormState = { name: "", kind: "percent", value: "", note: "", validUntil: "", isActive: true };

export default function DiscountsPage() {
  const { discounts, error, reload } = useCatalog();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const open = (key: string, values: FormState) => {
    setEditing(key);
    setForm(values);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await api(editing === "new" ? "/api/admin/discounts" : `/api/admin/discounts/${editing}`, {
        method: editing === "new" ? "POST" : "PATCH",
        body: JSON.stringify({ ...form, value: Number(form.value) }),
      });
      setEditing(null);
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: CatalogDiscount) => {
    const extra = d.clients > 0 ? ` ${d.clients} client(s) will lose it.` : "";
    if (!(await confirmDialog(`Delete "${d.name}"?${extra}`, { destructive: true }))) return;
    try {
      await api(`/api/admin/discounts/${d.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">Discounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Offers you can give a client: a percent or a fixed amount off their plan price. Give one from the client&apos;s
            page or while adding a client.
          </p>
        </div>
        <PrimaryButton type="button" onClick={() => open("new", EMPTY)}>
          <Plus className="h-4 w-4" /> New discount
        </PrimaryButton>
      </div>

      <ErrorNote message={error} />

      {editing && (
        <Panel title={editing === "new" ? "New discount" : `Edit ${form.name || "discount"}`}>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Diwali offer, Website client" className={fieldClass} />
              </Field>
              <Field label="Last day (optional)" hint="After this date it can't be given to new clients.">
                <input type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} className={fieldClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <select value={form.kind} onChange={(e) => set("kind", e.target.value as FormState["kind"])} className={fieldClass}>
                  <option value="percent">Percent off (%)</option>
                  <option value="amount">Rupees off (₹)</option>
                </select>
              </Field>
              <Field label={form.kind === "percent" ? "Percent off" : "Rupees off (per period)"}>
                <input
                  inputMode="numeric"
                  value={form.value}
                  onChange={(e) => set("value", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={form.kind === "percent" ? "e.g. 20" : "e.g. 500"}
                  className={fieldClass}
                />
              </Field>
            </div>
            <Field label="Note (only you see it)">
              <input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. For clients who also took Meta ads" className={fieldClass} />
            </Field>
            <label className="flex items-center gap-3 text-sm text-foreground">
              <input type="checkbox" className="h-4 w-4" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
              On offer (can be given to clients)
            </label>
            <ErrorNote message={formError} />
            <div className="flex gap-2">
              <SecondaryButton type="button" onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="button" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save discount"}
              </PrimaryButton>
            </div>
          </div>
        </Panel>
      )}

      {!discounts && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {discounts && discounts.length === 0 && !editing && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            No discounts yet. Examples: &ldquo;Website client, 20% off&rdquo;, &ldquo;Yearly loyalty, ₹1,000 off&rdquo;,
            &ldquo;Diwali offer until 31 Oct&rdquo;.
          </p>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(discounts ?? []).map((d) => {
          const usable = discountUsable(d);
          return (
            <article key={d.id} className={cn("flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm", !usable && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate font-semibold text-foreground">{d.name}</h3>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                    usable ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground",
                  )}
                >
                  {usable ? "On offer" : d.isActive ? "Ended" : "Off"}
                </span>
              </div>
              <p className="text-lg font-bold text-[#7A5208] dark:text-[#F0CF86]">{discountLabel(d)}</p>
              <p className="text-sm text-muted-foreground">
                {d.validUntil ? `Until ${formatDate(`${d.validUntil}T12:00:00+05:30`)}` : "No end date"}
                {d.note ? ` · ${d.note}` : ""}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">
                  {d.clients} {d.clients === 1 ? "client" : "clients"}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => remove(d)}
                    aria-label={`Delete ${d.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-input text-red-700 hover:bg-muted dark:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <SecondaryButton
                    type="button"
                    className="h-9"
                    onClick={() =>
                      open(d.id, {
                        name: d.name,
                        kind: d.kind,
                        value: String(d.value),
                        note: d.note,
                        validUntil: d.validUntil ?? "",
                        isActive: d.isActive,
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </SecondaryButton>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
