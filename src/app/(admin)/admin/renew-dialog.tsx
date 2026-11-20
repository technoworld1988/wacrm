"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DURATIONS, DURATION_LABELS, type Duration } from "@/lib/platform/plans";
import { ErrorNote, PrimaryButton, SecondaryButton, api, formatDate } from "./ui";

export function RenewDialog({
  client,
  onClose,
  onDone,
}: {
  client: { id: string; name: string; planName: string | null; planEndsAt: string | null };
  onClose: () => void;
  onDone: () => void;
}) {
  const [duration, setDuration] = useState<Duration>("1m");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B1655]/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Renew ${client.name}`}>
      <div className="w-full max-w-md rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl">
        <h2 className="text-lg font-semibold text-foreground">Renew {client.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {client.planName ?? "No plan"} · currently ends {formatDate(client.planEndsAt)}. Renewing early adds to the current
          end date.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {DURATIONS.filter((d) => d !== "trial14").map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              className={cn(
                "h-11 rounded-lg border text-sm font-medium",
                duration === d ? "border-primary bg-primary-soft text-primary" : "border-input text-foreground hover:bg-muted",
              )}
            >
              {DURATION_LABELS[d]}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <ErrorNote message={error} />
        </div>
        <div className="mt-4 flex gap-2">
          <SecondaryButton type="button" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            type="button"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api(`/api/admin/clients/${client.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ action: "renew", duration }),
                });
                onDone();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Renewing…" : "Renew"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
