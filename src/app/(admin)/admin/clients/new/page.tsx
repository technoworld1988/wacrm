"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DURATIONS,
  DURATION_LABELS,
  PLANS,
  PLAN_IDS,
  computeEndDate,
  type Duration,
  type PlanId,
} from "@/lib/platform/plans";
import {
  CopyButton,
  ErrorNote,
  Field,
  Panel,
  PrimaryButton,
  api,
  fieldClass,
  formatDate,
  whatsappLink,
} from "../../ui";

interface Created {
  accountId: string;
  ownerEmail: string;
  link: string | null;
  tempPassword: string | null;
  planEndsAt: string;
}

function inr(n: number | null) {
  return n === null ? "—" : `₹${n.toLocaleString("en-IN")}`;
}

export default function AddClientPage() {
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [access, setAccess] = useState<"invite" | "password">("invite");
  const [plan, setPlan] = useState<PlanId>("pro");
  const [duration, setDuration] = useState<Duration>("1m");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const meta = PLANS[plan];

  if (created) {
    const signIn = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
    const message = created.link
      ? `Hello ${ownerName}, your WhatsApp CRM account for ${businessName} is ready.\n\nOpen this link to set your password (works once, within 1 hour):\n${created.link}\n\nAfter that, sign in any time at ${signIn} with ${created.ownerEmail}.\n\n— TECHNO WORLD`
      : `Hello ${ownerName}, your WhatsApp CRM account for ${businessName} is ready.\n\nSign in at ${signIn}\nEmail: ${created.ownerEmail}\nTemporary password: ${created.tempPassword}\n\nYou'll be asked to choose your own password the first time.\n\n— TECHNO WORLD`;
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          <h1 className="text-2xl font-bold text-foreground">{businessName} is ready</h1>
        </div>
        <Panel title="Send this to the owner">
          <p className="mb-3 text-sm text-muted-foreground">
            {created.link
              ? "The sign-in link works once and expires in about an hour. If it expires, open the client and create a new one."
              : "The temporary password is shown only now. The owner must change it at first sign-in."}{" "}
            Plan ends {formatDate(created.planEndsAt)}.
          </p>
          <pre className="whitespace-pre-wrap break-all rounded-lg border border-border bg-card-2 p-3 text-sm text-foreground">
            {message}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={whatsappLink(businessPhone || null, message)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#16A34A] px-4 text-sm font-semibold text-white hover:bg-[#15803D]"
            >
              <MessageCircle className="h-4 w-4" /> Send on WhatsApp
            </a>
            <CopyButton text={message} label="Copy message" />
          </div>
        </Panel>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/clients/${created.accountId}`}
            className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Open client
          </Link>
          <Link href="/admin" className="inline-flex h-11 items-center rounded-lg border border-input px-4 text-sm font-medium">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<Created>("/api/admin/clients", {
        method: "POST",
        body: JSON.stringify({ businessName, businessPhone, ownerName, ownerEmail, access, plan, duration, note }),
      });
      setCreated(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">Add client</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a private CRM account for the business and its owner login.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <Panel title="Business">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name">
                <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Kids Collection" className={fieldClass} />
              </Field>
              <Field label="WhatsApp number (optional)" hint="Used to send the login on WhatsApp.">
                <input type="tel" inputMode="tel" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="+91" className={fieldClass} />
              </Field>
            </div>
          </Panel>

          <Panel title="Owner login">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner name">
                <input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Full name" className={fieldClass} />
              </Field>
              <Field label="Owner email">
                <input required type="email" inputMode="email" autoComplete="off" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@business.com" className={fieldClass} />
              </Field>
            </div>
            <fieldset className="mt-4 flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-muted-foreground">How they get in</legend>
              {(
                [
                  ["invite", "Sign-in link", "They open it and set their own password (recommended)."],
                  ["password", "Temporary password", "They must change it the first time they sign in."],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
                    access === value ? "border-primary bg-primary-soft" : "border-input",
                  )}
                >
                  <input type="radio" name="access" className="mt-1" checked={access === value} onChange={() => setAccess(value)} />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{title}</span>
                    <span className="block text-sm text-muted-foreground">{desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </Panel>

          <Panel title="Plan & billing">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Plan">
                <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)} className={fieldClass}>
                  {PLAN_IDS.map((p) => (
                    <option key={p} value={p}>
                      {PLANS[p].name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Duration">
                <select value={duration} onChange={(e) => setDuration(e.target.value as Duration)} className={fieldClass}>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {DURATION_LABELS[d]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ends on">
                <input readOnly value={formatDate(computeEndDate(duration, null).toISOString())} className={cn(fieldClass, "bg-muted text-muted-foreground")} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Private note (only you see it)">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Setup ₹25,000 paid by UPI" className={cn(fieldClass, "h-auto py-2.5")} />
              </Field>
            </div>
          </Panel>

          <ErrorNote message={error} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <PrimaryButton type="submit" disabled={busy} className="sm:w-auto">
              {busy ? "Creating…" : access === "invite" ? "Create client & get link" : "Create client & get password"}
            </PrimaryButton>
            <Link href="/admin" className="inline-flex h-11 items-center justify-center rounded-lg border border-input px-4 text-sm font-medium">
              Cancel
            </Link>
          </div>
        </form>

        <aside className="brand-aurora-bg rounded-2xl p-5 text-white lg:sticky lg:top-4">
          <h2 className="text-base font-semibold text-[#F0CF86]">What {meta.name} includes</h2>
          <dl className="mt-4 grid grid-cols-[1.3fr_1fr] gap-x-3 gap-y-2.5 text-sm">
            <dt className="text-[#DCE0F6]">Price</dt>
            <dd>
              {inr(meta.monthlyInr)}/mo{meta.yearlyInr ? ` · ${inr(meta.yearlyInr)}/yr` : ""}
            </dd>
            <dt className="text-[#DCE0F6]">Team logins</dt>
            <dd>{meta.limits.users ?? "As agreed"}</dd>
            <dt className="text-[#DCE0F6]">WhatsApp numbers</dt>
            <dd>{meta.limits.numbers}</dd>
            <dt className="text-[#DCE0F6]">Contacts</dt>
            <dd>{meta.limits.contacts?.toLocaleString("en-IN") ?? "Unlimited"}</dd>
            <dt className="text-[#DCE0F6]">AI replies / month</dt>
            <dd>{meta.limits.aiReplies.toLocaleString("en-IN")}</dd>
          </dl>
          <p className="mt-4 border-t border-white/15 pt-3 text-xs text-[#DCE0F6]">
            Prices before GST. Plan limits are shown for reference and will be enforced in a later update.
          </p>
        </aside>
      </div>
    </div>
  );
}
