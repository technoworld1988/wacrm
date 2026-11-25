"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, BellRing, CalendarClock, Loader2, MapPin, MessageSquare, Pencil, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sendJson } from "@/components/followups/shared";
import { AppointmentDialog, type AppointmentRow } from "@/components/appointments/appointment-dialog";
import { ReminderSettings, type ReminderSettingsRow } from "@/components/appointments/reminder-settings";
import { StatusBadge, reminderLine } from "@/components/appointments/status";

type Tab = "upcoming" | "attention" | "past" | "settings";
const TABS: Tab[] = ["upcoming", "attention", "past", "settings"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function AppointmentsInner() {
  const t = useTranslations("Appointments");
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "upcoming") as Tab;
  const { accountId } = useAuth();
  const canAct = useCan("send-messages");
  const canEdit = useCan("edit-settings");
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [attentionCount, setAttentionCount] = useState(0);
  const [settings, setSettings] = useState<ReminderSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AppointmentRow | "new" | null>(null);
  const [version, setVersion] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const supabase = createClient();
    const now = new Date();
    const sel = "*, contact:contacts(id, name, phone, conversations(id))";
    let q = supabase.from("appointments").select(sel).eq("account_id", accountId);
    if (tab === "upcoming") {
      q = q.gte("starts_at", new Date(now.getTime() - 2 * 3600_000).toISOString()).in("status", ["scheduled", "confirmed", "reschedule_requested"]).order("starts_at", { ascending: true });
    } else if (tab === "attention") {
      q = q.eq("status", "reschedule_requested").order("starts_at", { ascending: true });
    } else {
      q = q.lt("starts_at", now.toISOString()).order("starts_at", { ascending: false });
    }
    Promise.all([
      tab === "settings" ? Promise.resolve({ data: [] }) : q.limit(200),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "reschedule_requested"),
      supabase.from("appointment_settings").select("*").eq("account_id", accountId).maybeSingle(),
    ]).then(([list, attention, s]) => {
      if (cancelled) return;
      setRows(((list as { data: unknown[] | null }).data ?? []) as AppointmentRow[]);
      setAttentionCount(attention.count ?? 0);
      setSettings((s.data as ReminderSettingsRow | null) ?? null);
      setNowMs(now.getTime());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, tab, version]);

  const setTab = (next: Tab) => router.replace(next === "upcoming" ? "/appointments" : `/appointments?tab=${next}`, { scroll: false });

  const setStatus = async (a: AppointmentRow, status: AppointmentRow["status"]) => {
    const res = await sendJson(`/api/appointments/${a.id}`, "PATCH", { status });
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    reload();
  };

  const groups: { key: string; label: string; items: AppointmentRow[] }[] = [];
  for (const a of rows) {
    const d = new Date(a.starts_at);
    const k = dayKey(d);
    let g = groups.find((x) => x.key === k);
    if (!g) {
      const today = new Date(nowMs);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const label =
        k === dayKey(today)
          ? t("today")
          : k === dayKey(tomorrow)
            ? t("tomorrow")
            : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      g = { key: k, label, items: [] };
      groups.push(g);
    }
    g.items.push(a);
  }

  const remindersOff = !settings?.template_name;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canAct && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" />
            {t("newTitle")}
          </Button>
        )}
      </div>

      {!loading && remindersOff && tab !== "settings" && (
        <button
          type="button"
          onClick={() => setTab("settings")}
          className="flex w-full items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <BellRing className="h-4 w-4 shrink-0" />
          {t("remindersOffBanner")}
        </button>
      )}

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-1" role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "settings" && <Settings2 className="h-3.5 w-3.5" />}
            {t(`tab_${k}`)}
            {k === "attention" && attentionCount > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[11px] text-white">{attentionCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "settings" ? (
        <ReminderSettings key={version} initial={settings} canEdit={canEdit} onSaved={reload} />
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-medium text-foreground">{t(`empty_${tab}`)}</p>
          {tab === "upcoming" && <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key} className="rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{g.label}</h2>
              <ul className="divide-y divide-border">
                {g.items.map((a) => {
                  const start = new Date(a.starts_at);
                  const chat = a.contact?.conversations?.[0]?.id;
                  const upcoming = start.getTime() > nowMs;
                  return (
                    <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                      <div className="w-16 shrink-0 pt-0.5 text-sm font-semibold text-foreground">
                        {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{a.contact?.name || a.contact?.phone || "—"}</p>
                          <StatusBadge status={a.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {a.title} · {t("minutes", { count: a.duration_minutes })}
                        </p>
                        {a.location && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {a.location}
                          </p>
                        )}
                        <p className={cn("mt-0.5 text-xs", a.last_error ? "text-red-500" : "text-muted-foreground")}>
                          {a.last_error ? (
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {t("reminderFailed", { error: a.last_error })}
                            </span>
                          ) : (
                            reminderLine(a, t, remindersOff)
                          )}
                        </p>
                      </div>
                      <div className="flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
                        {chat && (
                          <Button size="sm" variant="outline" className="h-8" onClick={() => router.push(`/inbox?c=${chat}`)}>
                            <MessageSquare className="mr-1 h-3.5 w-3.5" />
                            {t("openChat")}
                          </Button>
                        )}
                        {canAct && upcoming && a.status !== "confirmed" && (
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setStatus(a, "confirmed")}>
                            {t("markConfirmed")}
                          </Button>
                        )}
                        {canAct && !upcoming && ["scheduled", "confirmed"].includes(a.status) && (
                          <>
                            <Button size="sm" className="h-8" onClick={() => setStatus(a, "completed")}>
                              {t("markCompleted")}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => setStatus(a, "no_show")}>
                              {t("markNoShow")}
                            </Button>
                          </>
                        )}
                        {canAct && (
                          <>
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(a)} aria-label={t("editTitle")}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {upcoming && a.status !== "cancelled" && (
                              <Button size="sm" variant="ghost" className="h-8 text-red-500" onClick={() => setStatus(a, "cancelled")}>
                                {t("markCancelled")}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <AppointmentDialog
          appointment={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <AppointmentsInner />
    </Suspense>
  );
}
