// Shared client-side types + helpers for the follow-ups UI.

export interface SequenceStep {
  id?: string;
  position: number;
  delay_days: number;
  template_name: string;
  template_language: string;
  variables: string[];
}

export interface Sequence {
  id: string;
  name: string;
  is_active: boolean;
  auto_enroll_new_contacts: boolean;
  steps: SequenceStep[];
}

export interface Enrollment {
  id: string;
  sequence_id: string;
  contact_id: string;
  status: "active" | "replied" | "completed" | "stopped" | "failed";
  next_step: number;
  next_run_at: string | null;
  last_sent_at: string | null;
  replied_at: string | null;
  last_error: string | null;
  updated_at: string;
  sequence?: { name: string; steps?: { id: string }[] } | null;
  contact?: { id: string; name: string | null; phone: string | null; conversations?: { id: string }[] } | null;
}

export async function sendJson(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : undefined };
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

/** "Today, 10:00 am" / "Tomorrow, …" / "Fri 28 Nov, …" in the viewer's locale. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(d) - dayStart(now)) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (diffDays >= -1 && diffDays <= 1) {
    const word = rtf.format(diffDays, "day");
    return `${word.charAt(0).toUpperCase()}${word.slice(1)}, ${time}`;
  }
  const date = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return `${date}, ${time}`;
}

/** Date → value for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
