"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, type ClientBucket, type PlanId, isPlanId } from "@/lib/platform/plans";

// Small presentational pieces shared by the admin pages.

export const BUCKET_LABEL: Record<ClientBucket, string> = {
  active: "Active",
  trial: "Trial",
  expiring: "Expiring",
  paused: "Paused",
  pending: "Not activated",
};

const BUCKET_STYLE: Record<ClientBucket, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  trial: "bg-[#E8EEFC] text-[#2C69A7] dark:bg-[#3E6FD6]/20 dark:text-[#9DB8F0]",
  expiring: "bg-[#FBF1DC] text-[#7A5208] dark:bg-[#E0A93A]/20 dark:text-[#F0CF86]",
  paused: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  pending: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
};

export function StatusBadge({ bucket }: { bucket: ClientBucket }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        BUCKET_STYLE[bucket],
      )}
    >
      {BUCKET_LABEL[bucket]}
    </span>
  );
}

export function planName(plan: string | null): string {
  return plan && isPlanId(plan) ? PLANS[plan as PlanId].name : "—";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "No end date";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return formatDate(iso);
}

const ACTION_LABEL: Record<string, string> = {
  client_created: "Client created",
  plan_renewed: "Plan renewed",
  client_paused: "Paused",
  client_reactivated: "Reactivated",
  auto_paused: "Paused automatically (plan ended)",
  client_updated: "Details updated",
  branding_updated: "Branding updated",
  logo_uploaded: "Logo uploaded",
  logo_removed: "Logo removed",
  temp_password_set: "Temporary password created",
  signin_link_created: "Sign-in link created",
};
export function actionLabel(a: string): string {
  return ACTION_LABEL[a] ?? a.replace(/_/g, " ");
}

export function Panel({
  title,
  children,
  className,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5", className)}
    >
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const fieldClass =
  "h-11 w-full rounded-lg border border-input bg-card-2 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function PrimaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50",
        className,
      )}
    />
  );
}

export function SecondaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50",
        className,
      )}
    />
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <SecondaryButton
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked — the text is visible to copy by hand */
        }
      }}
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {done ? "Copied" : label}
    </SecondaryButton>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {message}
    </div>
  );
}

/** wa.me link with a prefilled message; digits-only phone or none. */
export function whatsappLink(phone: string | null, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const q = `text=${encodeURIComponent(text)}`;
  return digits ? `https://wa.me/${digits}?${q}` : `https://wa.me/?${q}`;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}
