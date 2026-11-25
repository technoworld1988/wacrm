"use client";

// Appointments block in the inbox contact panel: the next booking (if
// any) and a "Book" button with this contact already filled in.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { formatWhen } from "@/components/followups/shared";
import { AppointmentDialog, type AppointmentRow } from "./appointment-dialog";
import { StatusBadge } from "./status";

export function AppointmentPanel({ contact }: { contact: { id: string; name?: string | null; phone?: string | null } }) {
  const t = useTranslations("Appointments");
  const canAct = useCan("send-messages");
  const [next, setNext] = useState<AppointmentRow | null>(null);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("appointments")
      .select("*")
      .eq("contact_id", contact.id)
      .gte("starts_at", new Date(Date.now() - 3600_000).toISOString())
      .in("status", ["scheduled", "confirmed", "reschedule_requested"])
      .order("starts_at", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setNext(((data ?? [])[0] as AppointmentRow) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [contact.id, version]);

  return (
    <div>
      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <CalendarClock className="h-3 w-3" />
        {t("panelTitle")}
      </div>
      <div className="mt-2 space-y-2">
        {next ? (
          <div className="rounded-lg bg-muted px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{formatWhen(next.starts_at)}</p>
              <StatusBadge status={next.status} />
            </div>
            <p className="mt-0.5 text-muted-foreground">{next.title}</p>
          </div>
        ) : (
          !canAct && <p className="px-1 text-xs text-muted-foreground">{t("panelNone")}</p>
        )}
        {canAct && (
          <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            {t("panelBook")}
          </Button>
        )}
      </div>
      {open && (
        <AppointmentDialog
          contact={{ id: contact.id, name: contact.name ?? null, phone: contact.phone ?? null }}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
