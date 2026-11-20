"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Link2, MessageCircle, Pause, Play, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/brand";
import {
  daysLeft,
  discountLabel,
  discountUsable,
  inr,
  type ClientBucket,
  type PlatformDiscount,
  type PriceBreakdown,
} from "@/lib/platform/plans";
import {
  CopyButton,
  ErrorNote,
  Field,
  Panel,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  actionLabel,
  api,
  fieldClass,
  formatDate,
  useCatalog,
  timeAgo,
  whatsappLink,
} from "../../ui";
import { RenewDialog } from "../../renew-dialog";

interface Detail {
  client: {
    id: string;
    name: string;
    status: string;
    plan: string | null;
    planName: string | null;
    planIsBonus: boolean;
    discount: PlatformDiscount | null;
    pricing: Record<"1m" | "3m" | "12m", PriceBreakdown | null> | null;
    planEndsAt: string | null;
    businessPhone: string | null;
    createdAt: string;
    bucket: ClientBucket;
    isMine: boolean;
    whatsappConnected: boolean;
    note: string;
    usage: Record<"users" | "contacts" | "aiReplies" | "aiTests", { used: number; limit: number | null }>;
    branding: {
      whiteLabel: boolean;
      brandName: string | null;
      logoUrl: string | null;
      primary: string | null;
      accent: string | null;
      domain: string | null;
    };
  };
  members: { userId: string; name: string | null; email: string | null; role: string }[];
  activity: { id: string; action: string; createdAt: string }[];
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let cancelled = false;
    api<Detail>(`/api/admin/clients/${id}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        {error ? <ErrorNote message={error} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </div>
    );
  }
  const c = data.client;
  const left = daysLeft(c.planEndsAt);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">{c.name}</h1>
          <StatusBadge bucket={c.bucket} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {c.planName ?? "No plan"} ·{" "}
          {c.isMine
            ? "your own account"
            : c.planEndsAt
              ? `ends ${formatDate(c.planEndsAt)}${left !== null ? (left >= 0 ? ` (${left} days left)` : " (ended)") : ""}`
              : "no end date"}{" "}
          · WhatsApp {c.whatsappConnected ? "connected" : "not connected"}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5">
          <PlanPanel detail={data} onChanged={load} onRenew={() => setRenewing(true)} />
          <UsagePanel key={JSON.stringify(c.usage)} detail={data} onChanged={load} />
          {!c.isMine && <AccessPanel clientId={c.id} phone={c.businessPhone} name={c.name} />}
          <DetailsPanel detail={data} onChanged={load} />
        </div>
        <div className="flex flex-col gap-5">
          <BrandingPanel detail={data} onChanged={load} />
          <Panel title={`Team (${data.members.length})`}>
            <ul className="flex flex-col divide-y divide-border">
              {data.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{m.name || "—"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Activity">
            {data.activity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            <ul className="flex flex-col divide-y divide-border">
              {data.activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="text-foreground">{actionLabel(a.action)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {renewing && (
        <RenewDialog
          client={{ id: c.id, name: c.name, planName: c.planName, planEndsAt: c.planEndsAt }}
          onClose={() => setRenewing(false)}
          onDone={() => {
            setRenewing(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" /> Back to dashboard
    </Link>
  );
}

function PlanPanel({
  detail,
  onChanged,
  onRenew,
}: {
  detail: Detail;
  onChanged: () => void;
  onRenew: () => void;
}) {
  const c = detail.client;
  const { plans, discounts } = useCatalog();
  const [plan, setPlan] = useState<string>(c.plan ?? "");
  const [discountId, setDiscountId] = useState<string>(c.discount?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/clients/${c.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const blocked = c.bucket === "paused" || c.bucket === "pending";
  // The plan picker lists active plans plus the client's current one.
  const planOptions = (plans ?? []).filter((p) => p.isActive || p.key === c.plan);
  const discountOptions = (discounts ?? []).filter((d) => discountUsable(d) || d.id === c.discount?.id);
  const month = c.pricing?.["1m"] ?? null;

  const reminder = month
    ? `Hello, your WhatsApp CRM plan (${c.planName}) for ${c.name} ${
        c.planEndsAt ? `ends on ${formatDate(c.planEndsAt)}` : "is due for renewal"
      }.\n\nRenewal: ${inr(month.total)} per month${month.discount > 0 ? ` (after your ${inr(month.discount)} discount)` : ""} + GST.\n\nReply here to renew so your bot and inbox keep running without a break.\n\n— TECHNO WORLD`
    : null;

  return (
    <Panel title="Plan & billing">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Plan">
              {/* Mount the select only once the options exist: a select whose
                  options arrive after its value renders blank in Chrome. */}
              {!plans ? (
                <div className={cn(fieldClass, "flex items-center text-muted-foreground")}>Loading…</div>
              ) : (
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className={fieldClass}>
                {!c.plan && <option value="">No plan</option>}
                {planOptions.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                    {p.isBonus ? " (bonus)" : ""}
                    {!p.isActive ? " (hidden)" : ""}
                  </option>
                ))}
              </select>
              )}
            </Field>
          </div>
          <SecondaryButton
            type="button"
            disabled={busy || !plan || plan === c.plan}
            onClick={() =>
              act({ action: "update", plan }, "Change plan? The client's limits will reset to the new plan's limits.")
            }
          >
            Change plan
          </SecondaryButton>
        </div>

        {!c.planIsBonus && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Discount">
                {!discounts ? (
                  <div className={cn(fieldClass, "flex items-center text-muted-foreground")}>Loading…</div>
                ) : (
                <select value={discountId} onChange={(e) => setDiscountId(e.target.value)} className={fieldClass}>
                  <option value="">No discount</option>
                  {discountOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {discountLabel(d)}
                      {!discountUsable(d) ? " (ended)" : ""}
                    </option>
                  ))}
                </select>
                )}
              </Field>
            </div>
            <SecondaryButton
              type="button"
              disabled={busy || discountId === (c.discount?.id ?? "")}
              onClick={() => act({ action: "discount", discountId: discountId || null })}
            >
              {discountId ? "Apply" : "Remove"}
            </SecondaryButton>
          </div>
        )}

        {c.pricing && (
          <div className="rounded-xl border border-border bg-card-2 p-3 text-sm">
            {c.planIsBonus ? (
              <p className="text-foreground">Bonus plan: free. Renew it for free or move them to a paid plan when it ends.</p>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                {(["1m", "3m", "12m"] as const).map((d) =>
                  c.pricing?.[d] ? (
                    <div key={d} className="contents">
                      <dt className="text-muted-foreground">
                        {d === "1m" ? "1 month" : d === "3m" ? "3 months" : "12 months"}
                        {c.pricing[d]!.discount > 0 && (
                          <span className="ml-1 text-xs">
                            ({inr(c.pricing[d]!.base)} − {inr(c.pricing[d]!.discount)})
                          </span>
                        )}
                      </dt>
                      <dd className="text-right font-semibold text-foreground">{inr(c.pricing[d]!.total)}</dd>
                    </div>
                  ) : null,
                )}
                <dt className="col-span-2 mt-1 text-xs text-muted-foreground">Amounts to collect, before GST.</dt>
              </dl>
            )}
          </div>
        )}

        <ErrorNote message={error} />
        {!c.isMine && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <PrimaryButton type="button" className="flex-1" disabled={busy} onClick={onRenew}>
              Renew
            </PrimaryButton>
            {blocked ? (
              <SecondaryButton type="button" className="flex-1" disabled={busy} onClick={() => act({ action: "reactivate" })}>
                <Play className="h-4 w-4" /> {c.bucket === "pending" ? "Activate" : "Reactivate"}
              </SecondaryButton>
            ) : (
              <SecondaryButton
                type="button"
                className="flex-1 text-red-700 dark:text-red-300"
                disabled={busy}
                onClick={() =>
                  act(
                    { action: "pause" },
                    `Pause ${c.name}? Their team can't use the CRM until you reactivate. Their data stays safe.`,
                  )
                }
              >
                <Pause className="h-4 w-4" /> Pause
              </SecondaryButton>
            )}
          </div>
        )}
        {!c.isMine && reminder && !c.planIsBonus && (
          <a
            href={whatsappLink(c.businessPhone, reminder)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#16A34A]/40 px-4 text-sm font-medium text-[#15803D] hover:bg-[#16A34A]/10 dark:text-emerald-300"
          >
            <MessageCircle className="h-4 w-4" /> Send renewal reminder on WhatsApp
          </a>
        )}
      </div>
    </Panel>
  );
}

function AccessPanel({ clientId, phone, name }: { clientId: string; phone: string | null; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; link?: string; tempPassword?: string } | null>(null);

  const run = async (mode: "link" | "password") => {
    if (mode === "password" && !window.confirm("Replace the owner's password with a new temporary one?")) return;
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api(`/api/admin/clients/${clientId}/access`, { method: "POST", body: JSON.stringify({ mode }) }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signIn = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const message = result
    ? result.link
      ? `Hello, here is your new sign-in link for ${name}'s CRM (works once, within 1 hour):\n${result.link}\n\nAfter setting your password, sign in at ${signIn} with ${result.email}.`
      : `Hello, your CRM sign-in for ${name}:\n${signIn}\nEmail: ${result.email}\nTemporary password: ${result.tempPassword}\nYou'll choose a new password when you sign in.`
    : "";

  return (
    <Panel title="Owner sign-in">
      <p className="mb-3 text-sm text-muted-foreground">
        For when the owner can&apos;t get in or a link expired. Nothing is emailed: you send it on WhatsApp.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SecondaryButton type="button" className="flex-1" disabled={busy} onClick={() => run("link")}>
          <Link2 className="h-4 w-4" /> New sign-in link
        </SecondaryButton>
        <SecondaryButton type="button" className="flex-1" disabled={busy} onClick={() => run("password")}>
          <KeyRound className="h-4 w-4" /> Temporary password
        </SecondaryButton>
      </div>
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
      {result && (
        <div className="mt-3 flex flex-col gap-3">
          <pre className="whitespace-pre-wrap break-all rounded-lg border border-border bg-card-2 p-3 text-sm text-foreground">{message}</pre>
          <div className="flex flex-wrap gap-2">
            <a
              href={whatsappLink(phone, message)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#16A34A] px-4 text-sm font-semibold text-white hover:bg-[#15803D]"
            >
              <MessageCircle className="h-4 w-4" /> Send on WhatsApp
            </a>
            <CopyButton text={message} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function DetailsPanel({ detail, onChanged }: { detail: Detail; onChanged: () => void }) {
  const c = detail.client;
  const [name, setName] = useState(c.name);
  const [phone, setPhone] = useState(c.businessPhone ?? "");
  const [note, setNote] = useState(c.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <Panel title="Business details">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setSaved(false);
          try {
            await api(`/api/admin/clients/${c.id}`, {
              method: "PATCH",
              body: JSON.stringify({ action: "update", name, businessPhone: phone, note }),
            });
            setSaved(true);
            onChanged();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="WhatsApp number">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91" className={fieldClass} />
          </Field>
        </div>
        <Field label="Private note (only you see it)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cn(fieldClass, "h-auto py-2.5")} />
        </Field>
        <ErrorNote message={error} />
        <div className="flex items-center gap-3">
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </PrimaryButton>
          {saved && <span className="text-sm text-emerald-700 dark:text-emerald-300">Saved</span>}
        </div>
      </form>
    </Panel>
  );
}

function BrandingPanel({ detail, onChanged }: { detail: Detail; onChanged: () => void }) {
  const c = detail.client;
  const b = c.branding;
  const [whiteLabel, setWhiteLabel] = useState(b.whiteLabel);
  const [brandName, setBrandName] = useState(b.brandName ?? "");
  const [primary, setPrimary] = useState(b.primary ?? "#3E6FD6");
  const [accent, setAccent] = useState(b.accent ?? "#E0A93A");
  const [domain, setDomain] = useState(b.domain ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api(`/api/admin/clients/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "branding", whiteLabel, brandName, primary, accent, domain }),
      });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      await api(`/api/admin/clients/${c.id}/logo`, { method: "POST", body: fd });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Branding">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-input p-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={whiteLabel} onChange={(e) => setWhiteLabel(e.target.checked)} />
        <span>
          <span className="block text-sm font-semibold text-foreground">White label</span>
          <span className="block text-sm text-muted-foreground">
            Show the client&apos;s own logo, name and colours, and hide &ldquo;Powered by TECHNO WORLD&rdquo;. Off = your
            branding.
          </span>
        </span>
      </label>

      {whiteLabel && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="brand-aurora-bg flex h-20 w-40 items-center justify-center rounded-xl">
              <BrandLogo
                brand={{ whiteLabel: true, name: brandName || c.name, logoUrl: b.logoUrl, primary, accent }}
              />
            </div>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-4 text-sm font-medium hover:bg-muted">
              <Upload className="h-4 w-4" /> {b.logoUrl ? "Change logo" : "Upload logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">PNG, JPG or WebP under 1 MB. A wide logo on a white or transparent background works best.</p>
          <Field label="App name" hint="Shown when there is no logo, e.g. “Kids Collection CRM”.">
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={c.name} className={fieldClass} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Main colour">
              <span className="flex items-center gap-2">
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1" aria-label="Main colour picker" />
                <input value={primary} onChange={(e) => setPrimary(e.target.value)} className={fieldClass} />
              </span>
            </Field>
            <Field label="Accent colour">
              <span className="flex items-center gap-2">
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1" aria-label="Accent colour picker" />
                <input value={accent} onChange={(e) => setAccent(e.target.value)} className={fieldClass} />
              </span>
            </Field>
          </div>
          <Field
            label="Their web address (optional)"
            hint="e.g. crm.theirbusiness.com. Also needs the domain added in hosting. Needs paid hosting."
          >
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="crm.theirbusiness.com" className={fieldClass} />
          </Field>
        </div>
      )}

      <div className="mt-4">
        <ErrorNote message={error} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <PrimaryButton type="button" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save branding"}
        </PrimaryButton>
        {saved && <span className="text-sm text-emerald-700 dark:text-emerald-300">Saved</span>}
      </div>
    </Panel>
  );
}

const USAGE_ROWS: { key: "users" | "contacts" | "aiReplies" | "aiTests"; label: string; min: number }[] = [
  { key: "users", label: "Team logins", min: 1 },
  { key: "contacts", label: "Contacts", min: 0 },
  { key: "aiReplies", label: "AI replies this month", min: 0 },
  { key: "aiTests", label: "AI test messages this month", min: 0 },
];

function UsagePanel({ detail, onChanged }: { detail: Detail; onChanged: () => void }) {
  const c = detail.client;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      USAGE_ROWS.map((r) => [r.key, c.usage[r.key].limit === null ? "" : String(c.usage[r.key].limit)]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel
      title="Usage & limits"
      actions={
        !editing ? (
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium text-primary hover:underline">
            Change limits
          </button>
        ) : null
      }
    >
      <ul className="flex flex-col gap-3">
        {USAGE_ROWS.map((r) => {
          const u = c.usage[r.key];
          const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
          const tone = u.limit === null ? "bg-primary" : pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-[#E0A93A]" : "bg-primary";
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{r.label}</span>
                {editing ? (
                  <input
                    inputMode="numeric"
                    value={values[r.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [r.key]: e.target.value.replace(/[^0-9]/g, "") }))}
                    placeholder="Unlimited"
                    aria-label={`${r.label} limit`}
                    className={cn(fieldClass, "h-9 w-32 text-right")}
                  />
                ) : (
                  <span className="font-semibold text-foreground">
                    {u.used.toLocaleString("en-IN")} / {u.limit === null ? "unlimited" : u.limit.toLocaleString("en-IN")}
                  </span>
                )}
              </div>
              {!editing && (
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", tone)} style={{ width: u.limit === null ? "0%" : `${pct}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Leave a box empty for unlimited. Selling an AI top-up? Raise &ldquo;AI replies this month&rdquo; (e.g. +1,000 for ₹499);
            set it back next month. Changing the plan resets these to the plan&apos;s defaults.
          </p>
          <ErrorNote message={error} />
          <div className="flex gap-2">
            <SecondaryButton type="button" className="flex-1" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              className="flex-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const num = (k: string) => (values[k] === "" ? null : Number(values[k]));
                  await api(`/api/admin/clients/${c.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      action: "limits",
                      users: num("users"),
                      contacts: num("contacts"),
                      aiReplies: num("aiReplies"),
                      aiTests: num("aiTests"),
                    }),
                  });
                  setEditing(false);
                  onChanged();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save limits"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Panel>
  );
}
