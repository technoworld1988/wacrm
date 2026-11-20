"use client";

import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useState } from "react";
import { Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DURATIONS, DURATION_LABELS, inr, type Duration } from "@/lib/platform/plans";
import {
  ErrorNote,
  Field,
  Panel,
  PrimaryButton,
  SecondaryButton,
  api,
  fieldClass,
  useCatalog,
  type CatalogPlan,
} from "../ui";

interface FormState {
  name: string;
  description: string;
  isBonus: boolean;
  monthlyPrice: string;
  yearlyPrice: string;
  users: string;
  numbers: string;
  contacts: string;
  aiReplies: string;
  aiTests: string;
  defaultDuration: Duration;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: "",
  description: "",
  isBonus: false,
  monthlyPrice: "",
  yearlyPrice: "",
  users: "2",
  numbers: "1",
  contacts: "5000",
  aiReplies: "300",
  aiTests: "100",
  defaultDuration: "1m",
  isActive: true,
};

const str = (n: number | null) => (n === null ? "" : String(n));

function fromPlan(p: CatalogPlan): FormState {
  return {
    name: p.name,
    description: p.description,
    isBonus: p.isBonus,
    monthlyPrice: str(p.monthlyPrice),
    yearlyPrice: str(p.yearlyPrice),
    users: str(p.limits.users),
    numbers: String(p.limits.numbers),
    contacts: str(p.limits.contacts),
    aiReplies: str(p.limits.aiReplies),
    aiTests: str(p.limits.aiTests),
    defaultDuration: p.defaultDuration,
    isActive: p.isActive,
  };
}

const limit = (n: number | null, unit = "") => (n === null ? "Unlimited" : `${n.toLocaleString("en-IN")}${unit}`);

export default function PlansPage() {
  const { plans, error, reload } = useCatalog();
  // null = closed, "new" = creating, otherwise the key being edited
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const open = (key: string | "new", values: FormState) => {
    setEditing(key);
    setForm(values);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const digits = (v: string) => v.replace(/[^0-9]/g, "");

  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await api(editing === "new" ? "/api/admin/plans" : `/api/admin/plans/${editing}`, {
        method: editing === "new" ? "POST" : "PATCH",
        body: JSON.stringify(form),
      });
      setEditing(null);
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: CatalogPlan) => {
    if (!(await confirmDialog(`Delete the plan "${p.name}"? This can't be undone.`, { destructive: true }))) return;
    try {
      await api(`/api/admin/plans/${p.key}`, { method: "DELETE" });
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const groups: { title: string; items: CatalogPlan[] }[] = [
    { title: "Plans", items: (plans ?? []).filter((p) => !p.isBonus) },
    { title: "Bonus plans (free with another service)", items: (plans ?? []).filter((p) => p.isBonus) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">Plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your price list. Create your own plans, including free bonus plans for clients who buy a website, Meta ads
            or a video package from you.
          </p>
        </div>
        <div className="flex gap-2">
          <SecondaryButton type="button" onClick={() => open("new", { ...EMPTY, isBonus: true, defaultDuration: "3m", monthlyPrice: "0" })}>
            <Gift className="h-4 w-4" /> New bonus plan
          </SecondaryButton>
          <PrimaryButton type="button" onClick={() => open("new", EMPTY)}>
            <Plus className="h-4 w-4" /> New plan
          </PrimaryButton>
        </div>
      </div>

      <ErrorNote message={error} />

      {editing && (
        <Panel title={editing === "new" ? (form.isBonus ? "New bonus plan" : "New plan") : `Edit ${form.name || "plan"}`}>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Plan name">
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Website bonus — 3 months" className={fieldClass} />
              </Field>
              <Field label="Short description (optional)">
                <input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Free with any website package" className={fieldClass} />
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-input p-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={form.isBonus} onChange={(e) => set("isBonus", e.target.checked)} />
              <span>
                <span className="block text-sm font-semibold text-foreground">Bonus plan (free)</span>
                <span className="block text-sm text-muted-foreground">
                  Given free with another service. Give it an end date so you aren&apos;t paying for it forever.
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              {!form.isBonus && (
                <>
                  <Field label="Price per month (₹)" hint="Empty = quote by hand">
                    <input inputMode="numeric" value={form.monthlyPrice} onChange={(e) => set("monthlyPrice", digits(e.target.value))} className={fieldClass} />
                  </Field>
                  <Field label="Price per year (₹)" hint="Empty = 12 × monthly">
                    <input inputMode="numeric" value={form.yearlyPrice} onChange={(e) => set("yearlyPrice", digits(e.target.value))} className={fieldClass} />
                  </Field>
                </>
              )}
              <Field label={form.isBonus ? "Free for" : "Usual duration"}>
                <select value={form.defaultDuration} onChange={(e) => set("defaultDuration", e.target.value as Duration)} className={fieldClass}>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {DURATION_LABELS[d]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Limits (leave empty for unlimited)</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {(
                  [
                    ["users", "Team logins"],
                    ["numbers", "WhatsApp numbers"],
                    ["contacts", "Contacts"],
                    ["aiReplies", "AI replies / month"],
                    ["aiTests", "AI tests / month"],
                  ] as const
                ).map(([k, label]) => (
                  <Field key={k} label={label}>
                    <input
                      inputMode="numeric"
                      value={form[k]}
                      onChange={(e) => set(k, digits(e.target.value))}
                      placeholder={k === "numbers" ? "1" : "Unlimited"}
                      className={fieldClass}
                    />
                  </Field>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <input type="checkbox" className="h-4 w-4" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
              Show this plan when adding or changing a client
            </label>

            {editing !== "new" && (
              <p className="text-xs text-muted-foreground">
                Clients already on this plan keep their current limits. To update them, use &ldquo;Change limits&rdquo; on each
                client&apos;s page.
              </p>
            )}
            <ErrorNote message={formError} />
            <div className="flex gap-2">
              <SecondaryButton type="button" onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="button" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save plan"}
              </PrimaryButton>
            </div>
          </div>
        </Panel>
      )}

      {!plans && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.title} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((p) => (
                  <article
                    key={p.key}
                    className={cn(
                      "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm",
                      p.isBonus ? "border-[#E0A93A]/60" : "border-border",
                      !p.isActive && "opacity-60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-foreground">{p.name}</h3>
                        {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {p.isBonus && (
                          <span className="rounded-full bg-[#FBF1DC] px-2 py-0.5 text-xs font-semibold text-[#7A5208]">Bonus</span>
                        )}
                        {!p.isActive && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Hidden</span>
                        )}
                      </div>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {p.isBonus
                        ? `Free · ${DURATION_LABELS[p.defaultDuration]}`
                        : p.monthlyPrice === null
                          ? "Quote by hand"
                          : `${inr(p.monthlyPrice)}/mo`}
                      {!p.isBonus && p.yearlyPrice !== null && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">{inr(p.yearlyPrice)}/yr</span>
                      )}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">Team logins</dt>
                      <dd className="text-right text-foreground">{limit(p.limits.users)}</dd>
                      <dt className="text-muted-foreground">Numbers</dt>
                      <dd className="text-right text-foreground">{p.limits.numbers}</dd>
                      <dt className="text-muted-foreground">Contacts</dt>
                      <dd className="text-right text-foreground">{limit(p.limits.contacts)}</dd>
                      <dt className="text-muted-foreground">AI replies / mo</dt>
                      <dd className="text-right text-foreground">{limit(p.limits.aiReplies)}</dd>
                      <dt className="text-muted-foreground">AI tests / mo</dt>
                      <dd className="text-right text-foreground">{limit(p.limits.aiTests)}</dd>
                    </dl>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">
                        {p.clients} {p.clients === 1 ? "client" : "clients"}
                      </span>
                      <div className="flex gap-2">
                        {!p.isBuiltin && p.clients === 0 && (
                          <button
                            type="button"
                            onClick={() => remove(p)}
                            aria-label={`Delete ${p.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-input text-red-700 hover:bg-muted dark:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <SecondaryButton type="button" className="h-9" onClick={() => open(p.key, fromPlan(p))}>
                          <Pencil className="h-4 w-4" /> Edit
                        </SecondaryButton>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}
