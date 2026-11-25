"use client";

// Follow-up block in the inbox contact panel: shows the running
// sequence (with Stop), lets an agent start one, and sets a manual
// "remind me" date that feeds the Follow-ups → Today list.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BellRing, Repeat, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { formatWhen, sendJson, toLocalInput, type Enrollment, type Sequence } from "./shared";

interface Props {
  contactId: string;
}

export function FollowUpPanel({ contactId }: Props) {
  const t = useTranslations("FollowUps");
  const canAct = useCan("send-messages");
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [latest, setLatest] = useState<Enrollment | null>(null);
  const [reminder, setReminder] = useState<{ at: string | null; note: string | null }>({ at: null, note: null });
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingReminder, setEditingReminder] = useState(false);
  const [reminderAt, setReminderAt] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("followup_sequences")
        .select("id, name, is_active, auto_enroll_new_contacts, steps:followup_steps(id, position)")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("followup_enrollments")
        .select("*, sequence:followup_sequences(name, steps:followup_steps(id))")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase.from("contacts").select("next_follow_up_at, follow_up_note").eq("id", contactId).maybeSingle(),
    ]).then(([seqRes, enrRes, contactRes]) => {
      if (cancelled) return;
      setSequences((seqRes.data ?? []) as unknown as Sequence[]);
      setLatest(((enrRes.data ?? [])[0] as unknown as Enrollment) ?? null);
      setReminder({
        at: (contactRes.data?.next_follow_up_at as string | null) ?? null,
        note: (contactRes.data?.follow_up_note as string | null) ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [contactId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const start = async () => {
    if (!chosen) return;
    setBusy(true);
    const res = await sendJson("/api/followups/enrollments", "POST", { sequence_id: chosen, contact_ids: [contactId] });
    setBusy(false);
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    if ((res.data?.alreadyRunning as number) > 0) toast.info(t("panelAlready"));
    else toast.success(t("panelStarted"));
    setChosen("");
    reload();
  };

  const stop = async () => {
    if (!latest) return;
    setBusy(true);
    const res = await sendJson(`/api/followups/enrollments/${latest.id}`, "DELETE");
    setBusy(false);
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    toast.success(t("panelStopped"));
    reload();
  };

  const saveReminder = async (at: string | null, note: string | null) => {
    setBusy(true);
    const res = await sendJson(`/api/contacts/${contactId}/follow-up`, "PATCH", { at, note });
    setBusy(false);
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    toast.success(at ? t("reminderSet") : t("reminderCleared"));
    setEditingReminder(false);
    reload();
  };

  const quick = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    setReminderAt(toLocalInput(d));
  };

  const running = latest?.status === "active" ? latest : null;
  const total = latest?.sequence?.steps?.length ?? 0;

  return (
    <div>
      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Repeat className="h-3 w-3" />
        {t("panelTitle")}
      </div>

      <div className="mt-2 space-y-2">
        {running ? (
          <div className="rounded-lg bg-muted px-3 py-2 text-xs">
            <p className="font-medium text-foreground">
              {t("panelRunning", {
                name: running.sequence?.name ?? "",
                step: Math.min(running.next_step + 1, Math.max(total, 1)),
                total: Math.max(total, 1),
              })}
            </p>
            {running.next_run_at && (
              <p className="mt-0.5 text-muted-foreground">{t("panelNext", { when: formatWhen(running.next_run_at) })}</p>
            )}
            {canAct && (
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={stop} disabled={busy}>
                <X className="mr-1 h-3 w-3" />
                {t("stop")}
              </Button>
            )}
          </div>
        ) : (
          <>
            {latest && (
              <p className="px-1 text-xs text-muted-foreground">
                {latest.status === "replied" && t("statusReplied")}
                {latest.status === "completed" && t("statusCompleted")}
                {latest.status === "stopped" && t("statusStopped")}
                {latest.status === "failed" && t("statusFailed", { error: latest.last_error ?? "" })}
              </p>
            )}
            {canAct &&
              (sequences.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {t("panelNoSequences")}{" "}
                  <Link href="/follow-ups?tab=sequences" className="text-primary underline">
                    {t("title")}
                  </Link>
                </p>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={chosen}
                    onChange={(e) => setChosen(e.target.value)}
                    aria-label={t("panelChoose")}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-muted px-2 text-xs text-foreground"
                  >
                    <option value="">{t("panelChoose")}</option>
                    {sequences.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" className="h-8 text-xs" onClick={start} disabled={!chosen || busy}>
                    {t("panelStart")}
                  </Button>
                </div>
              ))}
          </>
        )}

        {/* Manual reminder */}
        {reminder.at && !editingReminder ? (
          <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
            <BellRing className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground">{t("reminderAt", { when: formatWhen(reminder.at) })}</p>
              {reminder.note && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{reminder.note}</p>}
            </div>
            {canAct && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => saveReminder(null, null)}
                aria-label={t("reminderClear")}
                disabled={busy}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : canAct && !editingReminder ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-full text-xs"
            onClick={() => {
              quick(1);
              setReminderNote("");
              setEditingReminder(true);
            }}
          >
            <BellRing className="mr-1 h-3 w-3" />
            {t("reminder")}
          </Button>
        ) : null}

        {editingReminder && (
          <div className="space-y-2 rounded-lg border border-border p-2">
            <div className="flex flex-wrap gap-1">
              {[
                [1, "quickTomorrow"],
                [3, "quick3days"],
                [7, "quickWeek"],
              ].map(([days, key]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => quick(days as number)}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {t(key as string)}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
              aria-label={t("reminder")}
              className="h-8 w-full rounded-lg border border-border bg-muted px-2 text-xs text-foreground"
            />
            <textarea
              value={reminderNote}
              onChange={(e) => setReminderNote(e.target.value)}
              placeholder={t("reminderNote")}
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingReminder(false)}>
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!reminderAt || busy}
                onClick={() => saveReminder(new Date(reminderAt).toISOString(), reminderNote.trim() || null)}
              >
                {t("reminderSave")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
