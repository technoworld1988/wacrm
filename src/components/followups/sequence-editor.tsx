"use client";

// Create / edit a follow-up sequence: a name, the auto-enroll switch
// and an ordered list of approved templates with a day gap each.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { countPlaceholders } from "@/lib/followups/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendJson, type Sequence, type SequenceStep } from "./shared";

interface TemplateOption {
  name: string;
  language: string | null;
  category: string;
  body_text: string;
}

interface Props {
  sequence: Sequence | null;
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT_DELAYS = [1, 2, 3, 4];

export function SequenceEditor({ sequence, onClose, onSaved }: Props) {
  const t = useTranslations("FollowUps");
  const [name, setName] = useState(sequence?.name ?? "");
  const [autoEnroll, setAutoEnroll] = useState(sequence?.auto_enroll_new_contacts ?? false);
  const [active, setActive] = useState(sequence?.is_active ?? true);
  const [steps, setSteps] = useState<SequenceStep[]>(
    sequence?.steps?.length
      ? sequence.steps.map((s) => ({ ...s, variables: Array.isArray(s.variables) ? s.variables : [] }))
      : [{ position: 0, delay_days: 1, template_name: "", template_language: "en_US", variables: [] }],
  );
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    createClient()
      .from("message_templates")
      .select("name, language, category, body_text")
      .eq("status", "APPROVED")
      .order("name", { ascending: true })
      .then(({ data }) => setTemplates((data ?? []) as TemplateOption[]));
  }, []);

  const byName = useMemo(() => {
    const m = new Map<string, TemplateOption>();
    for (const tpl of templates ?? []) m.set(`${tpl.name}|${tpl.language ?? "en_US"}`, tpl);
    return m;
  }, [templates]);

  const update = (i: number, patch: Partial<SequenceStep>) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const pickTemplate = (i: number, key: string) => {
    const tpl = byName.get(key);
    if (!tpl) return update(i, { template_name: "", variables: [] });
    const n = countPlaceholders(tpl.body_text);
    // Pre-fill {{1}} with the contact's first name — the usual opener.
    const vars = Array.from({ length: n }, (_, k) => steps[i].variables[k] ?? (k === 0 ? "{{first_name}}" : ""));
    update(i, { template_name: tpl.name, template_language: tpl.language ?? "en_US", variables: vars });
  };

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      {
        position: prev.length,
        delay_days: DEFAULT_DELAYS[Math.min(prev.length, DEFAULT_DELAYS.length - 1)],
        template_name: "",
        template_language: "en_US",
        variables: [],
      },
    ]);

  const save = async () => {
    setSaving(true);
    const body = {
      name,
      auto_enroll_new_contacts: autoEnroll,
      is_active: active,
      steps: steps.map((s) => ({
        delay_days: s.delay_days,
        template_name: s.template_name,
        template_language: s.template_language,
        variables: s.variables,
      })),
    };
    const res = sequence
      ? await sendJson(`/api/followups/sequences/${sequence.id}`, "PATCH", body)
      : await sendJson("/api/followups/sequences", "POST", body);
    setSaving(false);
    if (!res.ok) return toast.error(res.error ?? t("genericError"));
    toast.success(t("saved"));
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{sequence ? t("editSequence") : t("newSequence")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="seq-name">{t("fieldName")}</Label>
            <Input id="seq-name" value={name} maxLength={80} placeholder={t("namePlaceholder")} onChange={(e) => setName(e.target.value)} />
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Switch checked={autoEnroll} onCheckedChange={setAutoEnroll} />
            <span className="text-sm">
              <span className="font-medium text-foreground">{t("fieldAutoEnroll")}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t("fieldAutoEnrollHint")}</span>
            </span>
          </label>

          {sequence && (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={active} onCheckedChange={setActive} />
              <span className="text-foreground">{t("fieldActive")}</span>
            </label>
          )}

          {templates === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t("noApprovedTemplates")}</p>
          ) : (
            <ol className="space-y-2">
              {steps.map((s, i) => {
                const key = s.template_name ? `${s.template_name}|${s.template_language}` : "";
                const tpl = key ? byName.get(key) : undefined;
                return (
                  <li key={i}>
                    {i > 0 && <ArrowDown className="mx-auto mb-2 h-4 w-4 text-muted-foreground" />}
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{t("stepLabel", { n: i + 1 })}</span>
                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-red-500"
                            aria-label={t("removeStep")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("template")}</Label>
                          <select
                            value={key}
                            onChange={(e) => pickTemplate(i, e.target.value)}
                            className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                          >
                            <option value="">{t("chooseTemplate")}</option>
                            {templates.map((o) => (
                              <option key={`${o.name}|${o.language}`} value={`${o.name}|${o.language ?? "en_US"}`}>
                                {o.name} ({o.language ?? "en_US"} · {o.category})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{i === 0 ? t("delayFirst") : t("delayNext")}</Label>
                          <Input
                            type="number"
                            min={0}
                            max={60}
                            value={s.delay_days}
                            onChange={(e) => update(i, { delay_days: Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0))) })}
                          />
                        </div>
                      </div>
                      {tpl && <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground">{tpl.body_text}</p>}
                      {s.variables.map((v, k) => (
                        <div key={k} className="space-y-1">
                          <Label className="text-xs">{t("variableLabel", { n: k + 1 })}</Label>
                          <div className="flex gap-1.5">
                            <Input
                              value={v}
                              maxLength={200}
                              onChange={(e) =>
                                update(i, { variables: s.variables.map((x, j) => (j === k ? e.target.value : x)) })
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-9 shrink-0 text-xs"
                              onClick={() =>
                                update(i, { variables: s.variables.map((x, j) => (j === k ? "{{first_name}}" : x)) })
                              }
                            >
                              {t("insertFirstName")}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {templates && templates.length > 0 && steps.length < 10 && (
            <Button type="button" variant="outline" className="w-full" onClick={addStep}>
              <Plus className="mr-1 h-4 w-4" />
              {t("addStep")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{t("sameDayHint")}</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={saving || !name.trim() || steps.some((s) => !s.template_name)}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
