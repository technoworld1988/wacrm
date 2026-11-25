"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  Check,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { endOfTodayIst } from "@/lib/followups/schedule";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { SequenceEditor } from "@/components/followups/sequence-editor";
import { formatWhen, sendJson, type Enrollment, type Sequence } from "@/components/followups/shared";

interface ReminderRow {
  id: string;
  name: string | null;
  phone: string | null;
  next_follow_up_at: string;
  follow_up_note: string | null;
  conversations?: { id: string }[];
}

const DAY = 86_400_000;

function FollowUpsInner() {
  const t = useTranslations("FollowUps");
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "sequences" ? "sequences" : "today";
  const { accountId } = useAuth();
  const canEdit = useCan("edit-settings");
  const canAct = useCan("send-messages");

  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [sending, setSending] = useState<Enrollment[]>([]);
  const [replied, setReplied] = useState<Enrollment[]>([]);
  const [failed, setFailed] = useState<Enrollment[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [runningBySeq, setRunningBySeq] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Sequence | "new" | null>(null);
  const [version, setVersion] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const supabase = createClient();
    const now = new Date();
    const eod = endOfTodayIst(now).toISOString();
    const contactSel = "contact:contacts(id, name, phone, conversations(id))";
    Promise.all([
      supabase
        .from("contacts")
        .select("id, name, phone, next_follow_up_at, follow_up_note, conversations(id)")
        .eq("account_id", accountId)
        .not("next_follow_up_at", "is", null)
        .lte("next_follow_up_at", eod)
        .order("next_follow_up_at", { ascending: true })
        .limit(100),
      supabase
        .from("followup_enrollments")
        .select(`*, ${contactSel}, sequence:followup_sequences(name, steps:followup_steps(id))`)
        .eq("account_id", accountId)
        .eq("status", "active")
        .lte("next_run_at", eod)
        .order("next_run_at", { ascending: true })
        .limit(100),
      supabase
        .from("followup_enrollments")
        .select(`*, ${contactSel}, sequence:followup_sequences(name)`)
        .eq("account_id", accountId)
        .eq("status", "replied")
        .gte("replied_at", new Date(now.getTime() - 3 * DAY).toISOString())
        .order("replied_at", { ascending: false })
        .limit(50),
      supabase
        .from("followup_enrollments")
        .select(`*, ${contactSel}, sequence:followup_sequences(name)`)
        .eq("account_id", accountId)
        .eq("status", "failed")
        .gte("updated_at", new Date(now.getTime() - 7 * DAY).toISOString())
        .order("updated_at", { ascending: false })
        .limit(50),
      fetch("/api/followups/sequences").then((r) => (r.ok ? r.json() : { sequences: [] })),
      supabase.from("followup_enrollments").select("sequence_id").eq("account_id", accountId).eq("status", "active"),
    ]).then(([rem, send, rep, fail, seqs, running]) => {
      if (cancelled) return;
      setReminders((rem.data ?? []) as unknown as ReminderRow[]);
      setSending((send.data ?? []) as unknown as Enrollment[]);
      setReplied((rep.data ?? []) as unknown as Enrollment[]);
      setFailed((fail.data ?? []) as unknown as Enrollment[]);
      setSequences(((seqs as { sequences?: Sequence[] }).sequences ?? []) as Sequence[]);
      const counts: Record<string, number> = {};
      for (const r of (running.data ?? []) as { sequence_id: string }[]) {
        counts[r.sequence_id] = (counts[r.sequence_id] ?? 0) + 1;
      }
      setRunningBySeq(counts);
      setNowMs(now.getTime());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, version]);

  const setTab = (next: "today" | "sequences") =>
    router.replace(next === "today" ? "/follow-ups" : "/follow-ups?tab=sequences", { scroll: false });

  const chatHref = (c?: { conversations?: { id: string }[] } | null) =>
    c?.conversations?.[0]?.id ? `/inbox?c=${c.conversations[0].id}` : null;

  const reminderAction = async (row: ReminderRow, kind: "done" | "tomorrow") => {
    let at: string | null = null;
    if (kind === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      at = d.toISOString();
    }
    const res = await sendJson(`/api/contacts/${row.id}/follow-up`, "PATCH", {
      at,
      note: kind === "tomorrow" ? row.follow_up_note : null,
    });
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    reload();
  };

  const stopEnrollment = async (e: Enrollment) => {
    const res = await sendJson(`/api/followups/enrollments/${e.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    toast.success(t("panelStopped"));
    reload();
  };

  const deleteSequence = async (s: Sequence) => {
    if (!(await confirmDialog(t("deleteConfirm"), { destructive: true }))) return;
    const res = await sendJson(`/api/followups/sequences/${s.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    toast.success(t("deleted"));
    reload();
  };

  const todayCount = reminders.length + sending.length + replied.length + failed.length;

  const contactLabel = (c?: { name: string | null; phone: string | null } | null) => c?.name || c?.phone || "—";

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {tab === "sequences" && canEdit && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" />
            {t("newSequence")}
          </Button>
        )}
      </div>

      <div className="inline-flex rounded-lg border border-border bg-muted p-1" role="tablist">
        {(["today", "sequences"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "today" ? t("tabToday") : t("tabSequences")}
            {k === "today" && !loading && todayCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{todayCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "today" ? (
        <div className="space-y-4">
          <Section icon={BellRing} title={t("todayReminders")} empty={t("todayRemindersEmpty")} count={reminders.length}>
            {reminders.map((r) => {
              const overdue = new Date(r.next_follow_up_at).getTime() < nowMs;
              const href = chatHref(r);
              return (
                <Row key={r.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{contactLabel(r)}</p>
                    <p className={cn("text-xs", overdue ? "text-red-500" : "text-muted-foreground")}>
                      {overdue ? t("overdue") : t("dueToday")} · {formatWhen(r.next_follow_up_at)}
                    </p>
                    {r.follow_up_note && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.follow_up_note}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {href && (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => router.push(href)}>
                        <MessageSquare className="mr-1 h-3.5 w-3.5" />
                        {t("openChat")}
                      </Button>
                    )}
                    {canAct && (
                      <>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => reminderAction(r, "tomorrow")}>
                          {t("snooze")}
                        </Button>
                        <Button size="sm" className="h-8" onClick={() => reminderAction(r, "done")}>
                          <Check className="mr-1 h-3.5 w-3.5" />
                          {t("markDone")}
                        </Button>
                      </>
                    )}
                  </div>
                </Row>
              );
            })}
          </Section>

          <Section icon={Reply} title={t("todayReplied")} empty={t("todayRepliedEmpty")} count={replied.length}>
            {replied.map((e) => {
              const href = chatHref(e.contact);
              return (
                <Row key={e.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{contactLabel(e.contact)}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.sequence?.name} · {t("repliedWhen", { when: formatWhen(e.replied_at ?? e.updated_at) })}
                    </p>
                  </div>
                  {href && (
                    <Button size="sm" className="h-8 shrink-0" onClick={() => router.push(href)}>
                      <MessageSquare className="mr-1 h-3.5 w-3.5" />
                      {t("openChat")}
                    </Button>
                  )}
                </Row>
              );
            })}
          </Section>

          <Section icon={Send} title={t("todaySending")} empty={t("todaySendingEmpty")} count={sending.length}>
            {sending.map((e) => {
              const total = Math.max(e.sequence?.steps?.length ?? 1, 1);
              return (
                <Row key={e.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{contactLabel(e.contact)}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.sequence?.name} · {t("stepOf", { step: Math.min(e.next_step + 1, total), total })}
                      {e.next_run_at && ` · ${formatWhen(e.next_run_at)}`}
                    </p>
                  </div>
                  {canAct && (
                    <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => stopEnrollment(e)}>
                      <X className="mr-1 h-3.5 w-3.5" />
                      {t("stop")}
                    </Button>
                  )}
                </Row>
              );
            })}
          </Section>

          {failed.length > 0 && (
            <Section icon={AlertTriangle} title={t("todayFailed")} empty="" count={failed.length} tone="warn">
              {failed.map((e) => {
                const href = chatHref(e.contact);
                return (
                  <Row key={e.id}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{contactLabel(e.contact)}</p>
                      <p className="line-clamp-2 text-xs text-red-500">
                        {e.sequence?.name} · {e.last_error ?? t("genericError")}
                      </p>
                    </div>
                    {href && (
                      <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => router.push(href)}>
                        {t("openChat")}
                      </Button>
                    )}
                  </Row>
                );
              })}
            </Section>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <p>{t("howItWorks")}</p>
            <p className="mt-2">{t("tipQuickReply")}</p>
          </div>
          {sequences.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium text-foreground">{t("noSequences")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("noSequencesHint")}</p>
            </div>
          ) : (
            sequences.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{s.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        {t("stepsCount", { count: s.steps.length })}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        {t("runningCount", { count: runningBySeq[s.id] ?? 0 })}
                      </span>
                      {s.auto_enroll_new_contacts && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{t("autoEnrollBadge")}</span>
                      )}
                      {!s.is_active && (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-500">{t("inactiveBadge")}</span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(s)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        {t("edit")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-red-500" onClick={() => deleteSequence(s)} aria-label={t("delete")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {s.steps.map((st, i) => (
                    <li key={st.id ?? i} className="flex gap-2">
                      <span className="w-24 shrink-0">
                        {st.delay_days === 0 ? t("sendNow") : t("afterDays", { count: st.delay_days })}
                      </span>
                      <span className="truncate font-mono text-foreground">{st.template_name}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </div>
      )}

      {editing && (
        <SequenceEditor
          sequence={editing === "new" ? null : editing}
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

function Section({
  icon: Icon,
  title,
  empty,
  count,
  tone,
  children,
}: {
  icon: typeof BellRing;
  title: string;
  empty: string;
  count: number;
  tone?: "warn";
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
        <Icon className={cn("h-4 w-4", tone === "warn" ? "text-red-500" : "text-primary")} />
        {title}
        <span className="text-muted-foreground">({count})</span>
      </h2>
      {count === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">{empty}</p> : <ul className="divide-y divide-border">{children}</ul>}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="flex flex-wrap items-center gap-3 px-4 py-3">{children}</li>;
}

export default function FollowUpsPage() {
  return (
    <Suspense fallback={null}>
      <FollowUpsInner />
    </Suspense>
  );
}
