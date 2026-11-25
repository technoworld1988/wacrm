"use client";

// Book or edit an appointment: contact, what, when, how long, where.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { contactSearchFilter } from "@/lib/contacts/search-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendJson, toLocalInput } from "@/components/followups/shared";

export interface AppointmentRow {
  id: string;
  contact_id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  status: "scheduled" | "confirmed" | "reschedule_requested" | "cancelled" | "completed" | "no_show";
  reminders_enabled: boolean;
  day_before_sent_at: string | null;
  hours_before_sent_at: string | null;
  last_error: string | null;
  responded_at: string | null;
  contact?: { id: string; name: string | null; phone: string | null; conversations?: { id: string }[] } | null;
}

interface ContactOption {
  id: string;
  name: string | null;
  phone: string | null;
}

const DURATIONS = [15, 30, 45, 60, 90, 120];

export function AppointmentDialog({
  appointment,
  contact,
  onClose,
  onSaved,
}: {
  appointment?: AppointmentRow | null;
  contact?: ContactOption | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Appointments");
  const initialContact = appointment?.contact ?? contact ?? null;
  const [picked, setPicked] = useState<ContactOption | null>(initialContact);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [when, setWhen] = useState(() => {
    if (appointment) return toLocalInput(new Date(appointment.starts_at));
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
    return toLocalInput(d);
  });
  const [duration, setDuration] = useState(appointment?.duration_minutes ?? 30);
  const [location, setLocation] = useState(appointment?.location ?? "");
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [reminders, setReminders] = useState(appointment?.reminders_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (picked) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      let q = createClient().from("contacts").select("id, name, phone").order("updated_at", { ascending: false }).limit(8);
      const filter = contactSearchFilter(search);
      if (filter) q = q.or(filter);
      const { data } = await q;
      if (mine === seq.current) setOptions((data ?? []) as ContactOption[]);
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, picked]);

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    const body = {
      contact_id: picked.id,
      title,
      starts_at: new Date(when).toISOString(),
      duration_minutes: duration,
      location,
      notes,
      reminders_enabled: reminders,
    };
    const res = appointment
      ? await sendJson(`/api/appointments/${appointment.id}`, "PATCH", body)
      : await sendJson("/api/appointments", "POST", body);
    setSaving(false);
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    toast.success(appointment ? t("saved") : t("booked"));
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{appointment ? t("editTitle") : t("newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("contact")}</Label>
            {picked ? (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="truncate">{picked.name || picked.phone}</span>
                {!appointment && !contact && (
                  <button type="button" className="text-xs text-primary" onClick={() => setPicked(null)}>
                    {t("change")}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <Input autoFocus value={search} placeholder={t("searchContact")} onChange={(e) => setSearch(e.target.value)} />
                <ul className="max-h-44 overflow-y-auto rounded-lg border border-border">
                  {options.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-muted-foreground">{t("noContacts")}</li>
                  ) : (
                    options.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => setPicked(o)}
                          className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="truncate">{o.name || o.phone}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{o.phone}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appt-title">{t("what")}</Label>
            <Input id="appt-title" value={title} maxLength={120} placeholder={t("whatPlaceholder")} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="appt-when">{t("when")}</Label>
              <Input id="appt-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appt-dur">{t("duration")}</Label>
              <select
                id="appt-dur"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
              >
                {[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>
                    {t("minutes", { count: m })}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appt-loc">{t("location")}</Label>
            <Input id="appt-loc" value={location} maxLength={200} placeholder={t("locationPlaceholder")} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appt-notes">{t("notes")}</Label>
            <textarea
              id="appt-notes"
              value={notes}
              maxLength={1000}
              rows={2}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={reminders} onCheckedChange={setReminders} />
            {t("sendReminders")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={saving || !picked || !title.trim() || !when}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {appointment ? t("save") : t("book")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
