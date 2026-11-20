"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Plus, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysLeft, type ClientBucket } from "@/lib/platform/plans";
import {
  ErrorNote,
  Panel,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  actionLabel,
  api,
  fieldClass,
  formatDate,
  timeAgo,
} from "./ui";
import { RenewDialog } from "./renew-dialog";

interface Client {
  id: string;
  name: string;
  status: string;
  plan: string | null;
  planName: string | null;
  planEndsAt: string | null;
  businessPhone: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  whatsappConnected: boolean;
  isMine: boolean;
  bucket: ClientBucket;
}
interface Overview {
  counts: Record<"total" | "active" | "trial" | "expiring" | "paused" | "pending", number>;
  clients: Client[];
  activity: { id: string; accountName: string | null; action: string; createdAt: string }[];
}

type Filter = "all" | ClientBucket;

export default function AdminDashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [renewing, setRenewing] = useState<Client | null>(null);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let cancelled = false;
    api<Overview>("/api/admin/overview")
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const clients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.clients ?? []).filter((c) => {
      if (filter !== "all" && c.bucket !== filter) return false;
      if (!q) return true;
      return [c.name, c.ownerEmail, c.ownerName, c.businessPhone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, query, filter]);

  const counters: { key: Filter; label: string; value: number; tone: string }[] = data
    ? [
        { key: "all", label: "Total clients", value: data.counts.total, tone: "" },
        { key: "active", label: "Active", value: data.counts.active, tone: "text-emerald-700 dark:text-emerald-300" },
        { key: "trial", label: "On free trial", value: data.counts.trial, tone: "text-[#2C69A7] dark:text-[#9DB8F0]" },
        { key: "expiring", label: "Expiring in 7 days", value: data.counts.expiring, tone: "text-[#7A5208] dark:text-[#F0CF86]" },
        { key: "paused", label: "Paused", value: data.counts.paused, tone: "text-red-700 dark:text-red-300" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every client business on your CRM.</p>
        </div>
        <div className="flex gap-2">
          <SecondaryButton type="button" onClick={load} aria-label="Refresh" className="w-11 px-0">
            <RefreshCw className="h-4 w-4" />
          </SecondaryButton>
          <Link
            href="/admin/clients/new"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" /> Add client
          </Link>
        </div>
      </div>

      <ErrorNote message={error} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(data ? counters : Array.from({ length: 5 }, (_, i) => ({ key: String(i) as Filter, label: "", value: 0, tone: "" }))).map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={!data}
            onClick={() => setFilter(c.key)}
            className={cn(
              "flex min-h-[92px] flex-col items-start gap-1 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors",
              filter === c.key && data ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
              c.key === "expiring" && "bg-[#FBF1DC]/60 dark:bg-[#E0A93A]/10",
            )}
          >
            <span className="text-xs font-medium text-muted-foreground sm:text-sm">{c.label || " "}</span>
            <span className={cn("text-3xl font-bold tracking-tight text-foreground", c.tone)}>
              {data ? c.value : <span className="inline-block h-7 w-8 animate-pulse rounded bg-muted" />}
            </span>
          </button>
        ))}
      </div>

      <Panel
        title="Clients"
        actions={
          filter !== "all" ? (
            <button type="button" onClick={() => setFilter("all")} className="text-sm text-primary hover:underline">
              Show all
            </button>
          ) : null
        }
      >
        <label className="relative mb-4 block">
          <span className="sr-only">Search clients</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Business, owner, email or number"
            className={cn(fieldClass, "pl-9")}
          />
        </label>

        {!data && !error && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
        {data && clients.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {data.clients.length === 0 ? "No clients yet. Add your first one." : "No clients match."}
          </p>
        )}

        {/* Desktop table */}
        {clients.length > 0 && (
          <div className="hidden overflow-hidden rounded-xl border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-card-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3">Renews on</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-t border-border align-middle">
                    <td className="px-4 py-3">
                      <Link href={`/admin/clients/${c.id}`} className="font-semibold text-foreground hover:text-primary">
                        {c.name}
                        {c.isMine && <span className="ml-1 font-normal text-muted-foreground">(you)</span>}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {c.ownerEmail ?? "—"} · {c.memberCount} {c.memberCount === 1 ? "user" : "users"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{c.planName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.whatsappConnected ? "Connected" : "Not connected"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.isMine ? "Own account" : formatDate(c.planEndsAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge bucket={c.bucket} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {!c.isMine && (
                          <SecondaryButton type="button" className="h-9" onClick={() => setRenewing(c)}>
                            Renew
                          </SecondaryButton>
                        )}
                        <Link
                          href={`/admin/clients/${c.id}`}
                          className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-sm font-medium hover:bg-muted"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Phone cards */}
        <ul className="flex flex-col gap-3 md:hidden">
          {clients.map((c) => {
            const left = daysLeft(c.planEndsAt);
            return (
              <li key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/clients/${c.id}`} className="min-w-0 font-semibold text-foreground">
                    <span className="block truncate">{c.name}</span>
                  </Link>
                  <StatusBadge bucket={c.bucket} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {c.planName ?? "—"} ·{" "}
                  {c.isMine
                    ? "own account"
                    : c.planEndsAt
                      ? `${left !== null && left >= 0 ? `${left} days left` : "ended"} (${formatDate(c.planEndsAt)})`
                      : "no end date"}
                </p>
                <div className="mt-3 flex gap-2">
                  {!c.isMine && (
                    <PrimaryButton type="button" className="flex-1" onClick={() => setRenewing(c)}>
                      Renew
                    </PrimaryButton>
                  )}
                  <Link
                    href={`/admin/clients/${c.id}`}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-input text-sm font-medium"
                  >
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Recent activity">
          {data && data.activity.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing yet. Actions you take here show up in this list.</p>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {data?.activity.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 text-foreground">
                  {actionLabel(a.action)}
                  {a.accountName && <span className="text-muted-foreground"> · {a.accountName}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <section className="rounded-2xl border border-[#E0A93A]/50 bg-[#FBF1DC] p-5 text-[#5C3D06] dark:bg-[#E0A93A]/10 dark:text-[#F0CF86]">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#7A5208] dark:text-[#F0CF86]">
            <BellRing className="h-4 w-4" /> Renewal reminders
          </h2>
          <p className="mt-2 text-sm">
            7 days before a plan ends you get a phone notification. If a plan ends without renewal, the client is
            paused automatically. Their chats and contacts stay safe until you renew.
          </p>
          <p className="mt-2 text-sm">
            Turn on notifications on your phone in{" "}
            <Link href="/settings?tab=profile" className="font-semibold underline">
              Settings → Your profile
            </Link>
            .
          </p>
        </section>
      </div>

      {renewing && (
        <RenewDialog
          client={renewing}
          onClose={() => setRenewing(null)}
          onDone={() => {
            setRenewing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
