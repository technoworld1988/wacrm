"use client";

// Account reminder settings: which approved template to send, what
// goes into its variables, and when (day before / N hours before).

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { countPlaceholders } from "@/lib/followups/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { sendJson } from "@/components/followups/shared";

interface Tpl {
  name: string;
  language: string | null;
  category: string;
  body_text: string;
}

export interface ReminderSettingsRow {
  template_name: string | null;
  template_language: string;
  variables: string[];
  remind_day_before: boolean;
  remind_hours_before: number | null;
}

const TOKENS = ["{{first_name}}", "{{date}}", "{{time}}", "{{title}}", "{{location}}"];
const DEFAULT_VARS = ["{{first_name}}", "{{date}}", "{{time}}", "{{title}}"];

export function ReminderSettings({
  initial,
  canEdit,
  onSaved,
}: {
  initial: ReminderSettingsRow | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("Appointments");
  const [templates, setTemplates] = useState<Tpl[] | null>(null);
  const [key, setKey] = useState(initial?.template_name ? `${initial.template_name}|${initial.template_language}` : "");
  const [vars, setVars] = useState<string[]>(initial?.variables ?? []);
  const [dayBefore, setDayBefore] = useState(initial?.remind_day_before ?? true);
  const [hours, setHours] = useState<number | null>(initial ? initial.remind_hours_before : 2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    createClient()
      .from("message_templates")
      .select("name, language, category, body_text")
      .eq("status", "APPROVED")
      .order("name")
      .then(({ data }) => setTemplates((data ?? []) as Tpl[]));
  }, []);

  const byKey = useMemo(() => new Map((templates ?? []).map((x) => [`${x.name}|${x.language ?? "en_US"}`, x])), [templates]);
  const tpl = key ? byKey.get(key) : undefined;

  const pick = (k: string) => {
    setKey(k);
    const n = countPlaceholders(byKey.get(k)?.body_text);
    setVars(Array.from({ length: n }, (_, i) => vars[i] ?? DEFAULT_VARS[i] ?? ""));
  };

  const save = async () => {
    setSaving(true);
    const [name, language] = key ? key.split("|") : [null, "en_US"];
    const res = await sendJson("/api/appointments/settings", "PUT", {
      template_name: name,
      template_language: language,
      variables: vars,
      remind_day_before: dayBefore,
      remind_hours_before: hours,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    toast.success(t("settingsSaved"));
    onSaved();
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="font-medium text-foreground">{t("settingsTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("settingsHint")}</p>
      </div>
      {templates === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>{t("reminderTemplate")}</Label>
            <select
              value={key}
              disabled={!canEdit}
              onChange={(e) => pick(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">{t("noTemplate")}</option>
              {templates.map((o) => (
                <option key={`${o.name}|${o.language}`} value={`${o.name}|${o.language ?? "en_US"}`}>
                  {o.name} ({o.language ?? "en_US"} · {o.category})
                </option>
              ))}
            </select>
            {templates.length === 0 && <p className="text-xs text-muted-foreground">{t("noApprovedTemplates")}</p>}
          </div>
          {tpl && <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground">{tpl.body_text}</p>}
          {vars.map((v, i) => (
            <div key={i} className="space-y-1">
              <Label className="text-xs">{t("variableLabel", { n: i + 1 })}</Label>
              <Input value={v} disabled={!canEdit} maxLength={200} onChange={(e) => setVars(vars.map((x, j) => (j === i ? e.target.value : x)))} />
              {canEdit && (
                <div className="flex flex-wrap gap-1">
                  {TOKENS.map((tok) => (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => setVars(vars.map((x, j) => (j === i ? tok : x)))}
                      className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {tok}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={dayBefore} onCheckedChange={setDayBefore} disabled={!canEdit} />
            {t("remindDayBefore")}
          </label>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{t("remindHoursBefore")}</span>
            <select
              value={hours ?? ""}
              disabled={!canEdit}
              onChange={(e) => setHours(e.target.value ? Number(e.target.value) : null)}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">{t("off")}</option>
              {[1, 2, 3, 4, 6, 12].map((h) => (
                <option key={h} value={h}>
                  {t("hoursBefore", { count: h })}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">{t("replyHint")}</p>
          {canEdit && (
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
