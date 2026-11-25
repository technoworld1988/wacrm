"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AppointmentRow } from "./appointment-dialog";

const STYLES: Record<AppointmentRow["status"], string> = {
  scheduled: "bg-muted text-muted-foreground",
  confirmed: "bg-green-500/10 text-green-600 dark:text-green-400",
  reschedule_requested: "bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground line-through",
  completed: "bg-primary/10 text-primary",
  no_show: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export function StatusBadge({ status }: { status: AppointmentRow["status"] }) {
  const t = useTranslations("Appointments");
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STYLES[status])}>{t(`status_${status}`)}</span>;
}

type T = ReturnType<typeof useTranslations>;

/** One line about where the reminders stand. */
export function reminderLine(a: AppointmentRow, t: T, remindersOff: boolean): string {
  if (!a.reminders_enabled) return t("remindersOffForThis");
  if (a.hours_before_sent_at) return t("reminderSentShort");
  if (a.day_before_sent_at) return t("reminderSentDayBefore");
  if (remindersOff) return t("remindersNotSetUp");
  return t("reminderPending");
}
